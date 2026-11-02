package com.sumbi.room;

import com.sumbi.catalog.CustomizeCatalog;
import com.sumbi.player.Player;
import com.sumbi.protocol.LookInfo;
import com.sumbi.protocol.NickParts;
import com.sumbi.protocol.PlayerInfo;
import com.sumbi.protocol.ServerMessage;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

/**
 * 바다 하나 (최대 capacity 명) + 그 바다의 불턱. 방 안 상태는 이 객체의 잠금 안에서만 바꾼다.
 * 위치는 저장만 하고 snapshot() 이 틱마다 모아서 방송, 행동은 즉시 방송.
 *
 * <p>메시지는 잠금 안에서 보내지만 send() 는 연결의 전송 줄에 넣기만 해서 네트워크를 기다리지 않는다.
 * 잠금 안에서 줄에 넣어야 모든 해녀가 같은 순서(welcome → snap, join → leave)로 받는다.
 */
public class Room {
    /** 바다에서 할 수 있는 행동 */
    private static final Set<String> SEA_ACTIONS = Set.of("dive", "surface", "sumbi", "wave", "harvest", "float", "float_end");
    /** 불턱에서 할 수 있는 행동 */
    private static final Set<String> BULTEOK_ACTIONS = Set.of("wave", "tangerine", "doze", "wake");

    /** 방 설정 */
    public record Settings(
        int capacity, long lookIntervalMs, long harvestIntervalMs,
        /** 손질 모션 길이: 이만큼 뒤에 대야에 들어가고, 그 전엔 새 손질 무시 */
        long prepMs,
        /** 귤 까먹기 길이 */
        long restMs,
        int basinCapacity, long basinCelebrateMs) {

        public static Settings defaults(int capacity, long lookIntervalMs, long harvestIntervalMs) {
            return new Settings(capacity, lookIntervalMs, harvestIntervalMs, 3_000, 4_000, 20, 4_000);
        }
    }

    public final String id;
    public final int capacity;
    private final Settings settings;
    private final MovementValidator movement;
    private final PrepLedger ledger;
    private final Map<Integer, Player> players = new LinkedHashMap<>();
    private final Basin basin;
    /** 빈 바다로 정리됨. 이후 입장은 거절 (배정과 정리가 엇갈려 목록에 없는 바다에 들어가는 일 방지) */
    private boolean closed;

    public Room(String id, Settings settings, MovementValidator movement, PrepLedger ledger) {
        this.id = id;
        this.capacity = settings.capacity();
        this.settings = settings;
        this.movement = movement;
        this.ledger = ledger;
        this.basin = new Basin(settings.basinCapacity(), settings.basinCelebrateMs());
    }

    /** 테스트·간단한 구성용 */
    public Room(String id, int capacity, MovementValidator movement, long lookIntervalMs, long harvestIntervalMs) {
        this(id, Settings.defaults(capacity, lookIntervalMs, harvestIntervalMs), movement, new PrepLedger(Clock.systemUTC()));
    }

    public synchronized int size() {
        return players.size();
    }

    public synchronized boolean isFull() {
        return closed || players.size() >= capacity;
    }

    public synchronized boolean isEmpty() {
        return players.isEmpty();
    }

    /** 비어 있으면 닫고 true. 닫힌 바다에는 아무도 못 들어옴 */
    public synchronized boolean closeIfEmpty() {
        if (players.isEmpty()) closed = true;
        return closed;
    }

    public synchronized boolean isClosed() {
        return closed;
    }

    public synchronized Player get(int id) {
        return players.get(id);
    }

    /** 다른 해녀 목록 (welcome 용) */
    public synchronized List<PlayerInfo> infosExcept(int exceptId) {
        List<PlayerInfo> list = new ArrayList<>();
        for (Player p : players.values()) if (p.id != exceptId) list.add(p.info());
        return list;
    }

