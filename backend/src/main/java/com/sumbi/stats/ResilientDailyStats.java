package com.sumbi.stats;

import com.sumbi.protocol.TodayStats;
import java.util.function.LongSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Redis 집계 + 메모리 예비. 메모리에도 항상 같이 기록해 두고, Redis 가 실패하면
 * 잠시(retryMs) 메모리 값으로 이어 가다가 다시 Redis 를 시도한다. 게임은 Redis 때문에 멈추지 않는다.
 */
public class ResilientDailyStats implements DailyStats {
    private static final Logger log = LoggerFactory.getLogger(ResilientDailyStats.class);

    private final DailyStats primary;
    private final DailyStats memory;
    private final LongSupplier clock;
    private final long retryMs;
    /** 이 시각 전에는 Redis 를 건너뜀 (0 이면 정상) */
    private volatile long downUntil;

    public ResilientDailyStats(DailyStats primary, DailyStats memory, LongSupplier clock, long retryMs, boolean startDown) {
        this.primary = primary;
        this.memory = memory;
        this.clock = clock;
        this.retryMs = retryMs;
        this.downUntil = startDown ? clock.getAsLong() + retryMs : 0;
    }

    /** 지금 Redis 를 쓰는 중인지 */
    public boolean usingPrimary() {
        return clock.getAsLong() >= downUntil;
    }

    private void failed(RuntimeException e) {
        boolean wasUp = downUntil == 0;
        downUntil = clock.getAsLong() + retryMs;
        if (wasUp) log.warn("Redis 집계 실패 → {}초 동안 메모리 집계로: {}", retryMs / 1000, e.toString());
    }

    private void ok() {
        if (downUntil != 0) {
            downUntil = 0;
            log.info("Redis 집계 다시 사용");
        }
    }

    @Override
    public void recordDiver(String token) {
        memory.recordDiver(token);
        if (!usingPrimary()) return;
        try {
            primary.recordDiver(token);
            ok();
        } catch (RuntimeException e) {
            failed(e);
        }
    }

    @Override
    public void recordHarvest(String item) {
        memory.recordHarvest(item);
        if (!usingPrimary()) return;
        try {
            primary.recordHarvest(item);
            ok();
        } catch (RuntimeException e) {
            failed(e);
        }
    }

    @Override
    public void recordDolphin() {
        memory.recordDolphin();
        if (!usingPrimary()) return;
        try {
            primary.recordDolphin();
            ok();
        } catch (RuntimeException e) {
            failed(e);
        }
    }

    @Override
    public TodayStats snapshot() {
        if (usingPrimary()) {
            try {
                TodayStats s = primary.snapshot();
                ok();
                return s;
            } catch (RuntimeException e) {
                failed(e);
            }
        }
        return memory.snapshot();
    }

    /** 메모리 버전은 음수로 → Redis ↔ 메모리로 바뀌면 값이 달라져 새로 방송됨 */
    @Override
    public long version() {
        if (usingPrimary()) {
            try {
                long v = primary.version();
                ok();
                return v;
            } catch (RuntimeException e) {
                failed(e);
            }
        }
        return -1 - memory.version();
    }
}
