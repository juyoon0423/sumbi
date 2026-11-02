package com.sumbi.config;

import com.sumbi.catalog.CustomizeCatalog;
import com.sumbi.game.GameServer;
import com.sumbi.room.MovementValidator;
import com.sumbi.room.PrepLedger;
import com.sumbi.room.Room;
import com.sumbi.room.RoomManager;
import com.sumbi.stats.DailyStats;
import com.sumbi.stats.InMemoryDailyStats;
import com.sumbi.stats.RedisDailyStats;
import com.sumbi.stats.ResilientDailyStats;
import java.time.Clock;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.random.RandomGenerator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.context.annotation.Configuration;

@Configuration
public class GameConfig {
    private static final Logger log = LoggerFactory.getLogger(GameConfig.class);

    /**
     * 오늘의 바다 저장소 (sumbi.stats-store).
     * auto: Redis 에 닿으면 Redis, 아니면 메모리로 시작하고 30초마다 다시 시도 / redis: 닿지 않으면 시작 실패 / memory: 메모리만
     */
    @Bean
    public DailyStats dailyStats(@Value("${sumbi.stats-store:auto}") String store, ObjectProvider<StringRedisTemplate> redis) {
        InMemoryDailyStats memory = new InMemoryDailyStats(Clock.systemUTC());
        if ("memory".equals(store)) {
            log.info("오늘의 바다: 메모리 집계");
            return memory;
        }
        StringRedisTemplate template = redis.getIfAvailable();
        if (template == null) {
            if ("redis".equals(store)) throw new IllegalStateException("sumbi.stats-store=redis 인데 Redis 설정이 없음");
            log.info("오늘의 바다: 메모리 집계 (Redis 설정 없음)");
            return memory;
        }
        RedisDailyStats primary = new RedisDailyStats(template, Clock.systemUTC());
        boolean up = primary.ping();
        if (!up && "redis".equals(store)) throw new IllegalStateException("sumbi.stats-store=redis 인데 Redis 에 연결할 수 없음 (SUMBI_REDIS_URL 확인)");
        log.info(up ? "오늘의 바다: Redis 집계" : "오늘의 바다: Redis 에 연결할 수 없어 메모리 집계로 시작 (30초마다 다시 시도)");
        return new ResilientDailyStats(primary, memory, System::currentTimeMillis, 30_000, !up);
    }

    @Bean
    public PrepLedger prepLedger() {
        return new PrepLedger(Clock.systemUTC());
    }

    @Bean
    public RoomManager roomManager(SumbiProperties props, PrepLedger ledger) {
        MovementValidator movement = new MovementValidator(props.sea());
        SumbiProperties.Bulteok b = props.bulteok();
        Room.Settings settings = new Room.Settings(props.roomCapacity(), props.lookIntervalMs(), props.harvestIntervalMs(),
            b.prepMs(), b.restMs(), b.basinCapacity(), b.basinCelebrateMs());
        return new RoomManager(props.roomCapacity(), id -> new Room(id, settings, movement, ledger));
    }

    @Bean
    public GameServer gameServer(SumbiProperties props, CustomizeCatalog catalog, RoomManager rooms, DailyStats stats) {
        return new GameServer(props, catalog, rooms, stats, System::currentTimeMillis, RandomGenerator.getDefault());
    }

    /** 연결별 전송 스레드 (가상 스레드: 느린 연결이 막혀도 다른 연결·방에 영향 없음) */
    @Bean(destroyMethod = "shutdownNow")
    public ExecutorService sendExecutor() {
        return Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("sumbi-send-", 0).factory());
    }

    /** 위치 스냅샷(100ms)과 정리 작업(1초) */
    @Bean(destroyMethod = "shutdownNow")
    public ScheduledExecutorService gameScheduler(GameServer game, SumbiProperties props) {
        ScheduledExecutorService ex = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "sumbi-tick");
            t.setDaemon(true);
            return t;
        });
        ex.scheduleAtFixedRate(safe(game::tick), props.tickMs(), props.tickMs(), TimeUnit.MILLISECONDS);
        ex.scheduleAtFixedRate(safe(game::housekeeping), 1000, 1000, TimeUnit.MILLISECONDS);
        return ex;
    }

    /** 예외 하나로 반복 작업이 멈추지 않게 */
    private static Runnable safe(Runnable r) {
        return () -> {
            try {
                r.run();
            } catch (RuntimeException e) {
                log.error("scheduled task failed", e);
            }
        };
    }
}
