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
    /** surface | underwater */
    public String status = "surface";
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

    public PlayerInfo info() {
        return new PlayerInfo(id, nick.display(), look, "sea", round(pos), round(yaw), status);
    }

    static double round(double v) {
        return Math.round(v * 100) / 100.0;
    }

    static double[] round(double[] p) {
        return new double[] {round(p[0]), round(p[1]), round(p[2])};
    }

    /** 스냅샷 한 항목 [id, x, y, z, yaw] */
    public double[] snapEntry() {
        return new double[] {id, round(pos[0]), round(pos[1]), round(pos[2]), round(yaw)};
    }
}
