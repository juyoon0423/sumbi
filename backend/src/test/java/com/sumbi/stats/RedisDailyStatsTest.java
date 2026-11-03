package com.sumbi.stats;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.sumbi.MutableClock;
import java.io.File;
import java.net.ServerSocket;
import java.time.Clock;
import java.time.Duration;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * 실제 redis-server 를 빈 포트에 띄워서 확인 (저장 안 함). redis-server 가 설치돼 있지 않으면 건너뜀.
 */
class RedisDailyStatsTest {
    static Process server;
    static int port;
    static LettuceConnectionFactory factory;
    static StringRedisTemplate redis;

    static String redisBinary() {
        for (String p : List.of("/opt/homebrew/bin/redis-server", "/usr/local/bin/redis-server", "/usr/bin/redis-server")) {
            if (new File(p).canExecute()) return p;
        }
        return null;
    }

    static LettuceConnectionFactory connect(int port) {
        var f = new LettuceConnectionFactory(new RedisStandaloneConfiguration("127.0.0.1", port),
            LettuceClientConfiguration.builder().commandTimeout(Duration.ofMillis(500)).build());
        f.afterPropertiesSet();
        f.start();
        return f;
    }

    @BeforeAll
    static void startRedis() throws Exception {
        String bin = redisBinary();
        assumeTrue(bin != null, "redis-server 없음 → Redis 테스트 건너뜀");
        try (ServerSocket s = new ServerSocket(0)) {
            port = s.getLocalPort();
        }
        server = new ProcessBuilder(bin, "--port", Integer.toString(port), "--bind", "127.0.0.1", "--save", "", "--appendonly", "no")
            .redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
        factory = connect(port);
        redis = new StringRedisTemplate(factory);
        redis.afterPropertiesSet();
        long until = System.currentTimeMillis() + 5000;
        while (!new RedisDailyStats(redis, Clock.systemUTC()).ping()) {
            assumeTrue(System.currentTimeMillis() < until, "redis-server 가 뜨지 않음");
            Thread.sleep(50);
        }
    }

    @AfterAll
    static void stopRedis() throws Exception {
        if (factory != null) factory.destroy();
        if (server != null) {
            server.destroy();
            server.waitFor(3, TimeUnit.SECONDS);
        }
    }

    @BeforeEach
    void clean() {
        redis.execute((org.springframework.data.redis.core.RedisCallback<Object>) c -> {
            c.serverCommands().flushAll();
            return null;
        });
    }

    @Test
    void 같은_토큰은_한_번만_세고_채집을_더함() {
        var s = new RedisDailyStats(redis, Clock.systemUTC());
        long v0 = s.version();
        s.recordDiver("a");
        s.recordDiver("a");
        s.recordDiver("b");
        s.recordHarvest("conch");
        s.recordHarvest("conch");
        s.recordHarvest("pearl");
        assertThat(s.snapshot().divers()).isEqualTo(2);
        assertThat(s.snapshot().items()).containsEntry("conch", 2).containsEntry("abalone", 0).containsEntry("urchin", 0).doesNotContainKey("pearl");
        assertThat(s.version()).isEqualTo(v0 + 4); // 해녀 2 + 채집 2 (중복 해녀·없는 해산물은 버전 그대로)
    }

    @Test
    void 돌고래_횟수는_해산물과_따로() {
        var s = new RedisDailyStats(redis, Clock.systemUTC());
        long v0 = s.version();
        s.recordDolphin();
        s.recordDolphin();
        assertThat(s.snapshot().dolphins()).isEqualTo(2);
        assertThat(s.snapshot().items()).doesNotContainKey("dolphin");
        assertThat(s.version()).isEqualTo(v0 + 2);
        // 서버를 다시 켜도 그대로
        assertThat(new RedisDailyStats(redis, Clock.systemUTC()).snapshot().dolphins()).isEqualTo(2);
    }

    @Test
    void 서버를_다시_켜도_그대로() {
        new RedisDailyStats(redis, Clock.systemUTC()).recordHarvest("urchin");
        new RedisDailyStats(redis, Clock.systemUTC()).recordDiver("a");
        // 새 연결 + 새 객체 = 서버 재시작
        var f2 = connect(port);
        try {
            var t2 = new StringRedisTemplate(f2);
            t2.afterPropertiesSet();
            var s = new RedisDailyStats(t2, Clock.systemUTC());
            assertThat(s.snapshot().divers()).isEqualTo(1);
            assertThat(s.snapshot().items()).containsEntry("urchin", 1);
        } finally {
            f2.destroy();
        }
    }

