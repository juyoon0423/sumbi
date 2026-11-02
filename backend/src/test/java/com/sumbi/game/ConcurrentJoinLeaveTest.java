package com.sumbi.game;

import static org.assertj.core.api.Assertions.assertThat;

import com.sumbi.TestProps;
import com.sumbi.catalog.CustomizeCatalog;
import com.sumbi.config.SumbiProperties;
import com.sumbi.player.Player;
import com.sumbi.protocol.ClientMessage;
import com.sumbi.protocol.LookInfo;
import com.sumbi.protocol.NickParts;
import com.sumbi.protocol.ServerMessage;
import com.sumbi.room.MovementValidator;
import com.sumbi.room.Room;
import com.sumbi.room.RoomManager;
import com.sumbi.stats.InMemoryDailyStats;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.random.RandomGenerator;
import org.junit.jupiter.api.RepeatedTest;

/** 여러 명이 동시에 들어오고 나가도 방 인원·배정·전체 상한이 꼬이지 않는지 */
class ConcurrentJoinLeaveTest {

    static class Conn implements Client {
        final List<ServerMessage> got = new CopyOnWriteArrayList<>();

        @Override
        public void send(ServerMessage message) {
            got.add(message);
        }

        @Override
        public void close(boolean abnormal) {}

        ServerMessage.Welcome welcome() {
            for (ServerMessage m : got) if (m instanceof ServerMessage.Welcome w) return w;
            return null;
        }
    }

    GameServer server(int capacity, int maxTotal, RoomManager[] out) {
        SumbiProperties props = TestProps.props(capacity, maxTotal);
        MovementValidator mv = new MovementValidator(props.sea());
        RoomManager rooms = new RoomManager(capacity, id -> new Room(id, capacity, mv, 2000, 1000));
        out[0] = rooms;
        return new GameServer(props, new CustomizeCatalog(), rooms, new InMemoryDailyStats(Clock.systemUTC()),
            System::currentTimeMillis, RandomGenerator.getDefault());
    }

    static ClientMessage.Hello hello(int i) {
        return new ClientMessage.Hello(1, "token-" + i + "-" + ThreadLocalRandom.current().nextInt(1_000_000), "pc",
            new NickParts("느린", "파도"), new LookInfo("pink", "orange", "rose"));
    }

    @RepeatedTest(5)
    void 동시에_들어오고_나가도_방_인원과_배정이_맞다() throws Exception {
        int capacity = 3, maxTotal = 10_000, people = 600, threads = 16;
        RoomManager[] holder = new RoomManager[1];
        GameServer g = server(capacity, maxTotal, holder);
        RoomManager rooms = holder[0];

        List<Conn> stayed = new CopyOnWriteArrayList<>();
        ConcurrentLinkedQueue<String> problems = new ConcurrentLinkedQueue<>();
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        for (int i = 0; i < people; i++) {
            int n = i;
            pool.execute(() -> {
                try {
                    start.await();
                    Conn c = new Conn();
                    g.connected(c);
                    g.received(c, hello(n));
                    g.received(c, new ClientMessage.Move(new double[] {0, 0, 8}, 0));
                    if (n % 7 == 0) g.housekeeping(); // 빈 바다 정리도 같이 돌게
                    if (n % 2 == 0) {
                        g.disconnected(c, false); // 바로 나감 → 바다가 자주 비고 정리됨
                    } else {
                        stayed.add(c);
                    }
                } catch (Throwable t) {
                    problems.add(t.toString());
                }
            });
        }
        start.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(30, TimeUnit.SECONDS)).isTrue();
        assertThat(problems).isEmpty();
        g.housekeeping();

        List<Room> live = rooms.rooms();
        int total = 0;
        for (Room r : live) {
            assertThat(r.size()).as(r.id + " 인원").isBetween(1, capacity);
            assertThat(r.isClosed()).isFalse();
            total += r.size();
        }
        assertThat(total).as("남은 사람 수 = 방 인원 합").isEqualTo(stayed.size());
        assertThat(rooms.totalPlayers()).isEqualTo(stayed.size());

        // 남은 사람은 모두 목록에 있는 바다에, 자기 연결로 앉아 있음 (정리된 바다에 들어간 사람 없음)
        Set<String> liveIds = new HashSet<>();
        for (Room r : live) liveIds.add(r.id);
        Set<String> seats = new HashSet<>();
        for (Conn c : stayed) {
            ServerMessage.Welcome w = c.welcome();
            assertThat(w).isNotNull();
            String roomId = w.room().id();
            assertThat(liveIds).as("welcome 받은 바다가 목록에 있음").contains(roomId);
            Player p = rooms.find(roomId).get(w.you().id());
            assertThat(p).isNotNull();
            assertThat(p.sink).isSameAs(c);
            assertThat(seats.add(roomId + "#" + w.you().id())).as("같은 자리 두 명").isTrue();
        }
    }

    @RepeatedTest(5)
    void 대기열이_있어도_전체_상한을_넘지_않는다() throws Exception {
        int capacity = 5, maxTotal = 12, people = 200, threads = 16;
        RoomManager[] holder = new RoomManager[1];
        GameServer g = server(capacity, maxTotal, holder);
        RoomManager rooms = holder[0];
        AtomicInteger maxSeen = new AtomicInteger();
        List<Conn> all = new CopyOnWriteArrayList<>();

        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        for (int i = 0; i < people; i++) {
            int n = i;
            pool.execute(() -> {
                try {
                    start.await();
                } catch (InterruptedException e) {
                    return;
                }
                Conn c = new Conn();
                all.add(c);
                g.connected(c);
                g.received(c, hello(n));
                maxSeen.accumulateAndGet(rooms.totalPlayers(), Math::max);
                if (n % 3 != 0) g.disconnected(c, false); // 나가면 대기열 앞사람이 들어옴
                if (n % 5 == 0) g.housekeeping();
                maxSeen.accumulateAndGet(rooms.totalPlayers(), Math::max);
            });
        }
        start.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(30, TimeUnit.SECONDS)).isTrue();
        g.housekeeping();

        assertThat(maxSeen.get()).as("동시에 바다에 있던 최대 인원").isLessThanOrEqualTo(maxTotal);
        assertThat(rooms.totalPlayers()).isLessThanOrEqualTo(maxTotal);
        // 남은 사람(n % 3 == 0, 67명) 중 상한만큼은 들어가 있고 나머지는 대기
        List<Conn> inSea = new ArrayList<>();
        for (Conn c : all) if (c.welcome() != null) inSea.add(c);
        assertThat(rooms.totalPlayers() + g.waitingCount()).isEqualTo(67);
        assertThat(rooms.totalPlayers()).isEqualTo(maxTotal);
    }
}
