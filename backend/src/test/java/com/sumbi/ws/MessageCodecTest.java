package com.sumbi.ws;

import static org.assertj.core.api.Assertions.assertThat;

import com.sumbi.protocol.ClientMessage;
import com.sumbi.protocol.ServerMessage;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** PLAN 7장 메시지 모양 (프론트 protocol.ts 와 같아야 함) */
class MessageCodecTest {
    final MessageCodec codec = new MessageCodec();

    @Test
    void 불턱_메시지_읽기() throws Exception {
        assertThat(codec.decode("{\"t\":\"zone\",\"to\":\"bulteok\"}")).isEqualTo(new ClientMessage.Zone("bulteok"));
        assertThat(codec.decode("{\"t\":\"prep\",\"item\":\"urchin\"}")).isEqualTo(new ClientMessage.Prep("urchin", null));
    }

    @Test
    void 불턱_메시지_쓰기_빈_값은_뺌() {
        assertThat(codec.encode(new ServerMessage.ZoneChanged(7, "bulteok", 11, null, null)))
            .isEqualTo("{\"t\":\"zone\",\"id\":7,\"zone\":\"bulteok\",\"seat\":11}");
        assertThat(codec.encode(new ServerMessage.ZoneChanged(7, "bulteok", 0, null, Map.of("conch", 2))))
            .contains("\"left\":{\"conch\":2}");
        assertThat(codec.encode(new ServerMessage.Prep(5, "urchin", "tap", 2)))
            .isEqualTo("{\"t\":\"prep\",\"id\":5,\"item\":\"urchin\",\"how\":\"tap\",\"left\":2}");
        assertThat(codec.encode(new ServerMessage.Basin(13, 20, 4, null)))
            .isEqualTo("{\"t\":\"basin\",\"fill\":13,\"capacity\":20,\"round\":4}");
        assertThat(codec.encode(new ServerMessage.Basin(20, 20, 4, true))).endsWith("\"full\":true}");
    }
}
