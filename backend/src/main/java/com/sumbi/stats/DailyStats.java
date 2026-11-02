package com.sumbi.stats;

import com.sumbi.protocol.TodayStats;

/** 오늘의 바다 집계 (한국 시간 자정에 초기화). RedisDailyStats(기본) / InMemoryDailyStats(Redis 가 없을 때) */
public interface DailyStats {
    /** 오늘 처음 들어온 해녀면 divers +1 (재접속 토큰 기준) */
    void recordDiver(String token);

    void recordHarvest(String item);

    TodayStats snapshot();

    /** 값이 바뀔 때마다 증가 (방송할지 판단용) */
    long version();
}
