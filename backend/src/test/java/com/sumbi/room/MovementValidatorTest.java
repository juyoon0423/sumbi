package com.sumbi.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.sumbi.TestProps;
import org.junit.jupiter.api.Test;

class MovementValidatorTest {
    final MovementValidator v = new MovementValidator(TestProps.sea()); // 중심 (0,8) 반지름 55, 최고 5m/s + 1m

    @Test
    void 정상_이동은_그대로() {
        assertThat(v.correct(new double[] {0, 0, 8}, 100, new double[] {0.2, 0, 8.1})).containsExactly(0.2, 0, 8.1);
    }

    @Test
    void 너무_멀리_뛰면_허용_거리까지만() {
        double[] p = v.correct(new double[] {0, 0, 8}, 100, new double[] {30, 0, 8});
        assertThat(p[0]).isCloseTo(1.5, within(1e-9)); // 5m/s * 0.1s + 1m
        assertThat(p[2]).isCloseTo(8, within(1e-9));
    }

    @Test
    void 바다_밖은_경계_안으로() {
        double[] p = v.correct(null, 0, new double[] {100, 0, 8});
        assertThat(p[0]).isCloseTo(55, within(1e-9));
        double[] deep = v.correct(null, 0, new double[] {0, -100, 8});
        assertThat(deep[1]).isEqualTo(-40);
        double[] high = v.correct(null, 0, new double[] {0, 50, 8});
        assertThat(high[1]).isEqualTo(2);
    }

    @Test
    void 이상한_값은_이전_위치() {
        double[] prev = {1, 0, 8};
        assertThat(v.correct(prev, 100, new double[] {Double.NaN, 0, 8})).containsExactly(1, 0, 8);
        assertThat(v.correct(prev, 100, new double[] {1, 2})).containsExactly(1, 0, 8);
    }
}
