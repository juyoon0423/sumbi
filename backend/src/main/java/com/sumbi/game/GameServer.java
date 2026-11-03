package com.sumbi.game;

import com.sumbi.catalog.CustomizeCatalog;
import com.sumbi.config.SumbiProperties;
import com.sumbi.admission.AdmissionService;
import com.sumbi.ops.Alerts;
import com.sumbi.player.Player;
import com.sumbi.protocol.ClientMessage;
import com.sumbi.protocol.LookInfo;
import com.sumbi.protocol.NickParts;
import com.sumbi.protocol.ServerMessage;
import com.sumbi.protocol.TodayStats;
import com.sumbi.room.Room;
import com.sumbi.room.RoomManager;
import com.sumbi.stats.DailyStats;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;
import java.util.random.RandomGenerator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 접속·입장·재접속·방송을 묶는 곳. WebSocket 핸들러가 연결/메시지/종료를 넘겨주고,
 * 스케줄러가 tick()(위치 스냅샷, 100ms)과 housekeeping()(1초)을 부른다.
 */
public class GameServer {
    private static final Logger log = LoggerFactory.getLogger(GameServer.class);

    /** 접속 하나의 상태 */
    static final class ClientState {
        volatile long lastSeen;
        volatile Room room;
        volatile Player player;
        /** 대기열에 있는 동안 보관한 hello */
        volatile ClientMessage.Hello pendingHello;
    }

    /** 재접속 토큰 → 마지막으로 있던 바다와 번호 */
    record Reservation(String roomId, int playerId, long expiresAt) {}

    private final SumbiProperties props;
    private final CustomizeCatalog catalog;
    private final RoomManager rooms;
    private final AdmissionService<Client> admission;
    private final DailyStats stats;
    private final LongSupplier clock;
    private final RandomGenerator random;

    private final Map<Client, ClientState> clients = new ConcurrentHashMap<>();
    private final Map<String, Reservation> reservations = new ConcurrentHashMap<>();
    private long todaySentVersion = -1;
    private long todaySentAt;
    /** 자리 제안(slot)을 기다려 주는 시간 */
    private final long offerMs;
    private volatile Alerts alerts = Alerts.NONE;
    /** 서버 종료 중: 새 입장 받지 않음 */
    private volatile boolean closing;
    /** 상한·대기 알림: 상태가 바뀐 순간에만 (같은 상태가 이어지면 다시 안 보냄) */
    private boolean wasFull;
    private boolean hadWaiting;

    public GameServer(SumbiProperties props, CustomizeCatalog catalog, RoomManager rooms, DailyStats stats,
            LongSupplier clock, RandomGenerator random) {
        this(props, catalog, rooms, stats, clock, random, 45_000);
    }

    public GameServer(SumbiProperties props, CustomizeCatalog catalog, RoomManager rooms, DailyStats stats,
            LongSupplier clock, RandomGenerator random, long offerMs) {
        this.offerMs = offerMs;
        this.props = props;
        this.catalog = catalog;
        this.rooms = rooms;
        this.admission = new AdmissionService<>(props.maxTotal());
        this.stats = stats;
        this.clock = clock;
        this.random = random;
    }

    // ── 연결 ──

    public void connected(Client c) {
        ClientState s = new ClientState();
        s.lastSeen = clock.getAsLong();
        clients.put(c, s);
    }

    public void received(Client c, ClientMessage msg) {
        ClientState s = clients.get(c);
        if (s == null) return;
        long now = clock.getAsLong();
        s.lastSeen = now;
        switch (msg) {
            case ClientMessage.Ping ping -> c.send(new ServerMessage.Pong(ping.ts()));
            case ClientMessage.Hello hello -> hello(c, s, hello);
            case ClientMessage.Move move -> {
                if (s.player != null) s.room.move(s.player.id, move.p(), move.r(), now);
            }
            case ClientMessage.Act act -> {
                if (s.player != null && s.room.act(s.player.id, act.a(), act.item(), now) && "harvest".equals(act.a())) {
                    stats.recordHarvest(act.item());
                }
            }
            case ClientMessage.Look look -> {
                if (s.player == null) return;
                if (!catalog.isValid(look.nick()) || !catalog.isValid(look.look())) {
                    c.send(new ServerMessage.Err("BAD_LOOK", "unknown nickname word or color"));
                    return;
                }
                s.room.changeLook(s.player.id, look.nick(), look.look(), now);
            }
            case ClientMessage.Zone zone -> {
                if (s.player != null) s.room.changeZone(s.player.id, zone.to(), now);
            }
            case ClientMessage.Prep prep -> {
                if (s.player != null) s.room.prep(s.player.id, prep.item(), now);
            }
            case ClientMessage.Seat seat -> {
                if (s.player != null) s.room.requestSeat(s.player.id, seat.seat(), now);
            }
            case ClientMessage.Enter enter -> acceptSlot(c, s);
        }
    }

