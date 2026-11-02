package com.sumbi.ws;

import com.sumbi.game.Client;
import com.sumbi.protocol.ServerMessage;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.LongSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/**
 * WebSocket 세션 하나 + 보낼 메시지 줄.
 *
 * <p>send() 는 메시지를 줄에 넣기만 하고 바로 돌아온다 (방 잠금 안에서 불려도 네트워크를 기다리지 않음).
 * 실제 전송은 연결마다 한 번에 하나의 전송 스레드(가상 스레드)가 줄 순서대로 한다. 그래서
 * <ul>
 *   <li>여러 스레드(10Hz 스냅샷, 즉시 이벤트)가 동시에 보내도 세션에 쓰는 건 언제나 한 스레드</li>
 *   <li>보내는 순서 = 줄에 넣은 순서 = 방 잠금 안에서 일어난 순서 (join 뒤에 leave 등이 뒤바뀌지 않음)</li>
 *   <li>느린 연결은 자기 줄만 길어지고, 상한(시간·크기)을 넘으면 정리된다</li>
 * </ul>
 */
public class ClientConnection implements Client {
    private static final Logger log = LoggerFactory.getLogger(ClientConnection.class);

    /** 연결이 정리됐을 때 (느린 연결로 끊음, heartbeat 만료 등) */
    public interface Listener {
        void dead(ClientConnection c, boolean abnormal);
    }

    /** 느린 연결 기준 */
    public record Limits(long sendTimeLimitMs, int bufferBytes) {}

    private final WebSocketSession session;
    private final MessageCodec codec;
    private final Executor writer;
    private final Limits limits;
    private final LongSupplier clock;
    private final Listener listener;
    final RateLimiter rateLimiter;
    long lastRateErrorAt;

    private final ConcurrentLinkedQueue<byte[]> queue = new ConcurrentLinkedQueue<>();
    private final AtomicInteger queuedBytes = new AtomicInteger();
    private final AtomicBoolean draining = new AtomicBoolean();
    private final AtomicBoolean closed = new AtomicBoolean();
    /** 지금 보내고 있는 메시지를 시작한 시각 (ms). 보내는 중이 아니면 0 */
    private volatile long sendStartedAt;

    public ClientConnection(WebSocketSession session, MessageCodec codec, int maxPerSec, Limits limits, Executor writer,
            LongSupplier clock, Listener listener) {
        this.session = session;
        this.codec = codec;
        this.rateLimiter = new RateLimiter(maxPerSec);
        this.limits = limits;
        this.writer = writer;
        this.clock = clock;
        this.listener = listener;
    }

    public String id() {
        return session.getId();
    }

    public boolean isClosed() {
        return closed.get();
    }

    /** 아직 보내지 못한 양 (bytes) */
    public int queuedBytes() {
        return queuedBytes.get();
    }

    @Override
    public void send(ServerMessage message) {
        if (closed.get()) return;
        long started = sendStartedAt;
        if (started != 0 && clock.getAsLong() - started > limits.sendTimeLimitMs()) {
            shutdown(true, "send took longer than " + limits.sendTimeLimitMs() + "ms");
            return;
        }
        byte[] bytes;
        try {
            bytes = codec.encodeBytes(message);
        } catch (RuntimeException e) {
            log.warn("cannot encode {}: {}", message.getClass().getSimpleName(), e.getMessage());
            return;
        }
        if (queuedBytes.addAndGet(bytes.length) > limits.bufferBytes()) {
            shutdown(true, "send buffer over " + limits.bufferBytes() + " bytes");
            return;
        }
        queue.add(bytes);
        if (draining.compareAndSet(false, true)) writer.execute(this::drain);
    }

    /** 전송 스레드: 줄이 빌 때까지 순서대로 보냄. draining 플래그로 연결당 한 스레드만 */
    private void drain() {
        while (true) {
            byte[] b;
            while (!closed.get() && (b = queue.poll()) != null) {
                sendStartedAt = Math.max(1, clock.getAsLong());
                try {
                    session.sendMessage(new TextMessage(b));
                } catch (Exception e) {
                    sendStartedAt = 0;
                    draining.set(false);
                    shutdown(true, "send failed: " + e.getMessage());
                    return;
                }
                sendStartedAt = 0;
                queuedBytes.addAndGet(-b.length);
            }
            draining.set(false);
            // 내려놓는 사이에 새 메시지가 들어왔으면 다시 맡음
            if (closed.get() || queue.isEmpty() || !draining.compareAndSet(false, true)) return;
        }
    }

    @Override
    public void close(boolean abnormal) {
        shutdown(abnormal, abnormal ? "closed by server (abnormal)" : "closed by server");
    }

    /**
     * 한 번만: 줄을 비우고, 세션 닫기와 정리 알림은 전송 스레드에서 (방 잠금 안에서 불려도 막히지 않게,
     * 또 닫기가 오래 걸려도 게임 상태 정리는 바로 되게).
     */
    private void shutdown(boolean abnormal, String reason) {
        if (!closed.compareAndSet(false, true)) return;
        if (abnormal) log.info("closing {}: {}", session.getId(), reason);
        queue.clear();
        queuedBytes.set(0);
        CloseStatus status = abnormal ? CloseStatus.SESSION_NOT_RELIABLE : CloseStatus.NORMAL;
        writer.execute(() -> {
            listener.dead(this, abnormal);
            try {
                if (session.isOpen()) session.close(status);
            } catch (Exception e) {
                log.debug("close failed: {}", e.getMessage());
            }
        });
    }
}