    @Test
    void 한국_시간_자정에_초기화_키는_48시간_뒤_만료() {
        var clock = new MutableClock(ZonedDateTime.of(2026, 11, 2, 23, 59, 30, 0, InMemoryDailyStats.KST).toInstant());
        var s = new RedisDailyStats(redis, clock);
        s.recordDiver("a");
        s.recordHarvest("abalone");
        long v = s.version();
        assertThat(redis.getExpire("sumbi:today:2026-11-02:items", TimeUnit.SECONDS)).isBetween(47 * 3600L, 48 * 3600L);
        assertThat(redis.getExpire("sumbi:today:2026-11-02:divers", TimeUnit.SECONDS)).isBetween(47 * 3600L, 48 * 3600L);

        clock.now = clock.now.plusSeconds(60); // 00:00:30 KST
        assertThat(s.snapshot().divers()).isZero();
        assertThat(s.snapshot().items()).containsEntry("abalone", 0);
        assertThat(s.version()).isNotEqualTo(v);
        s.recordDiver("a"); // 새 날엔 같은 토큰도 다시 셈
        assertThat(s.snapshot().divers()).isEqualTo(1);
        assertThat(redis.hasKey("sumbi:today:2026-11-03:divers")).isTrue();
    }

    @Test
    void 서버_여러_대가_동시에_올려도_정확() throws Exception {
        int threads = 16, each = 200;
        ExecutorService ex = Executors.newFixedThreadPool(threads);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<?>> fs = new ArrayList<>();
        for (int t = 0; t < threads; t++) {
            int id = t;
            // 스레드마다 다른 객체 = 다른 서버
            var s = new RedisDailyStats(redis, Clock.systemUTC());
            fs.add(ex.submit(() -> {
                go.await();
                for (int i = 0; i < each; i++) {
                    s.recordHarvest(i % 2 == 0 ? "conch" : "urchin");
                    s.recordDiver("diver-" + (i % 50)); // 50명이 여러 서버에서 반복 입장
                    s.recordDiver("only-" + id);
                }
                return null;
            }));
        }
        go.countDown();
        for (var f : fs) f.get(30, TimeUnit.SECONDS);
        ex.shutdown();
        var snap = new RedisDailyStats(redis, Clock.systemUTC()).snapshot();
        assertThat(snap.items()).containsEntry("conch", threads * each / 2).containsEntry("urchin", threads * each / 2);
        assertThat(snap.divers()).isEqualTo(50 + threads);
    }

    @Test
    void Redis_가_멈추면_메모리로_이어가고_돌아오면_다시_Redis() throws Exception {
        AtomicLong now = new AtomicLong(1_000);
        var resilient = new ResilientDailyStats(new RedisDailyStats(redis, Clock.systemUTC()),
            new InMemoryDailyStats(Clock.systemUTC()), now::get, 30_000, false);
        resilient.recordHarvest("conch");
        assertThat(resilient.usingPrimary()).isTrue();

        // 닿지 않는 Redis (빈 포트)
        int dead;
        try (ServerSocket s = new ServerSocket(0)) {
            dead = s.getLocalPort();
        }
        var deadFactory = connect(dead);
        try {
            var deadTemplate = new StringRedisTemplate(deadFactory);
            deadTemplate.afterPropertiesSet();
            var broken = new ResilientDailyStats(new RedisDailyStats(deadTemplate, Clock.systemUTC()),
                new InMemoryDailyStats(Clock.systemUTC()), now::get, 30_000, false);
            long t0 = System.nanoTime();
            broken.recordDiver("a");
            broken.recordHarvest("urchin");
            broken.recordHarvest("urchin");
            assertThat(broken.usingPrimary()).isFalse();
            assertThat(broken.snapshot().divers()).isEqualTo(1);
            assertThat(broken.snapshot().items()).containsEntry("urchin", 2);
            // 실패는 처음 한 번만 기다리고(시간 제한 500ms), 그 뒤는 바로 메모리
            assertThat(Duration.ofNanos(System.nanoTime() - t0)).isLessThan(Duration.ofSeconds(3));
        } finally {
            deadFactory.destroy();
        }

        // 다시 시도 시간이 지나면 Redis 로 복귀
        var flaky = new ResilientDailyStats(new RedisDailyStats(redis, Clock.systemUTC()),
            new InMemoryDailyStats(Clock.systemUTC()), now::get, 30_000, true);
        assertThat(flaky.usingPrimary()).isFalse();
        assertThat(flaky.snapshot().items()).containsEntry("conch", 0); // 메모리 값
        now.addAndGet(30_000);
        assertThat(flaky.snapshot().items()).containsEntry("conch", 1); // Redis 값
        assertThat(flaky.usingPrimary()).isTrue();
    }
}
