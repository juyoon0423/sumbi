package com.sumbi.ws;

import com.sumbi.config.SumbiProperties;
import com.sumbi.game.GameServer;
import com.sumbi.protocol.ClientMessage;
import com.sumbi.protocol.ServerMessage;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/** /ws : 연결·메시지·종료를 GameServer 로 넘김. 크기·속도 제한과 JSON 해석은 여기서 */
@Component
public class SumbiWebSocketHandler extends TextWebSocketHandler {
    private final GameServer game;
    private final MessageCodec codec;
    private final SumbiProperties props;
    private final Map<String, ClientConnection> connections = new ConcurrentHashMap<>();

    public SumbiWebSocketHandler(GameServer game, MessageCodec codec, SumbiProperties props) {
        this.game = game;
        this.codec = codec;
        this.props = props;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        ClientConnection c = new ClientConnection(session, codec, props.maxMessagesPerSec());
        connections.put(session.getId(), c);
        game.connected(c);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        ClientConnection c = connections.get(session.getId());
        if (c == null) return;
        long now = System.currentTimeMillis();
        if (message.getPayload().getBytes(StandardCharsets.UTF_8).length > props.maxMessageBytes()) {
            c.send(new ServerMessage.Err("TOO_BIG", "message too large"));
            return;
        }
        if (!c.rateLimiter.tryAcquire(now)) {
            if (now - c.lastRateErrorAt > 1000) {
                c.lastRateErrorAt = now;
                c.send(new ServerMessage.Err("RATE_LIMIT", "too many messages"));
            }
            return;
        }
        ClientMessage msg;
        try {
            msg = codec.decode(message.getPayload());
        } catch (Exception e) {
            c.send(new ServerMessage.Err("BAD_MESSAGE", "cannot read message"));
            return;
        }
        if (msg != null) game.received(c, msg);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        ClientConnection c = connections.remove(session.getId());
        if (c == null) return;
        // 1000(정상)·1001(탭 닫기·페이지 이동)은 바로 퇴장, 그 외(네트워크 끊김·heartbeat 만료)는 재접속 유예
        int code = status.getCode();
        boolean abnormal = code != CloseStatus.NORMAL.getCode() && code != CloseStatus.GOING_AWAY.getCode();
        game.disconnected(c, abnormal);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        // afterConnectionClosed 가 뒤이어 불림
    }
}
