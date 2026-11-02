package com.sumbi.protocol;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.util.List;
import java.util.Map;

/** 서버 → 클라이언트 (docs/PLAN.md 7.3) */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "t")
@JsonSubTypes({
    @JsonSubTypes.Type(value = ServerMessage.Queue.class, name = "queue"),
    @JsonSubTypes.Type(value = ServerMessage.Welcome.class, name = "welcome"),
    @JsonSubTypes.Type(value = ServerMessage.Join.class, name = "join"),
    @JsonSubTypes.Type(value = ServerMessage.Leave.class, name = "leave"),
    @JsonSubTypes.Type(value = ServerMessage.LookChanged.class, name = "look"),
    @JsonSubTypes.Type(value = ServerMessage.Snap.class, name = "snap"),
    @JsonSubTypes.Type(value = ServerMessage.Evt.class, name = "evt"),
    @JsonSubTypes.Type(value = ServerMessage.Today.class, name = "today"),
    @JsonSubTypes.Type(value = ServerMessage.ZoneChanged.class, name = "zone"),
    @JsonSubTypes.Type(value = ServerMessage.Prep.class, name = "prep"),
    @JsonSubTypes.Type(value = ServerMessage.Basin.class, name = "basin"),
    @JsonSubTypes.Type(value = ServerMessage.SeatMove.class, name = "seat"),
    @JsonSubTypes.Type(value = ServerMessage.SeatDenied.class, name = "seat_no"),
    @JsonSubTypes.Type(value = ServerMessage.Pong.class, name = "pong"),
    @JsonSubTypes.Type(value = ServerMessage.Err.class, name = "err"),
})
public sealed interface ServerMessage {

    record Queue(int ahead) implements ServerMessage {}

    /** you.p: 서버가 정해 준 시작 위치 (여럿이 겹치지 않게) */
    record You(int id, String nick, String token, LookInfo look, double[] p) {}

    record RoomInfo(String id, int capacity) {}

    record Welcome(You you, RoomInfo room, List<PlayerInfo> players, TodayStats today) implements ServerMessage {}

    record Join(PlayerInfo player) implements ServerMessage {}

    record Leave(int id) implements ServerMessage {}

    record LookChanged(int id, String nick, LookInfo look) implements ServerMessage {}

    /** ps 각 항목: [id, x, y, z, yaw] */
    record Snap(long ts, List<double[]> ps) implements ServerMessage {}

    record Evt(int id, String a, String item) implements ServerMessage {}

    record Today(int divers, Map<String, Integer> items) implements ServerMessage {
        public static Today of(TodayStats s) {
            return new Today(s.divers(), s.items());
        }
    }

    /**
     * 누군가 구역을 옮김 (본인 포함). 불턱이면 seat, 바다면 p(다시 들어갈 자리).
     * left: 본인에게만, 앞으로 손질할 수 있는 개수
     */
    record ZoneChanged(int id, String zone, Integer seat, double[] p, Map<String, Integer> left) implements ServerMessage {}

    /** 누군가 손질을 시작함 (본인 포함). left: 그 사람이 앞으로 손질할 수 있는 그 종류 개수 */
    record Prep(int id, String item, String how, int left) implements ServerMessage {}

    /** 공동 대야. full=true 면 다 같이 만세, 잠시 뒤 비운 대야(round+1) */
    record Basin(int fill, int capacity, int round, Boolean full) implements ServerMessage {}

    /** 누군가 자리를 옮기기 시작함 (본인 포함). 각 화면이 from → to 같은 길을 걸어가는 모습을 재생 */
    record SeatMove(int id, int from, int to) implements ServerMessage {}

    /** 그 자리는 이미 누가 있거나 가는 중 (본인에게만) */
    record SeatDenied(int seat) implements ServerMessage {}

    record Pong(long ts) implements ServerMessage {}

    record Err(String code, String msg) implements ServerMessage {}
}