    /** hello·대기열 입장과 같은 잠금: 같은 토큰의 재접속과 끊김 처리가 엇갈리지 않게 */
    public synchronized void disconnected(Client c, boolean abnormal) {
        ClientState s = clients.remove(c);
        admission.remove(c);
        if (s == null || s.player == null) {
            offerWaiting();
            return;
        }
        long now = clock.getAsLong();
        Room room = s.room;
        Player p = s.player;
        reservations.put(p.token, new Reservation(room.id, p.id, now + props.reconnectGraceMs()));
        if (abnormal) {
            // 잠깐 끊김: 유예 시간 동안 자리를 지켜 둠 (다른 사람에겐 잠시 멈춘 것처럼 보임)
            room.detach(p.id, now, now + props.reconnectGraceMs());
        } else {
            room.remove(p.id);
            rooms.removeIfEmpty(room);
            offerWaiting();
        }
    }

    // ── 입장 ──

    private synchronized void hello(Client c, ClientState s, ClientMessage.Hello hello) {
        if (s.player != null || s.pendingHello != null || closing) return; // 이미 입장했거나 대기 중, 또는 서버 종료 중
        NickParts nick = catalog.sanitize(hello.nick());
        LookInfo look = catalog.sanitize(hello.look());
        String token = validToken(hello.token()) ? hello.token() : UUID.randomUUID().toString();
        ClientMessage.Hello fixed = new ClientMessage.Hello(1, token, hello.device(), nick, look);

        // 잠깐 끊겼던 해녀가 돌아옴 → 같은 번호, 같은 자리
        Reservation r = reservations.get(token);
        if (r != null) {
            Room room = rooms.find(r.roomId());
            TodayStats today = stats.snapshot();
            Player back = room == null ? null : room.reattach(r.playerId(), token, c, nick, look, p -> welcome(room, p, today));
            if (back != null) {
                s.room = room;
                s.player = back;
                reservations.remove(token);
                log.info("reattached {} #{} ({})", room.id, back.id, nick.display());
                return;
            }
        }

        if (admission.canEnter(rooms.totalPlayers())) {
            enter(c, s, fixed);
        } else {
            s.pendingHello = fixed;
            int ahead = admission.enqueue(c);
            c.send(new ServerMessage.Queue(ahead, admission.etaSeconds(ahead, clock.getAsLong())));
            log.info("queued (ahead {}, waiting {})", ahead, admission.waitingCount());
            checkAlerts();
            offerWaiting();
        }
    }

    /** 자리 제안을 받은 사람이 들어오겠다고 함 */
    private synchronized void acceptSlot(Client c, ClientState s) {
        if (s.player != null || s.pendingHello == null || closing) return;
        long now = clock.getAsLong();
        if (admission.accept(c, now)) {
            enter(c, s, s.pendingHello);
        } else {
            // 제안이 이미 끝났으면 지금 순번을 다시 알려 줌
            int ahead = admission.position(c);
            if (ahead >= 0) c.send(new ServerMessage.Queue(ahead, admission.etaSeconds(ahead, now)));
        }
    }

    private void enter(Client c, ClientState s, ClientMessage.Hello hello) {
        Reservation r = reservations.remove(hello.token());
        Room room = r == null ? null : rooms.find(r.roomId());
        Integer preferredId = room != null && !room.isFull() ? r.playerId() : null;
        if (room == null || room.isFull()) room = rooms.assign();
        // 집계는 방 잠금 밖에서 미리 (나중에 Redis 가 되어도 방을 붙잡지 않게)
        TodayStats today = stats.snapshot();
        Player p = null;
        for (int attempt = 0; p == null && attempt < 10; attempt++) {
            Room target = room;
            p = target.join(hello.token(), hello.nick(), hello.look(), spawn(), c, preferredId, pl -> welcome(target, pl, today));
            if (p == null) room = rooms.assign();
            else s.room = target;
        }
        if (p == null) {
            c.send(new ServerMessage.Err("FULL", "no room"));
            return;
        }
        s.player = p;
        s.pendingHello = null;
        stats.recordDiver(hello.token());
        log.info("joined {} #{} ({}) total={}", s.room.id, p.id, hello.nick().display(), rooms.totalPlayers());
        checkAlerts();
    }

    private ServerMessage welcome(Room room, Player p, TodayStats today) {
        return new ServerMessage.Welcome(
            new ServerMessage.You(p.id, p.nick.display(), p.token, p.look, p.info().p()),
            new ServerMessage.RoomInfo(room.id, room.capacity),
            room.infosExcept(p.id),
            today);
    }

