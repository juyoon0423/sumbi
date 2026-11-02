package com.sumbi.player;

import com.sumbi.protocol.LookInfo;
import com.sumbi.protocol.NickParts;
import com.sumbi.protocol.PlayerInfo;
import com.sumbi.room.MessageSink;

/** 방 안의 해녀 한 명. 방(Room)의 잠금 안에서만 바꾼다 */
public class Player {
    public final int id;
    public final String token;
    public NickParts nick;
    public LookInfo look;
    public final double[] pos;
    public double yaw;
    /** surface | underwater (바다에서) */
    public String status = "surface";
    /** sea | bulteok */
    public String zone = "sea";
    /** 불턱 자리 번호 (바다에 있으면 -1) */
    public int seat = -1;
    /** 손질 중이면 끝나는 시각 (ms) */
    public long prepUntil;
    /** 귤 까먹기 등 쉬기 동작이 끝나는 시각 (ms) */
    public long restUntil;
    public boolean dozing;
    /** 수면에서 숨 고르기 중 */
    public boolean breathing;
    public long lastZoneAt;
    /** 마지막 위치 갱신 시각 (ms). 0이면 아직 클라이언트가 위치를 안 보냄 */
    public long lastMoveAt;
    public long lastHarvestAt;
    public long lastLookAt;
    /** 이번 틱에 움직였는지 (스냅샷에 넣을지) */
    public boolean moved;
    /** 연결이 잠깐 끊긴 동안은 null */
    public MessageSink sink;
    /** 끊긴 채로 이 시각이 지나면 방에서 뺌 (ms). 연결 중이면 0 */
    public long detachedUntil;

    public Player(int id, String token, NickParts nick, LookInfo look, double[] pos, MessageSink sink) {
        this.id = id;
        this.token = token;
        this.nick = nick;
        this.look = look;
        this.pos = pos.clone();
        this.sink = sink;
    }

    public void send(com.sumbi.protocol.ServerMessage message) {
        MessageSink s = sink;
        if (s != null) s.send(message);
    }

    public boolean inBulteok() {
        return "bulteok".equals(zone);
    }

    public PlayerInfo info() {
        if (inBulteok()) {
            return new PlayerInfo(id, nick.display(), look, zone, null, round(yaw), seat, dozing ? "doze" : "sit");
        }
        return new PlayerInfo(id, nick.display(), look, zone, round(pos), round(yaw), null, breathing ? "breathe" : status);
    }

    public static double round(double v) {
        return Math.round(v * 100) / 100.0;
    }

    public static double[] round(double[] p) {
        return new double[] {round(p[0]), round(p[1]), round(p[2])};
    }

    /** 스냅샷 한 항목 [id, x, y, z, yaw] */
    public double[] snapEntry() {
        return new double[] {id, round(pos[0]), round(pos[1]), round(pos[2]), round(yaw)};
    }
}
