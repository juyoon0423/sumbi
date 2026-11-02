package com.sumbi.stats;

import com.sumbi.protocol.TodayStats;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** 서버 한 대 메모리 집계. 날짜(KST)가 바뀌면 처음부터 */
public class InMemoryDailyStats implements DailyStats {
    public static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final Clock clock;
    private LocalDate day;
    private final Set<String> divers = new HashSet<>();
    private final Map<String, Integer> items = new LinkedHashMap<>();
    private long version;

    public InMemoryDailyStats(Clock clock) {
        this.clock = clock;
        reset(today());
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(KST));
    }

    private void reset(LocalDate d) {
        day = d;
        divers.clear();
        items.clear();
        items.put("conch", 0);
        items.put("abalone", 0);
        items.put("urchin", 0);
        version++;
    }

    private void rollIfNeeded() {
        LocalDate d = today();
        if (!d.equals(day)) reset(d);
    }

    @Override
    public synchronized void recordDiver(String token) {
        rollIfNeeded();
        if (divers.add(token)) version++;
    }

    @Override
    public synchronized void recordHarvest(String item) {
        rollIfNeeded();
        if (items.containsKey(item)) {
            items.merge(item, 1, Integer::sum);
            version++;
        }
    }

    @Override
    public synchronized TodayStats snapshot() {
        rollIfNeeded();
        return new TodayStats(divers.size(), Map.copyOf(items));
    }

    @Override
    public synchronized long version() {
        rollIfNeeded();
        return version;
    }
}
