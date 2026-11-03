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
    @JsonSubTypes.Type(value = ClientMessage.Prep.class, name = "prep"),
    @JsonSubTypes.Type(value = ClientMessage.Seat.class, name = "seat"),
    @JsonSubTypes.Type(value = ClientMessage.Ping.class, name = "ping"),
    @JsonSubTypes.Type(value = ClientMessage.Enter.class, name = "enter"),
    @JsonSubTypes.Type(value = ClientMessage.Dev.class, name = "dev"),
})
public sealed interface ClientMessage {

    record Hello(Integer v, String token, String device, NickParts nick, LookInfo look) implements ClientMessage {}

    record Look(NickParts nick, LookInfo look) implements ClientMessage {}

    record Move(double[] p, double r) implements ClientMessage {}

    record Act(String a, String item) implements ClientMessage {}

    record Zone(String to) implements ClientMessage {}

    /** 불턱에서 손질 시작. how: tap(기본) */
    record Prep(String item, String how) implements ClientMessage {}

    /** 불턱에서 이 자리로 옮겨 앉고 싶음 (서버가 승인하면 seat 방송) */
    record Seat(Integer seat) implements ClientMessage {}

    record Ping(long ts) implements ClientMessage {}

    /** 대기하다 자리가 났다는 slot 을 받고 들어가겠다고 함 */
    record Enter() implements ClientMessage {}

    /** 개발용: 바로 불러 보기 (a = "dolphin"). 서버 설정 sumbi.sea-friends.dev-events 가 켜져 있을 때만 */
    record Dev(String a) implements ClientMessage {}
}