    /**
     * 입장. preferredId 가 비어 있으면 그 번호(재접속), 아니면 가장 작은 빈 번호.
     * 다른 사람들에게 join 방송. 꽉 찼거나 이미 정리된 바다면 null.
     */
    public synchronized Player join(
            String token, NickParts nick, LookInfo look, double[] spawn, MessageSink sink, Integer preferredId,
            Function<Player, ServerMessage> welcome) {
        if (closed || players.size() >= capacity) return null;
        int id = preferredId != null && preferredId > 0 && !players.containsKey(preferredId) ? preferredId : nextFreeId();
        Player p = new Player(id, token, nick, look, spawn, sink);
        players.put(id, p);
        // 잠금 안에서 welcome 을 먼저 보내야 이 해녀가 welcome 보다 snap 을 먼저 받는 일이 없음
        if (welcome != null) p.send(welcome.apply(p));
        broadcastExcept(new ServerMessage.Join(p.info()), id);
        return p;
    }

    private int nextFreeId() {
        int id = 1;
        while (players.containsKey(id)) id++;
        return id;
    }

    /** 퇴장 + leave 방송 */
    public synchronized boolean remove(int id) {
        Player p = players.remove(id);
        if (p == null) return false;
        p.sink = null;
        broadcastExcept(new ServerMessage.Leave(id), id);
        return true;
    }

    /** 연결이 잠깐 끊김: 방에는 남겨 두고(다른 사람에겐 멈춰 보임) 유예 시간 뒤 정리 */
    public synchronized void detach(int id, long until) {
        detach(id, 0, until);
    }

    /** 자리를 옮겨 걷는 중에 끊기면 목적지 자리를 비우고 바다로 (돌아오면 바다에서 시작) */
    public synchronized void detach(int id, long now, long until) {
        Player p = players.get(id);
        if (p == null) return;
        p.sink = null;
        p.detachedUntil = until;
        if (p.inBulteok() && now < p.walkUntil) leaveBulteok(p, now);
    }

    /** 같은 토큰으로 돌아옴 */
    public synchronized Player reattach(int id, String token, MessageSink sink, NickParts nick, LookInfo look,
            Function<Player, ServerMessage> welcome) {
        Player p = players.get(id);
        if (p == null || !p.token.equals(token) || p.sink != null) return null;
        p.sink = sink;
        p.detachedUntil = 0;
        if (!nick.equals(p.nick) || !look.equals(p.look)) {
            p.nick = nick;
            p.look = look;
            broadcastExcept(new ServerMessage.LookChanged(id, nick.display(), look), id);
        }
        if (welcome != null) p.send(welcome.apply(p));
        // 불턱에 있던 채로 돌아오면 자리·대야를 다시 알려 줌
        if (p.inBulteok()) {
            p.send(new ServerMessage.ZoneChanged(id, p.zone, p.seat, null, ledger.left(token)));
            p.send(basin.state());
        }
        return p;
    }

    /** 유예 시간이 지난 끊긴 해녀 정리. 정리한 수 */
    public synchronized int removeExpired(long now) {
        List<Integer> expired = new ArrayList<>();
        for (Player p : players.values()) if (p.sink == null && p.detachedUntil > 0 && p.detachedUntil <= now) expired.add(p.id);
        for (int id : expired) remove(id);
        return expired.size();
    }

    /** 위치 저장 (방송은 snapshot 에서). 범위·속도 보정. 불턱에 앉아 있으면 무시 */
    public synchronized void move(int id, double[] pos, double yaw, long now) {
        Player p = players.get(id);
        if (p == null || p.inBulteok()) return;
        // 첫 위치(또는 구역을 옮긴 직후)는 거리 검사 없이 (범위만 보정)
        double[] fixed = p.lastMoveAt == 0
            ? movement.correct(null, 0, pos)
            : movement.correct(p.pos, now - p.lastMoveAt, pos);
        System.arraycopy(fixed, 0, p.pos, 0, 3);
        p.yaw = Double.isFinite(yaw) ? yaw : p.yaw;
        p.lastMoveAt = now;
        p.moved = true;
    }

