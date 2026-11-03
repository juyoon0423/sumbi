package com.sumbi.ws;

import com.sumbi.config.SumbiProperties;
import com.sumbi.game.GameServer;
import com.sumbi.protocol.ClientMessage;
import com.sumbi.protocol.ServerMessage;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/** /ws : 연결·메시지·종료를 GameServer 로 넘김. 크기·속도 제한과 JSON 해석은 여기서 */
@Component
public class SumbiWebSocketHandler extends TextWebSocketHandler implements ClientConnection.Listener {
    private final GameServer game;
    private final MessageCodec codec;
    private final SumbiProperties props;
    private final Executor sendExecutor;
    private final Map<String, ClientConnection> connections = new ConcurrentHashMap<>();

    public SumbiWebSocketHandler(GameServer game, MessageCodec codec, SumbiProperties props,
            @Qualifier("sendExecutor") Executor sendExecutor) {
        this.game = game;
        this.codec = codec;
        this.props = props;
        this.sendExecutor = sendExecutor;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        ClientConnection c = new ClientConnection(session, codec, props.maxMessagesPerSec(),
            new ClientConnection.Limits(props.sendTimeLimitMs(), props.sendBufferBytes()), sendExecutor,
            System::currentTimeMillis, this);
        connections.put(session.getId(), c);
        game.connected(c);
        // 종료 중에 들어온 연결: 바로 "다시 시작 중"으로 닫아 새 서버로 다시 붙게
        if (game.isClosing()) c.closeForRestart();
    }

    /** 서버 종료: 모든 연결을 1012(다시 시작 중)로 닫음 */
    public void closeAllForRestart() {
        for (ClientConnection c : connections.values()) c.closeForRestart();
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
        ClientConnection c = connections.get(session.getId());
        if (c == null) return;
        // 1000(정상)·1001(탭 닫기·페이지 이동)은 바로 퇴장, 그 외(네트워크 끊김·heartbeat 만료)는 재접속 유예
        int code = status.getCode();
        boolean abnormal = code != CloseStatus.NORMAL.getCode() && code != CloseStatus.GOING_AWAY.getCode();
        dead(c, abnormal);
    }

    /** 세션 종료 또는 서버가 연결을 정리함 (느린 연결, heartbeat). 둘 중 먼저 온 쪽만 처리 */
    @Override
    public void dead(ClientConnection c, boolean abnormal) {
        if (connections.remove(c.id(), c)) game.disconnected(c, abnormal);
    }

    public int connectionCount() {
        return connections.size();
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        // afterConnectionClosed 가 뒤이어 불림
    }
}
