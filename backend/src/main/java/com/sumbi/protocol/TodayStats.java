package com.sumbi.protocol;

import java.util.Map;

/** 오늘의 바다: 들어온 해녀 수, 종류별 채집 수 */
public record TodayStats(int divers, Map<String, Integer> items) {}