    /** 처음 위치: 테왁끼리 겹치지 않게 시작점 주변에 흩어 놓음 */
    private double[] spawn() {
        double a = random.nextDouble() * Math.PI * 2;
        double d = 1.5 + random.nextDouble() * 3.5;
        return new double[] {Math.sin(a) * d, 0, 8 + Math.cos(a) * d};
    }

    private static boolean validToken(String token) {
        return token != null && token.length() >= 8 && token.length() <= 64 && token.matches("[A-Za-z0-9-]+");
    }

    /** 인원 세기 → 앞사람에게 자리 제안을 한 잠금 안에서 (동시에 두 번 불려 상한을 넘기지 않게) */
    private synchronized void offerWaiting() {
        if (closing) return;
        for (Client c : admission.offer(rooms.totalPlayers(), clock.getAsLong(), offerMs)) {
            ClientState s = clients.get(c);
            if (s == null || s.pendingHello == null) {
                admission.remove(c);
                continue;
            }
            c.send(new ServerMessage.Slot(offerMs));
            log.info("slot offered (waiting {})", admission.waitingCount());
        }
    }

    /** 상한에 닿은 순간·대기가 생긴 순간만 알림 (간격 제한은 Alerts 가) */
    private synchronized void checkAlerts() {
        int total = rooms.totalPlayers();
        int max = admission.maxTotal();
        boolean full = total >= max;
        int waitingNow = admission.waitingCount() + admission.offerCount();
        if (full && !wasFull) alerts.send("full", "🌊 바다가 가득 찼어요: " + total + " / " + max + "명");
        if (waitingNow > 0 && !hadWaiting) alerts.send("queue", "⏳ 대기 시작: " + waitingNow + "명이 기다려요 (상한 " + max + "명)");
        wasFull = full;
        hadWaiting = waitingNow > 0;
    }

    // ── 운영 ──

    public void setAlerts(Alerts alerts) {
        this.alerts = alerts == null ? Alerts.NONE : alerts;
    }

    public int maxTotal() {
        return admission.maxTotal();
    }

    /** 전체 상한을 바꿈 (서버를 끄지 않고). 올리면 기다리던 사람에게 바로 자리 제안 */
    public synchronized void setMaxTotal(int maxTotal) {
        int before = admission.maxTotal();
        if (before == maxTotal) return;
        admission.setMaxTotal(maxTotal);
        log.info("max total {} -> {}", before, maxTotal);
        alerts.send("cap", "⚙️ 동시접속 상한 " + before + " → " + maxTotal + "명 (지금 " + rooms.totalPlayers() + "명, 대기 " + admission.waitingCount() + "명)");
        offerWaiting();
        checkAlerts();
    }

    /** 서버 종료 시작: 새 입장·자리 제안을 멈춤 (연결 닫기는 WebSocket 핸들러가) */
    public void beginShutdown() {
        closing = true;
    }

    public boolean isClosing() {
        return closing;
    }

    // ── 주기 작업 ──

    /** 100ms: 방마다 움직인 해녀 위치를 묶어 방송 */
    public void tick() {
        long now = clock.getAsLong();
        for (Room room : rooms.rooms()) {
            room.snapshot(now);
            room.tickBasin(now);
        }
    }

    /** 1초: 끊긴 연결 정리, 유예 만료, 대기열, 오늘의 바다 */
    public void housekeeping() {
        long now = clock.getAsLong();
        for (var e : clients.entrySet()) {
            if (now - e.getValue().lastSeen > props.heartbeatTimeoutMs()) {
                log.info("heartbeat timeout");
                e.getKey().close(true);
            }
        }
        for (Room room : rooms.rooms()) {
            room.removeExpired(now);
            rooms.removeIfEmpty(room);
        }
        reservations.values().removeIf(r -> r.expiresAt() <= now);
        synchronized (this) {
            // 답이 없던 자리 제안은 거두고 맨 뒤로 → 다음 사람에게
            int expired = admission.expire(now).size();
            if (expired > 0) log.info("{} slot offer(s) expired, back to queue", expired);
            offerWaiting();
            for (Client c : admission.waitingList()) {
                int ahead = admission.position(c);
                c.send(new ServerMessage.Queue(ahead, admission.etaSeconds(ahead, now)));
            }
            checkAlerts();
        }

        long v = stats.version();
        if (v != todaySentVersion && now - todaySentAt >= props.todayIntervalMs()) {
            todaySentVersion = v;
            todaySentAt = now;
            ServerMessage today = ServerMessage.Today.of(stats.snapshot());
            for (Room room : rooms.rooms()) room.broadcast(today);
        }
    }

    // ── 조회 (테스트·상태 확인용) ──

    public RoomManager rooms() {
        return rooms;
    }

    public int waitingCount() {
        return admission.waitingCount() + admission.offerCount();
    }
}
