package com.sumbi.ops;

import java.util.OptionalInt;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * 서버를 끄지 않고 바꾸는 전체 동시 접속 상한: Redis 키 하나 (sumbi:config:max-total).
 * 값이 없으면 환경변수(SUMBI_MAX_TOTAL) 기본값. 서버가 몇 초마다 읽음.
 * 바꾸기: redis-cli SET sumbi:config:max-total 50 / 기본값으로: redis-cli DEL sumbi:config:max-total
 */
public class CapacitySource {
    public static final String KEY = "sumbi:config:max-total";
    /** 잘못 넣은 값으로 서버가 터지지 않게 */
    public static final int LIMIT = 5000;

    private final StringRedisTemplate redis;

    public CapacitySource(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** Redis 에 넣은 상한. 없거나 숫자가 아니면 빈 값. Redis 오류는 예외 그대로 (부르는 쪽이 지난 값 유지) */
    public OptionalInt read() {
        String v = redis.opsForValue().get(KEY);
        return parse(v);
    }

    static OptionalInt parse(String v) {
        if (v == null) return OptionalInt.empty();
        try {
            int n = Integer.parseInt(v.trim());
            if (n < 0 || n > LIMIT) return OptionalInt.empty();
            return OptionalInt.of(n);
        } catch (NumberFormatException e) {
            return OptionalInt.empty();
        }
    }
}
