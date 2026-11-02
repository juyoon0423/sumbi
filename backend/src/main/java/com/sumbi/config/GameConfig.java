package com.sumbi.config;

import com.sumbi.catalog.CustomizeCatalog;
import com.sumbi.game.GameServer;
import com.sumbi.room.MovementValidator;
import com.sumbi.room.PrepLedger;
import com.sumbi.room.Room;
import com.sumbi.room.RoomManager;
import com.sumbi.stats.DailyStats;
import com.sumbi.stats.InMemoryDailyStats;
import java.time.Clock;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.random.RandomGenerator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class GameConfig {
    private static final Logger log = LoggerFactory.getLogger(GameConfig.class);

    @Bean
    public DailyStats dailyStats() {
        // 4단계에서 RedisDailyStats 로 교체
        return new InMemoryDailyStats(Clock.systemUTC());
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
