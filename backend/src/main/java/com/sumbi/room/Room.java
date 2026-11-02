package com.sumbi.room;

import com.sumbi.catalog.CustomizeCatalog;
import com.sumbi.player.Player;
import com.sumbi.protocol.LookInfo;
import com.sumbi.protocol.NickParts;
import com.sumbi.protocol.PlayerInfo;
import com.sumbi.protocol.ServerMessage;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

/**
 * 바다 하나 (최대 capacity 명). 방 안 상태는 이 객체의 잠금 안에서만 바꾼다.
 * 위치는 저장만 하고 snapshot() 이 틱마다 모아서 방송, 행동은 즉시 방송.
 */
public class Room {
    private static final Set<String> ACTIONS = Set.of("dive", "surface", "sumbi", "wave", "harvest");

    public final String id;
    public final int capacity;
    private final MovementValidator movement;
    private final long lookIntervalMs;
    private final long harvestIntervalMs;
    private final Map<Integer, Player> players = new LinkedHashMap<>();
    /** 빈 바다로 정리됨. 이후 입장은 거절 (배정과 정리가 엇갈려 목록에 없는 바다에 들어가는 일 방지) */
    private boolean closed;

    public Room(String id, int capacity, MovementValidator movement, long lookIntervalMs, long harvestIntervalMs) {
        this.id = id;
        this.capacity = capacity;
        this.movement = movement;
        this.lookIntervalMs = lookIntervalMs;
        this.harvestIntervalMs = harvestIntervalMs;
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
     *
     * <p>메시지는 잠금 안에서 보내지만 send() 는 연결의 전송 줄에 넣기만 해서 네트워크를 기다리지 않는다.
     * 잠금 안에서 줄에 넣어야 모든 해녀가 같은 순서(welcome → snap, join → leave)로 받는다.
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
        Player p = players.get(id);
        if (p == null) return;
        p.sink = null;
        p.detachedUntil = until;
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
        return p;
    }

    /** 유예 시간이 지난 끊긴 해녀 정리. 정리한 수 */
    public synchronized int removeExpired(long now) {
        List<Integer> expired = new ArrayList<>();
        for (Player p : players.values()) if (p.sink == null && p.detachedUntil > 0 && p.detachedUntil <= now) expired.add(p.id);
        for (int id : expired) remove(id);
        return expired.size();
    }

    /** 위치 저장 (방송은 snapshot 에서). 범위·속도 보정 */
    public synchronized void move(int id, double[] pos, double yaw, long now) {
        Player p = players.get(id);
        if (p == null) return;
        // 첫 위치는 거리 검사 없이 (범위만 보정)
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
     * 채집은 물속에서만, 1인당 harvestIntervalMs 간격.
     */
    public synchronized boolean act(int id, String action, String item, long now) {
        Player p = players.get(id);
        if (p == null || action == null || !ACTIONS.contains(action)) return false;
        switch (action) {
            case "dive" -> p.status = "underwater";
            case "surface" -> p.status = "surface";
            case "harvest" -> {
                if (!"underwater".equals(p.status) || item == null || !CustomizeCatalog.ITEMS.contains(item)) return false;
                if (now - p.lastHarvestAt < harvestIntervalMs) return false;
                p.lastHarvestAt = now;
            }
            default -> {}
        }
        broadcastExcept(new ServerMessage.Evt(id, action, "harvest".equals(action) ? item : null), id);
        return true;
    }

    /** 꾸미기 변경 (이미 검증된 값). lookIntervalMs 간격 제한 */
    public synchronized boolean changeLook(int id, NickParts nick, LookInfo look, long now) {
        Player p = players.get(id);
        if (p == null || now - p.lastLookAt < lookIntervalMs) return false;
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
            if (p.moved) {
                ps.add(p.snapEntry());
                p.moved = false;
            }
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
