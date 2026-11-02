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

    public String encode(ServerMessage message) {
        try {
            return writer.writeValueAsString(message);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
