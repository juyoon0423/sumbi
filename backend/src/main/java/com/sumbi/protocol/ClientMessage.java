package com.sumbi.protocol;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/** 클라이언트 → 서버 (docs/PLAN.md 7.2). "t" 필드로 종류 구분 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "t")
@JsonSubTypes({
    @JsonSubTypes.Type(value = ClientMessage.Hello.class, name = "hello"),
    @JsonSubTypes.Type(value = ClientMessage.Look.class, name = "look"),
    @JsonSubTypes.Type(value = ClientMessage.Move.class, name = "move"),
    @JsonSubTypes.Type(value = ClientMessage.Act.class, name = "act"),
    @JsonSubTypes.Type(value = ClientMessage.Zone.class, name = "zone"),
    @JsonSubTypes.Type(value = ClientMessage.Ping.class, name = "ping"),
})
public sealed interface ClientMessage {

    record Hello(Integer v, String token, String device, NickParts nick, LookInfo look) implements ClientMessage {}

    record Look(NickParts nick, LookInfo look) implements ClientMessage {}

    record Move(double[] p, double r) implements ClientMessage {}

    record Act(String a, String item) implements ClientMessage {}

    record Zone(String to) implements ClientMessage {}

    record Ping(long ts) implements ClientMessage {}
}
