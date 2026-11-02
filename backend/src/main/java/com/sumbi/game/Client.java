package com.sumbi.game;

import com.sumbi.room.MessageSink;

/** 접속 하나 (WebSocket 세션). 테스트에서는 가짜 구현 */
public interface Client extends MessageSink {
    /** 연결 끊기. abnormal 이면 잠깐 끊긴 것으로 보고 재접속 유예 */
    void close(boolean abnormal);
}
