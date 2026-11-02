package com.sumbi.room;

import com.sumbi.stats.InMemoryDailyStats;
import java.time.Clock;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * "내가 딴 것만 손질" 검증용: 재접속 토큰별 오늘(KST) 딴 개수와 손질한 개수.
 * 서버 메모리에만 두고 한국 시간 자정에 비움 (개인 기록 저장소가 아니라 검증용 카운터).
 */
public class PrepLedger {
    public static final List<String> ITEMS = List.of("conch", "abalone", "urchin");

    private final Clock clock;
    private LocalDate day;
    private final Map<String, int[]> harvested = new HashMap<>();
    private final Map<String, int[]> prepped = new HashMap<>();

    public PrepLedger(Clock clock) {
        this.clock = clock;
        this.day = today();
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(InMemoryDailyStats.KST));
    }

    private void rollIfNeeded() {
        LocalDate d = today();
        if (!d.equals(day)) {
            day = d;
            harvested.clear();
            prepped.clear();
        }
    }

    private static int index(String item) {
        return ITEMS.indexOf(item);
    }

    public synchronized void addHarvest(String token, String item) {
        int i = index(item);
        if (i < 0) return;
        rollIfNeeded();
        harvested.computeIfAbsent(token, k -> new int[3])[i]++;
    }

    /** 손질할 게 남아 있으면 하나 쓰고 남은 개수, 없으면 -1 */
    public synchronized int tryPrep(String token, String item) {
        int i = index(item);
        if (i < 0) return -1;
        rollIfNeeded();
        int have = harvested.getOrDefault(token, new int[3])[i];
        int[] done = prepped.computeIfAbsent(token, k -> new int[3]);
        if (have - done[i] <= 0) return -1;
        done[i]++;
        return have - done[i];
    }

    /** 종류별 남은 개수 */
    public synchronized Map<String, Integer> left(String token) {
        rollIfNeeded();
        int[] h = harvested.getOrDefault(token, new int[3]);
        int[] p = prepped.getOrDefault(token, new int[3]);
        Map<String, Integer> out = new LinkedHashMap<>();
        for (int i = 0; i < 3; i++) out.put(ITEMS.get(i), Math.max(0, h[i] - p[i]));
        return out;
    }
}
