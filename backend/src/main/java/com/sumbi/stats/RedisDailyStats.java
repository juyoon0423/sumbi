package com.sumbi.stats;

import com.sumbi.protocol.TodayStats;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;

/**
 * 오늘의 바다를 Redis 에 (서버를 다시 켜도, 서버가 여러 대여도 같은 값).
 * 키에 한국 날짜를 넣어 자정이 지나면 자연스럽게 새 키 → 초기화. 키는 48시간 뒤 사라짐.
 *   sumbi:today:2026-11-03:divers  SET  (재접속 토큰, 중복 없이)
 *   sumbi:today:2026-11-03:items   HASH (conch/abalone/urchin → 개수, dolphin → 돌고래가 나타난 횟수)
 *   sumbi:today:2026-11-03:ver     값이 바뀔 때마다 +1 (방송할지 판단)
 * 쓰기·만료 설정·버전 증가를 Lua 스크립트 하나로 → 여러 서버가 동시에 써도 원자적.
 */
public class RedisDailyStats implements DailyStats {
    static final Duration TTL = Duration.ofHours(48);
    private static final List<String> ITEMS = List.of("conch", "abalone", "urchin");
    private static final String DOLPHIN = "dolphin";

    /** KEYS: divers, ver / ARGV: token, ttl 초 */
    private static final DefaultRedisScript<Long> ADD_DIVER = new DefaultRedisScript<>("""
        local added = redis.call('SADD', KEYS[1], ARGV[1])
        redis.call('EXPIRE', KEYS[1], ARGV[2])
        if added == 1 then
          redis.call('INCR', KEYS[2])
          redis.call('EXPIRE', KEYS[2], ARGV[2])
        end
        return added
        """, Long.class);

    /** KEYS: items, ver / ARGV: item, ttl 초 */
    private static final DefaultRedisScript<Long> ADD_ITEM = new DefaultRedisScript<>("""
        local n = redis.call('HINCRBY', KEYS[1], ARGV[1], 1)
        redis.call('EXPIRE', KEYS[1], ARGV[2])
        redis.call('INCR', KEYS[2])
        redis.call('EXPIRE', KEYS[2], ARGV[2])
        return n
        """, Long.class);

    /** KEYS: divers, items, ver → {해녀 수, [item, n, ...], 버전} 을 한 번에 */
    @SuppressWarnings("rawtypes")
    private static final DefaultRedisScript<List> READ = new DefaultRedisScript<>("""
        return { redis.call('SCARD', KEYS[1]), redis.call('HGETALL', KEYS[2]), redis.call('GET', KEYS[3]) or '0' }
        """, List.class);

    private final StringRedisTemplate redis;
    private final Clock clock;
    private final String prefix;

    public RedisDailyStats(StringRedisTemplate redis, Clock clock) {
        this(redis, clock, "sumbi:today:");
    }

    public RedisDailyStats(StringRedisTemplate redis, Clock clock, String prefix) {
        this.redis = redis;
        this.clock = clock;
        this.prefix = prefix;
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(InMemoryDailyStats.KST));
    }

    private String key(LocalDate day, String what) {
        return prefix + day + ":" + what;
    }

    private static String ttl() {
        return Long.toString(TTL.toSeconds());
    }

    /** Redis 에 닿는지 (시작할 때 확인용) */
    public boolean ping() {
        try {
            return "PONG".equalsIgnoreCase(redis.execute((org.springframework.data.redis.core.RedisCallback<String>) c -> c.ping()));
        } catch (RuntimeException e) {
            return false;
        }
    }

    @Override
    public void recordDiver(String token) {
        LocalDate d = today();
        redis.execute(ADD_DIVER, List.of(key(d, "divers"), key(d, "ver")), token, ttl());
    }

    @Override
    public void recordHarvest(String item) {
        if (!ITEMS.contains(item)) return;
        LocalDate d = today();
        redis.execute(ADD_ITEM, List.of(key(d, "items"), key(d, "ver")), item, ttl());
    }

    @Override
    public void recordDolphin() {
        LocalDate d = today();
        redis.execute(ADD_ITEM, List.of(key(d, "items"), key(d, "ver")), DOLPHIN, ttl());
    }

    private record Read(LocalDate day, TodayStats stats, long ver) {}

    private Read read() {
        LocalDate d = today();
        List<?> r = redis.execute(READ, List.of(key(d, "divers"), key(d, "items"), key(d, "ver")));
        Map<String, Integer> items = new LinkedHashMap<>();
        for (String it : ITEMS) items.put(it, 0);
        int dolphins = 0;
        List<?> flat = (List<?>) r.get(1);
        for (int i = 0; i + 1 < flat.size(); i += 2) {
            String it = String.valueOf(flat.get(i));
            int n = Integer.parseInt(String.valueOf(flat.get(i + 1)));
            if (items.containsKey(it)) items.put(it, n);
            else if (DOLPHIN.equals(it)) dolphins = n;
        }
        int divers = ((Number) r.get(0)).intValue();
        return new Read(d, new TodayStats(divers, Map.copyOf(items), dolphins), Long.parseLong(String.valueOf(r.get(2))));
    }

    @Override
    public TodayStats snapshot() {
        return read().stats();
    }

    /** 날짜가 바뀌어도 값이 달라지게: (날짜 × 10억) + 그날의 변경 횟수 */
    @Override
    public long version() {
        Read r = read();
        return r.day().toEpochDay() * 1_000_000_000L + r.ver();
    }
}
