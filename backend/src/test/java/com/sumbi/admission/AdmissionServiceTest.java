package com.sumbi.admission;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AdmissionServiceTest {
    @Test
    void 제안_중인_자리도_찬_자리로_셈() {
        AdmissionService<String> a = new AdmissionService<>(2);
        a.enqueue("x");
        a.enqueue("y");
        assertThat(a.offer(1, 0, 1000)).containsExactly("x");
        // 1명 + 제안 1자리 = 2 → 더 제안 안 함
        assertThat(a.offer(1, 0, 1000)).isEmpty();
        assertThat(a.canEnter(1)).isFalse();
    }

    @Test
    void 예상_대기는_최근_들어간_간격으로() {
        AdmissionService<String> a = new AdmissionService<>(1);
        assertThat(a.etaSeconds(3, 0)).isNull();
        for (int i = 0; i < 3; i++) {
            a.enqueue("p" + i);
            a.offer(0, i * 30_000L, 10_000);
            assertThat(a.accept("p" + i, i * 30_000L)).isTrue();
        }
        // 0초, 30초, 60초에 한 명씩 → 지금(90초) 기준 한 명당 30초, 앞에 1명이면 약 60초
        assertThat(a.etaSeconds(1, 90_000)).isEqualTo(60);
    }

    @Test
    void 상한을_내려도_음수가_되지_않음() {
        AdmissionService<String> a = new AdmissionService<>(5);
        a.setMaxTotal(-3);
        assertThat(a.maxTotal()).isZero();
        assertThat(a.canEnter(0)).isFalse();
    }
}
