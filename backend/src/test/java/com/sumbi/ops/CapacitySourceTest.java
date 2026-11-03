package com.sumbi.ops;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class CapacitySourceTest {
    @Test
    void 숫자만_받고_이상한_값은_무시() {
        assertThat(CapacitySource.parse("50")).hasValue(50);
        assertThat(CapacitySource.parse(" 20 ")).hasValue(20);
        assertThat(CapacitySource.parse("0")).hasValue(0);
        assertThat(CapacitySource.parse(null)).isEmpty();
        assertThat(CapacitySource.parse("많이")).isEmpty();
        assertThat(CapacitySource.parse("-1")).isEmpty();
        assertThat(CapacitySource.parse("999999")).isEmpty();
    }
}
