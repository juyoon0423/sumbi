package com.sumbi.room;

/**
 * 불턱 자리 위치와 자리 사이를 걷는 시간. 프론트 world/bulteok/layout.ts · seatWalk.ts 와 같은 값.
 * 걷는 길: 자리 → 걷는 고리(반지름 2.6, 안쪽·바깥 원 사이) → 고리를 따라 돌아 → 목적지 자리.
 * 담 밖(24번~)에서 출발하면 담 밖 둘레를 따라 입구까지 가서 들어옴. 모닥불을 가로지르지 않음.
 */
public final class SeatPath {
    /** 앉을 수 있는 자리 수 (안쪽 12 + 바깥 12). 그 뒤 번호는 담 밖에 서서 불 쬐기 */
    public static final int RING_SEATS = 24;
    static final double ENTRANCE = Math.PI / 2;
    static final double WALK_R = 2.6;
    static final double WALL_R = 4.2;
    // 일어나기 · 돌아서기 · 도착해서 돌아서기 · 앉기 (초), 걷는 속도 (m/s)
    static final double RISE = 0.55, TURN = 0.35, ARRIVE = 0.35, SETTLE = 0.55, SPEED = 1.0;

    private SeatPath() {}

    public static double radius(int seat) {
        if (seat < 12) return 2.05;
        if (seat < 24) return 3.15;
        return 5.0 + Math.floor((seat - 24) / 20.0) * 0.8;
    }

    public static double angle(int seat) {
        if (seat < 12) return (seat / 12.0) * Math.PI * 2 + Math.PI / 12 + ENTRANCE;
        if (seat < 24) return ((seat - 12) / 12.0) * Math.PI * 2 + ENTRANCE;
        int k = seat - 24;
        return ((k % 20) / 20.0) * Math.PI * 2 + ENTRANCE + Math.PI / 20;
    }

    /** a → b 짧은 쪽으로 돈 각도 (0~π) */
    static double arc(double a, double b) {
        return Math.abs(Math.IEEEremainder(b - a, Math.PI * 2));
    }

    /** 걷는 거리 (m) */
    public static double length(int from, int to) {
        double r = radius(from);
        double a = angle(from);
        double len = 0;
        if (r > WALL_R) {
            len += r * arc(a, ENTRANCE) + (r - WALK_R);
            a = ENTRANCE;
        } else {
            len += Math.abs(r - WALK_R);
        }
        len += WALK_R * arc(a, angle(to));
        len += Math.abs(radius(to) - WALK_R);
        return len;
    }

    /** 일어나서 걸어가 앉기까지 (ms) */
    public static long walkMs(int from, int to) {
        return Math.round((RISE + TURN + length(from, to) / SPEED + ARRIVE + SETTLE) * 1000);
    }
}
