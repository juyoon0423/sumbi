package com.sumbi.ws;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RateLimiterTest {
    @Test
    void 초당_상한까지만_허용하고_다음_초엔_다시() {
        RateLimiter r = new RateLimiter(3);
        assertThat(r.tryAcquire(1000)).isTrue();
        assertThat(r.tryAcquire(1100)).isTrue();
        assertThat(r.tryAcquire(1200)).isTrue();
        assertThat(r.tryAcquire(1300)).isFalse();
        assertThat(r.tryAcquire(2000)).isTrue();
    }
}
