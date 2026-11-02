package com.sumbi.room;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/** 바다(방) 배정: 사람이 있는 바다부터 채우고, 모두 꽉 차면 새 바다. 빈 바다는 정리 */
public class RoomManager {
    private final int capacity;
    private final Function<String, Room> factory;
    private final Map<String, Room> rooms = new LinkedHashMap<>();
    private int counter;

    public RoomManager(int capacity, Function<String, Room> factory) {
        this.capacity = capacity;
        this.factory = factory;
    }

    /** 자리가 있는 바다 (먼저 만든 바다부터 채움). 없으면 새로 만듦 */
    public synchronized Room assign() {
        for (Room r : rooms.values()) if (!r.isFull()) return r;
        Room r = factory.apply("sea-" + (++counter));
        rooms.put(r.id, r);
        return r;
    }

    public synchronized Room find(String id) {
        return id == null ? null : rooms.get(id);
    }

    /** 빈 바다 정리. 닫힌 바다는 join 이 거절하므로, 방금 배정받은 사람은 다른 바다로 다시 배정됨 */
    public synchronized void removeIfEmpty(Room room) {
        if (room.closeIfEmpty()) rooms.remove(room.id, room);
    }

    public synchronized List<Room> rooms() {
        return new ArrayList<>(rooms.values());
    }

    public synchronized int totalPlayers() {
        int n = 0;
        for (Room r : rooms.values()) n += r.size();
        return n;
    }

    public int capacity() {
        return capacity;
    }
}
