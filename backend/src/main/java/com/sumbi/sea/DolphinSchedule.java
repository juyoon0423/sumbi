package com.sumbi.sea;

import java.util.random.RandomGenerator;

/**
 * 바다(방) 하나의 남방큰돌고래 일정. 언제 나타날지·어디로 지나갈지를 서버가 정해 같은 바다의 모두에게 보냄.
 * 간격은 평균 meanMs 인 지수 분포(언제 올지 모르게)를 [minMs, maxMs] 로 자름. 첫 등장도 바다가 생기고 한 간격 뒤.
 * 지나가는 길은 물질하는 곳(PLAY, 0,8)에서 바다 쪽으로 NEAR~FAR m 떨어진 곳을 스치는 54m 직선
 * → 해녀들 사이를 뚫고 지나가지 않고, 멀리서 누구에게나 보이는 거리.
 * 잠금은 부르는 쪽(GameServer)이 잡음.
 */
public class DolphinSchedule {
    /** 한 번 지나감. from/to: [x, z], startAt: 서버 시각(ms), n: 마리 수, seed: 뛰어오르는 모양 (각 화면이 같은 값으로 계산) */
    public record Pass(int seq, long startAt, long dur, double[] from, double[] to, int n, int seed) {
        public long elapsed(long now) {
            return now - startAt;
        }

        public boolean over(long now) {
            return now >= startAt + dur;
        }
    }

    public record Settings(long meanMs, long minMs, long maxMs) {
        public static final Settings DEFAULT = new Settings(30 * 60_000L, 8 * 60_000L, 90 * 60_000L);
    }

    static final double PLAY_X = 0;
    static final double PLAY_Z = 8;
    /** 물질하는 곳에서 가장 가까울 때의 거리 (m) */
    static final double NEAR = 15;
    static final double FAR = 22;
    /** 길 길이의 반 (m) */
    static final double HALF = 27;
    /** 가장 가까운 점의 방향: 바다 쪽(+z)에서 좌우로 이 각도까지 (해안 쪽으론 안 감) */
    static final double SPREAD = 1.1;
    /** 헤엄 속도 (m/s): 실제보다 느긋하게, 잘 보이도록 */
    static final double SPEED = 2.4;

    private final Settings settings;
    private final RandomGenerator random;
    private long nextAt;
    private Pass current;
    private int seq;

    public DolphinSchedule(Settings settings, RandomGenerator random, long now) {
        this.settings = settings;
        this.random = random;
        this.nextAt = now + gap();
    }

    /** 다음 간격: 평균 meanMs 지수 분포, [minMs, maxMs] */
    long gap() {
        double u = Math.max(1e-9, 1 - random.nextDouble());
        long g = Math.round(-Math.log(u) * settings.meanMs());
        return Math.max(settings.minMs(), Math.min(settings.maxMs(), g));
    }

    /** 시간이 되면 새로 지나가기 시작 (그 Pass 를 돌려줌, 아니면 null) */
    public Pass tick(long now) {
        if (current != null && current.over(now)) current = null;
        if (current == null && now >= nextAt) return start(now);
        return null;
    }

    /** 개발용: 지금 바로 (이미 지나가는 중이면 null) */
    public Pass trigger(long now) {
        if (current != null && !current.over(now)) return null;
        return start(now);
    }

    private Pass start(long now) {
        // 가장 가까운 점: 물질하는 곳에서 바다 쪽으로 NEAR~FAR m
        double a = Math.PI / 2 + (random.nextDouble() * 2 - 1) * SPREAD;
        double dist = NEAR + random.nextDouble() * (FAR - NEAR);
        double px = PLAY_X + Math.cos(a) * dist, pz = PLAY_Z + Math.sin(a) * dist;
        // 그 점에서 옆으로 (어느 쪽으로 갈지도 무작위)
        double sign = random.nextBoolean() ? 1 : -1;
        double dx = -Math.sin(a) * sign, dz = Math.cos(a) * sign;
        double[] from = {round(px - dx * HALF), round(pz - dz * HALF)};
        double[] to = {round(px + dx * HALF), round(pz + dz * HALF)};
        long dur = Math.round(2 * HALF / SPEED * 1000);
        int n = 3 + random.nextInt(4);
        current = new Pass(++seq, now, dur, from, to, n, random.nextInt(1, 1_000_000));
        nextAt = now + dur + gap();
        return current;
    }

    /** 지금 지나가는 중이면 (늦게 들어온 사람에게 남은 장면) */
    public Pass active(long now) {
        return current != null && !current.over(now) ? current : null;
    }

    public long nextAt() {
        return nextAt;
    }

    private static double round(double v) {
        return Math.round(v * 100) / 100.0;
    }
}