    /**
     * 행동: 즉시 다른 사람들에게 evt 방송. 받아들였으면 true (채집이면 오늘의 집계에 더함).
     * 채집은 바다 물속에서만, 1인당 harvestIntervalMs 간격. 쉬기 동작은 불턱에서만, 둥둥(물 위에 누워 하늘 보기)은 바다 수면에서만.
     */
    public synchronized boolean act(int id, String action, String item, long now) {
        Player p = players.get(id);
        if (p == null || action == null) return false;
        boolean bulteok = p.inBulteok();
        if (!(bulteok ? BULTEOK_ACTIONS : SEA_ACTIONS).contains(action)) return false;
        switch (action) {
            case "dive" -> {
                p.status = "underwater";
                p.floating = false;
            }
            case "surface" -> p.status = "surface";
            case "harvest" -> {
                if (!"underwater".equals(p.status) || item == null || !CustomizeCatalog.ITEMS.contains(item)) return false;
                if (now - p.lastHarvestAt < settings.harvestIntervalMs()) return false;
                p.lastHarvestAt = now;
                ledger.addHarvest(p.token, item);
            }
            case "float" -> {
                if (!"surface".equals(p.status) || p.floating) return false;
                p.floating = true;
            }
            case "float_end" -> {
                if (!p.floating) return false;
                p.floating = false;
            }
            case "tangerine" -> {
                if (now < p.prepUntil || now < p.restUntil || now < p.walkUntil) return false;
                p.restUntil = now + settings.restMs();
                p.dozing = false;
            }
            case "doze" -> {
                if (now < p.prepUntil || p.dozing || now < p.walkUntil) return false;
                p.dozing = true;
            }
            case "wake" -> {
                if (!p.dozing) return false;
                p.dozing = false;
            }
            default -> {}
        }
        broadcastExcept(new ServerMessage.Evt(id, action, "harvest".equals(action) ? item : null), id);
        return true;
    }

    /**
     * 바다 ↔ 불턱. 불턱은 수면에 있을 때만, 들어가면 빈자리(안쪽 원부터)에 앉음.
     * 모두에게 zone 방송 (본인에게는 손질할 수 있는 개수 + 지금 대야도).
     */
    public synchronized boolean changeZone(int id, String to, long now) {
        Player p = players.get(id);
        if (p == null || to == null || now - p.lastZoneAt < 500) return false;
        if ("bulteok".equals(to)) {
            if (p.inBulteok() || !"surface".equals(p.status)) return false;
            p.zone = "bulteok";
            p.seat = freeSeat();
            p.floating = false;
            p.dozing = false;
            p.moved = false;
            p.lastZoneAt = now;
            broadcastExcept(new ServerMessage.ZoneChanged(id, p.zone, p.seat, null, null), id);
            p.send(new ServerMessage.ZoneChanged(id, p.zone, p.seat, null, ledger.left(p.token)));
            p.send(basin.state());
            return true;
        }
        if ("sea".equals(to)) {
            if (!p.inBulteok()) return false;
            leaveBulteok(p, now);
            return true;
        }
        return false;
    }

    /** 불턱 → 바다 (자리를 비움). 모두에게 zone 방송 */
    private void leaveBulteok(Player p, long now) {
        p.zone = "sea";
        p.seat = -1;
        p.status = "surface";
        p.dozing = false;
        p.prepUntil = 0;
        p.restUntil = 0;
        p.walkUntil = 0;
        double[] back = seaReturn(p.id);
        System.arraycopy(back, 0, p.pos, 0, 3);
        p.yaw = Math.PI; // 바다 쪽을 보며
        p.lastMoveAt = 0; // 다음 위치는 거리 검사 없이
        p.lastZoneAt = now;
        broadcast(new ServerMessage.ZoneChanged(p.id, p.zone, null, Player.round(p.pos), null));
    }

    /**
     * 불턱에서 다른 자리로 옮겨 앉기. 앉을 수 있는 자리(0~23)이고 아무도 없거나 가는 중이 아니면 승인:
     * 원래 자리는 바로 비고 목적지는 걷는 동안에도 내 자리. 모두에게 seat(from → to) 방송.
     * 이미 찬 자리면 본인에게만 seat_no. 손질·귤 까먹기 중엔 거절. 걷는 중에 다른 자리를 고르면 방향을 바꿈.
     * 방 잠금 안에서 확인·배정하므로 같은 자리를 동시에 눌러도 먼저 온 요청만 승인됨.
     */
    public synchronized boolean requestSeat(int id, Integer seat, long now) {
        Player p = players.get(id);
        if (p == null || !p.inBulteok() || seat == null || seat == p.seat) return false;
        boolean taken = false;
        for (Player q : players.values()) if (q != p && q.inBulteok() && q.seat == seat) taken = true;
        if (seat < 0 || seat >= SeatPath.RING_SEATS || taken || now < p.prepUntil || now < p.restUntil) {
            p.send(new ServerMessage.SeatDenied(seat));
            return false;
        }
        int from = p.seat;
        p.seat = seat;
        p.dozing = false;
        p.walkUntil = now + SeatPath.walkMs(from, seat);
        broadcast(new ServerMessage.SeatMove(id, from, seat));
        return true;
    }

