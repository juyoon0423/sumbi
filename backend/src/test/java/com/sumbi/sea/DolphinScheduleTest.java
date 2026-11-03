package com.sumbi.sea;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.SplittableRandom;
import org.junit.jupiter.api.Test;

class DolphinScheduleTest {
    static final DolphinSchedule.Settings S = new DolphinSchedule.Settings(30 * 60_000L, 8 * 60_000L, 90 * 60_000L);

    @Test
    void 처음에는_바로_나오지_않고_한_간격_뒤() {
        DolphinSchedule d = new DolphinSchedule(S, new SplittableRandom(1), 0);
        assertThat(d.nextAt()).isBetween(S.minMs(), S.maxMs());
        assertThat(d.tick(S.minMs() - 1)).isNull();
        assertThat(d.tick(d.nextAt())).isNotNull();
    }

    @Test
    void 간격은_평균_근처이고_최소_최대_안() {
        DolphinSchedule d = new DolphinSchedule(S, new SplittableRandom(7), 0);
        long sum = 0;
        int n = 20_000;
        for (int i = 0; i < n; i++) {
            long g = d.gap();
            assertThat(g).isBetween(S.minMs(), S.maxMs());
            sum += g;
        }
        double mean = sum / (double) n;
        // 평균 30분 지수 분포를 [8, 90]분으로 자르면 평균 = 8 + 30(e^-8/30 - e^-3) ≈ 29.5분
        assertThat(mean / 60_000).isBetween(28.0, 31.0);
    }

    @Test
    void 지나가는_길은_해안_앞_바다_안이고_마리_수는_3에서_6() {
        DolphinSchedule d = new DolphinSchedule(S, new SplittableRandom(3), 0);
        long now = 0;
        for (int i = 0; i < 500; i++) {
            now = d.nextAt();
            DolphinSchedule.Pass p = d.tick(now);
            assertThat(p).isNotNull();
            assertThat(p.seq()).isEqualTo(i + 1);
            assertThat(p.n()).isBetween(3, 6);
            for (double[] pt : new double[][] {p.from(), p.to()}) {
                // 해안선(z 약 -36)보다 바다 쪽, 바다 반지름(중심 0,8 에서 55) 안
                assertThat(pt[1]).isGreaterThan(-20);
                assertThat(Math.hypot(pt[0], pt[1] - 8)).isLessThan(55);
            }
            double len = Math.hypot(p.to()[0] - p.from()[0], p.to()[1] - p.from()[1]);
            assertThat(len).isBetween(53.9, 54.1);
            assertThat(p.dur()).isBetween(22_000L, 23_000L);
            // 물질하는 곳(0,8)을 뚫고 지나가지 않음: 길에서 가장 가까운 점이 15~22m
            double ux = (p.to()[0] - p.from()[0]) / len, uz = (p.to()[1] - p.from()[1]) / len;
            double wx = 0 - p.from()[0], wz = 8 - p.from()[1];
            double near = Math.abs(wx * uz - wz * ux);
            assertThat(near).isBetween(14.9, 22.1);
            // 지나가는 동안엔 새로 시작하지 않음, 늦게 온 사람은 같은 장면
            assertThat(d.tick(now + p.dur() / 2)).isNull();
            assertThat(d.active(now + p.dur() / 2)).isSameAs(p);
            assertThat(d.active(now + p.dur())).isNull();
            // 다음 등장은 지나간 뒤 한 간격 이상
            assertThat(d.nextAt()).isGreaterThanOrEqualTo(now + p.dur() + S.minMs());
        }
    }

    @Test
    void 개발용_바로_부르기는_지나가는_중엔_다시_안_됨() {
        DolphinSchedule d = new DolphinSchedule(S, new SplittableRandom(5), 0);
        DolphinSchedule.Pass p = d.trigger(1000);
        assertThat(p).isNotNull();
        assertThat(d.trigger(2000)).isNull();
        assertThat(d.trigger(1000 + p.dur())).isNotNull();
    }
}
