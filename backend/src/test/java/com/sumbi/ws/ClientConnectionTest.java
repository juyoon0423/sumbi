package com.sumbi.ws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.sumbi.TestProps;
import com.sumbi.protocol.LookInfo;
import com.sumbi.protocol.NickParts;
import com.sumbi.protocol.ServerMessage;
import com.sumbi.room.MovementValidator;
import com.sumbi.room.Room;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;

/** 느린 연결이 방 전체를 늦추지 않는지, 상한을 넘으면 정리되는지, 순서·단일 전송이 지켜지는지 */
class ClientConnectionTest {
    final ExecutorService writer = Executors.newVirtualThreadPerTaskExecutor();
    final MessageCodec codec = new MessageCodec();
    final AtomicLong clock = new AtomicLong(1_000_000);
    final List<ClientConnection> dead = new CopyOnWriteArrayList<>();
    final CountDownLatch release = new CountDownLatch(1);

    @AfterEach
    void tearDown() {
        release.countDown();
        writer.shutdownNow();
    }

    /** 받은 메시지를 기록하는 세션. 동시에 sendMessage 가 불리면 maxConcurrent 가 1보다 커짐 */
    static class Recording {
        final WebSocketSession session = mock(WebSocketSession.class);
        final List<String> got = new CopyOnWriteArrayList<>();
        final AtomicInteger inFlight = new AtomicInteger();
        final AtomicInteger maxConcurrent = new AtomicInteger();

        Recording(String id, CountDownLatch blockUntil) throws Exception {
            when(session.getId()).thenReturn(id);
            when(session.isOpen()).thenReturn(true);
            doAnswer(inv -> {
                int n = inFlight.incrementAndGet();
                maxConcurrent.accumulateAndGet(n, Math::max);
                try {
                    if (blockUntil != null) blockUntil.await(); // 네트워크가 막힌 클라이언트
                    WebSocketMessage<?> m = inv.getArgument(0);
                    got.add(((TextMessage) m).getPayload());
                } finally {
                    inFlight.decrementAndGet();
                }
                return null;
            }).when(session).sendMessage(any());
        }
    }

    ClientConnection conn(Recording r, int bufferBytes) {
        return new ClientConnection(r.session, codec, 30, new ClientConnection.Limits(3_000, bufferBytes), writer,
            clock::get, (c, abnormal) -> dead.add(c));
    }

    @Test
    void 느린_클라이언트가_있어도_방_방송은_바로_끝나고_다른_사람은_다_받는다() throws Exception {
        Recording slow = new Recording("slow", release);
        Recording fast = new Recording("fast", null);
        ClientConnection slowConn = conn(slow, 10 * 1024 * 1024);
        ClientConnection fastConn = conn(fast, 10 * 1024 * 1024);
        Room room = new Room("sea-1", 50, new MovementValidator(TestProps.sea()), 2000, 1000);
        NickParts nick = new NickParts("느린", "파도");
        LookInfo look = new LookInfo("pink", "orange", "rose");
        room.join("tok-slow-1", nick, look, new double[] {0, 0, 8}, slowConn, null, null);
        room.join("tok-fast-1", nick, look, new double[] {1, 0, 8}, fastConn, null, null);

        long t0 = System.nanoTime();
        for (int i = 0; i < 200; i++) room.broadcast(new ServerMessage.Evt(1, "wave", null));
        long ms = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - t0);

        assertThat(ms).as("방송 200번이 느린 연결을 기다리지 않음").isLessThan(500);
        // fast 는 두 번째로 들어와 join 을 받지 않음 → 방송 200개만
        awaitSize(fast.got, 200);
        assertThat(slow.got).isEmpty(); // 아직 첫 메시지에 막혀 있음
        assertThat(slowConn.isClosed()).isFalse();
    }

    @Test
    void 못_보낸_메시지가_상한을_넘으면_그_연결만_정리된다() throws Exception {
        Recording slow = new Recording("slow", release);
        ClientConnection c = conn(slow, 2_000);
        ServerMessage msg = new ServerMessage.Err("X", "x".repeat(200));
        for (int i = 0; i < 20 && !c.isClosed(); i++) c.send(msg);

        assertThat(c.isClosed()).isTrue();
        assertThat(c.queuedBytes()).isZero();
        verify(slow.session, timeout(2000)).close(CloseStatus.SESSION_NOT_RELIABLE);
        awaitSize(dead, 1);
        assertThat(dead).containsExactly(c);
        c.send(msg); // 정리된 뒤에는 무시
        assertThat(dead).hasSize(1);
    }

    @Test
    void 전송_하나가_시간_상한보다_오래_걸리면_다음_전송에서_정리된다() throws Exception {
        Recording slow = new Recording("slow", release);
        ClientConnection c = conn(slow, 10 * 1024 * 1024);
        c.send(new ServerMessage.Pong(1));
        // 전송 스레드가 막힌 세션에 쓰기 시작할 때까지
        long until = System.currentTimeMillis() + 2000;
        while (slow.inFlight.get() == 0 && System.currentTimeMillis() < until) Thread.sleep(5);
        c.send(new ServerMessage.Pong(2));
        assertThat(c.isClosed()).isFalse();

        clock.addAndGet(3_001);
        c.send(new ServerMessage.Pong(3));
        assertThat(c.isClosed()).isTrue();
        verify(slow.session, timeout(2000)).close(CloseStatus.SESSION_NOT_RELIABLE);
    }

    @Test
    void 여러_스레드가_동시에_보내도_세션에는_한_번에_하나씩_순서대로() throws Exception {
        Recording r = new Recording("s", null);
        ClientConnection c = conn(r, 10 * 1024 * 1024);
        int threads = 8, each = 300;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        for (int t = 0; t < threads; t++) {
            int thread = t;
            pool.execute(() -> {
                try {
                    start.await();
                } catch (InterruptedException e) {
                    return;
                }
                for (int i = 0; i < each; i++) c.send(new ServerMessage.Err("T" + thread, Integer.toString(i)));
            });
        }
        start.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(10, TimeUnit.SECONDS)).isTrue();
        awaitSize(r.got, threads * each);

        assertThat(r.maxConcurrent.get()).as("세션에 동시에 쓴 스레드 수").isEqualTo(1);
        // 스레드마다 보낸 순서 그대로
        int[] next = new int[threads];
        for (String json : r.got) {
            int t = json.charAt(json.indexOf("\"T") + 2) - '0';
            int i = Integer.parseInt(json.replaceAll(".*\"msg\":\"(\\d+)\".*", "$1"));
            assertThat(i).isEqualTo(next[t]++);
        }
        assertThat(c.isClosed()).isFalse();
    }

    static void awaitSize(List<?> list, int n) throws InterruptedException {
        long until = System.currentTimeMillis() + 5000;
        while (list.size() < n && System.currentTimeMillis() < until) Thread.sleep(5);
        assertThat(list).hasSize(n);
    }
}