    /** 가장 작은 빈자리 (0~11 안쪽 원, 12~23 바깥 원, 그 뒤는 담 밖에서 서서) */
    private int freeSeat() {
        Set<Integer> used = new HashSet<>();
        for (Player q : players.values()) if (q.inBulteok()) used.add(q.seat);
        int s = 0;
        while (used.contains(s)) s++;
        return s;
    }

    /** 불턱에서 바다로 돌아올 자리: 불턱 아래 바닷가, 번호마다 조금씩 떨어뜨림 */
    static double[] seaReturn(int id) {
        return new double[] {16 + ((id * 37) % 7 - 3) * 0.9, 0, -24 + ((id * 13) % 5 - 2) * 0.9};
    }

    /**
     * 손질 시작: 불턱에 앉아 있고, 그 종류를 오늘 딴 개수 − 손질한 개수 > 0 일 때만.
     * 진행 중인 손질·귤 까먹기가 끝나기 전엔 무시. 모두에게 prep 방송, prepMs 뒤 대야 +1.
     */
    public synchronized boolean prep(int id, String item, long now) {
        Player p = players.get(id);
        if (p == null || !p.inBulteok() || item == null || !CustomizeCatalog.ITEMS.contains(item)) return false;
        if (now < p.prepUntil || now < p.restUntil || now < p.walkUntil) return false;
        int left = ledger.tryPrep(p.token, item);
        if (left < 0) {
            p.send(new ServerMessage.Err("NO_ITEM", "harvest it in the sea first"));
            return false;
        }
        p.prepUntil = now + settings.prepMs();
        p.dozing = false;
        basin.schedule(p.prepUntil);
        broadcast(new ServerMessage.Prep(id, item, "tap", left));
        return true;
    }

    /** 틱마다: 끝난 손질을 대야에 넣고, 가득 찬 대야를 비움 */
    public synchronized void tickBasin(long now) {
        int inBulteok = 0;
        for (Player p : players.values()) if (p.inBulteok()) inBulteok++;
        int next = Math.max(12, Math.min(40, inBulteok * 4));
        for (ServerMessage.Basin b : basin.tick(now, next)) broadcast(b);
    }

    public synchronized ServerMessage.Basin basinState() {
        return basin.state();
    }

    /** 꾸미기 변경 (이미 검증된 값). lookIntervalMs 간격 제한 */
    public synchronized boolean changeLook(int id, NickParts nick, LookInfo look, long now) {
        Player p = players.get(id);
        if (p == null || now - p.lastLookAt < settings.lookIntervalMs()) return false;
        p.lastLookAt = now;
        p.nick = nick;
        p.look = look;
        broadcastExcept(new ServerMessage.LookChanged(id, nick.display(), look), id);
        return true;
    }

    /** 이번 틱에 움직인 해녀들을 묶어 한 번에 방송. 보낼 게 없으면 null */
    public synchronized ServerMessage.Snap snapshot(long ts) {
        List<double[]> ps = new ArrayList<>();
        for (Player p : players.values()) {
            if (p.moved && !p.inBulteok()) ps.add(p.snapEntry());
            p.moved = false;
        }
        if (ps.isEmpty()) return null;
        ServerMessage.Snap snap = new ServerMessage.Snap(ts, ps);
        broadcastExcept(snap, -1);
        return snap;
    }

    public synchronized void broadcast(ServerMessage message) {
        broadcastExcept(message, -1);
    }

    private void broadcastExcept(ServerMessage message, int exceptId) {
        for (Player p : players.values()) if (p.id != exceptId) p.send(message);
    }

    public synchronized Collection<Player> playersView() {
        return List.copyOf(players.values());
    }
}
