package com.sumbi.room;

import com.sumbi.protocol.ServerMessage;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/**
 * 불턱 공동 대야 (바다 하나에 하나). 손질이 끝날 때마다 fill + 1, capacity 에 닿으면 가득 참 →
 * celebrateMs 동안 다 같이 기뻐하고 비운 뒤 다음 대야(round + 1). 방(Room) 잠금 안에서만 쓴다.
 */
public class Basin {
    private final long celebrateMs;
    private int fill;
    private int capacity;
    private int round = 1;
    /** 가득 차서 축하 중이면 끝나는 시각, 아니면 0 */
    private long celebrateUntil;
    /** 축하하는 동안 끝난 손질 (다음 대야로 넘김) */
    private int carry;
    /** 손질이 끝나 대야에 들어갈 시각들 */
    private final ArrayDeque<Long> pending = new ArrayDeque<>();

    public Basin(int capacity, long celebrateMs) {
        this.capacity = capacity;
        this.celebrateMs = celebrateMs;
    }

    public void schedule(long at) {
        pending.add(at);
    }

    public ServerMessage.Basin state() {
        return new ServerMessage.Basin(fill, capacity, round, celebrateUntil > 0 ? Boolean.TRUE : null);
    }

    /**
     * 시간이 된 손질을 넣고, 축하가 끝났으면 비움. 보낼 대야 메시지들 (없으면 빈 목록).
     * nextCapacity: 비울 때 다음 대야 크기 (그때 불턱 인원에 맞춤)
     */
    public List<ServerMessage.Basin> tick(long now, int nextCapacity) {
        List<ServerMessage.Basin> out = new ArrayList<>();
        while (!pending.isEmpty() && pending.peekFirst() <= now) {
            pending.pollFirst();
            if (celebrateUntil > 0) {
                carry++;
                continue;
            }
            fill++;
            if (fill >= capacity) {
                fill = capacity;
                celebrateUntil = now + celebrateMs;
            }
            out.add(state());
        }
        if (celebrateUntil > 0 && now >= celebrateUntil) {
            celebrateUntil = 0;
            round++;
            capacity = nextCapacity;
            fill = Math.min(carry, capacity - 1);
            carry = 0;
            out.add(state());
        }
        return out;
    }

    public int fill() {
        return fill;
    }

    public int capacity() {
        return capacity;
    }

    public int round() {
        return round;
    }
}
