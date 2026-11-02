package com.sumbi.ws;

import com.sumbi.game.Client;
import com.sumbi.protocol.ServerMessage;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

/**
 * WebSocket 세션 하나. 여러 스레드(방 방송, 틱)가 동시에 보내도 안전하도록 decorator 로 감싸고,
 * 느린 클라이언트는 오래된 메시지를 버려서 다른 사람을 막지 않게 한다.
 */
public class ClientConnection implements Client {
    private static final Logger log = LoggerFactory.getLogger(ClientConnection.class);

    private final WebSocketSession session;
    private final MessageCodec codec;
    final RateLimiter rateLimiter;
    long lastRateErrorAt;

    public ClientConnection(WebSocketSession raw, MessageCodec codec, int maxPerSec) {
        this.session = new ConcurrentWebSocketSessionDecorator(raw, 2000, 256 * 1024,
            ConcurrentWebSocketSessionDecorator.OverflowStrategy.DROP);
        this.codec = codec;
        this.rateLimiter = new RateLimiter(maxPerSec);
    }

    @Override
    public void send(ServerMessage message) {
        if (!session.isOpen()) return;
        try {
            session.sendMessage(new TextMessage(codec.encode(message)));
        } catch (IOException | IllegalStateException e) {
            log.debug("send failed: {}", e.getMessage());
        }
    }

    @Override
    public void close(boolean abnormal) {
        try {
            session.close(abnormal ? CloseStatus.SESSION_NOT_RELIABLE : CloseStatus.NORMAL);
        } catch (IOException e) {
            log.debug("close failed: {}", e.getMessage());
        }
    }
}
