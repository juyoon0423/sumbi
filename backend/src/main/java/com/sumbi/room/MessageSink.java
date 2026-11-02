package com.sumbi.room;

import com.sumbi.protocol.ServerMessage;

/** 해녀 한 명에게 메시지 보내기 (실제로는 WebSocket 연결, 테스트에서는 기록용) */
@FunctionalInterface
public interface MessageSink {
    void send(ServerMessage message);
}
