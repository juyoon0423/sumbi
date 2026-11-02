package com.sumbi.room;

import com.sumbi.protocol.ServerMessage;
import java.util.ArrayList;
import java.util.List;

/** 받은 메시지를 모아 두는 가짜 연결 */
public class RecordingSink implements MessageSink {
    public final List<ServerMessage> got = new ArrayList<>();

    @Override
    public void send(ServerMessage message) {
        got.add(message);
    }

    public <T extends ServerMessage> List<T> of(Class<T> type) {
        return got.stream().filter(type::isInstance).map(type::cast).toList();
    }
}
