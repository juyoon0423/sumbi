package com.sumbi.protocol;

import java.util.Map;

/** 오늘의 바다: 들어온 해녀 수, 종류별 채집 수, 돌고래가 나타난 횟수 */
public record TodayStats(int divers, Map<String, Integer> items, int dolphins) {
    public TodayStats(int divers, Map<String, Integer> items) {
        this(divers, items, 0);
    }
}
