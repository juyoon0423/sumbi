package com.sumbi.ws;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectReader;
import com.fasterxml.jackson.databind.ObjectWriter;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.sumbi.protocol.ClientMessage;
import com.sumbi.protocol.ServerMessage;
import org.springframework.stereotype.Component;

/** JSON ↔ 메시지 record */
@Component
public class MessageCodec {
    private final ObjectReader reader;
    private final ObjectWriter writer;

    public MessageCodec() {
        JsonMapper mapper = JsonMapper.builder()
            .defaultPropertyInclusion(JsonInclude.Value.construct(JsonInclude.Include.NON_NULL, JsonInclude.Include.NON_NULL))
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();
        reader = mapper.readerFor(ClientMessage.class);
        writer = mapper.writerFor(ServerMessage.class);
    }

    public ClientMessage decode(String json) throws JsonProcessingException {
        return reader.readValue(json);
    }

    /** 방송 루프는 같은 메시지를 여러 명에게 보내므로, 스레드마다 직전 결과를 재사용 */
    private final ThreadLocal<Object[]> last = new ThreadLocal<>();

    public byte[] encodeBytes(ServerMessage message) {
        Object[] l = last.get();
        if (l != null && l[0] == message) return (byte[]) l[1];
        try {
            byte[] bytes = writer.writeValueAsBytes(message);
            last.set(new Object[] {message, bytes});
            return bytes;
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    public String encode(ServerMessage message) {
        try {
            return writer.writeValueAsString(message);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
