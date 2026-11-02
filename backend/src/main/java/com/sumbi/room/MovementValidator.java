package com.sumbi.room;

import com.sumbi.config.SumbiProperties;

/**
 * 받은 위치 보정: 바다 범위 밖이면 경계 안으로, 이전 위치에서 너무 멀리 뛰었으면 허용 거리까지만.
 * 랭킹·경쟁이 없어서 가볍게만 막는다 (PLAN 7.4).
 */
public class MovementValidator {
    private final SumbiProperties.Sea sea;

    public MovementValidator(SumbiProperties.Sea sea) {
        this.sea = sea;
    }

    /**
     * @param prev 이전 위치 (없으면 null → 거리 검사 생략)
     * @param elapsedMs 이전 위치 이후 지난 시간
     * @return 보정된 위치 (새 배열)
     */
    public double[] correct(double[] prev, long elapsedMs, double[] next) {
        if (next == null || next.length != 3 || !finite(next)) {
            return prev == null ? new double[] {sea.centerX(), 0, sea.centerZ()} : prev.clone();
        }
        double[] p = next.clone();
        // 한 번에 너무 멀리: 이전 위치에서 허용 거리까지만 이동
        if (prev != null) {
            double dt = Math.max(0, elapsedMs) / 1000.0;
            double allowed = sea.maxSpeed() * dt + sea.slack();
            double dx = p[0] - prev[0], dy = p[1] - prev[1], dz = p[2] - prev[2];
            double d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d > allowed) {
                double k = allowed / d;
                p[0] = prev[0] + dx * k;
                p[1] = prev[1] + dy * k;
                p[2] = prev[2] + dz * k;
            }
        }
        // 바다 범위 (수평 원 + 높이)
        double hx = p[0] - sea.centerX(), hz = p[2] - sea.centerZ();
        double r = Math.sqrt(hx * hx + hz * hz);
        if (r > sea.radius()) {
            double k = sea.radius() / r;
            p[0] = sea.centerX() + hx * k;
            p[2] = sea.centerZ() + hz * k;
        }
        p[1] = Math.max(sea.minY(), Math.min(sea.maxY(), p[1]));
        return p;
    }

    private static boolean finite(double[] p) {
        for (double v : p) if (!Double.isFinite(v)) return false;
        return true;
    }
}
