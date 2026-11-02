package com.sumbi.stats;

import static org.assertj.core.api.Assertions.assertThat;

import com.sumbi.MutableClock;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import org.junit.jupiter.api.Test;

class InMemoryDailyStatsTest {
    @Test
    void 같은_토큰은_한_번만_세고_채집을_더함() {
        var s = new InMemoryDailyStats(Clock.systemUTC());
        s.recordDiver("a");
        s.recordDiver("a");
        s.recordDiver("b");
        s.recordHarvest("conch");
        s.recordHarvest("conch");
        s.recordHarvest("pearl");
        assertThat(s.snapshot().divers()).isEqualTo(2);
        assertThat(s.snapshot().items()).containsEntry("conch", 2).containsEntry("abalone", 0).doesNotContainKey("pearl");
    }

    @Test
    void 한국_시간_자정에_초기화() {
        // 2026-11-02 23:59 KST = 14:59 UTC
        var clock = new MutableClock(ZonedDateTime.of(2026, 11, 2, 23, 59, 0, 0, InMemoryDailyStats.KST).toInstant());
        var s = new InMemoryDailyStats(clock);
        s.recordDiver("a");
        s.recordHarvest("urchin");
        long v = s.version();
        clock.now = clock.now.plusSeconds(30); // 아직 23:59:30
        assertThat(s.snapshot().divers()).isEqualTo(1);
        clock.now = clock.now.plusSeconds(60); // 00:00:30 KST
        assertThat(s.snapshot().divers()).isZero();
        assertThat(s.snapshot().items()).containsEntry("urchin", 0);
        assertThat(s.version()).isGreaterThan(v);
    }
}
