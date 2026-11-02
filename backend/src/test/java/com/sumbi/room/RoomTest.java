package com.sumbi.room;

import static org.assertj.core.api.Assertions.assertThat;

import com.sumbi.TestProps;
import com.sumbi.player.Player;
import com.sumbi.protocol.LookInfo;
import com.sumbi.protocol.NickParts;
import com.sumbi.protocol.ServerMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RoomTest {
    static final NickParts NICK = new NickParts("느린", "파도");
    static final LookInfo LOOK = new LookInfo("pink", "orange", "rose");

    Room room;
    RecordingSink a = new RecordingSink();
    RecordingSink b = new RecordingSink();
    RecordingSink c = new RecordingSink();
    Player pa, pb, pc;

    @BeforeEach
    void setUp() {
        room = new Room("sea-1", 50, new MovementValidator(TestProps.sea()), 2000, 1000);
        pa = room.join("token-a", NICK, LOOK, new double[] {0, 0, 8}, a, null, null);
        pb = room.join("token-b", NICK, LOOK, new double[] {1, 0, 8}, b, null, null);
        pc = room.join("token-c", NICK, LOOK, new double[] {2, 0, 8}, c, null, null);
    }

    @Test
    void 입장하면_다른_사람들에게만_join_방송() {
        assertThat(a.of(ServerMessage.Join.class)).extracting(j -> j.player().id()).containsExactly(pb.id, pc.id);
        assertThat(c.of(ServerMessage.Join.class)).isEmpty();
        assertThat(pa.id).isEqualTo(1);
        assertThat(pc.id).isEqualTo(3);
    }

    @Test
    void 위치는_저장만_하고_틱에서_한_번에_묶어_보냄() {
        room.move(pa.id, new double[] {0.5, 0, 8}, 1.0, 1000);
        room.move(pa.id, new double[] {0.7, 0, 8}, 1.1, 1050);
        room.move(pb.id, new double[] {1.2, -1, 8}, 2.0, 1060);
        assertThat(c.of(ServerMessage.Snap.class)).isEmpty(); // 아직 안 보냄

        ServerMessage.Snap snap = room.snapshot(1100);
        assertThat(snap.ps()).hasSize(2); // a는 두 번 움직였어도 마지막 위치 하나만
        assertThat(snap.ps().get(0)).containsExactly(pa.id, 0.7, 0, 8, 1.1);
        assertThat(c.of(ServerMessage.Snap.class)).hasSize(1);

        // 다음 틱: 아무도 안 움직였으면 보내지 않음
        assertThat(room.snapshot(1200)).isNull();
        assertThat(c.of(ServerMessage.Snap.class)).hasSize(1);
    }

    @Test
    void 행동은_즉시_다른_사람에게_방송() {
        assertThat(room.act(pa.id, "sumbi", null, 1000)).isTrue();
        assertThat(b.of(ServerMessage.Evt.class)).containsExactly(new ServerMessage.Evt(pa.id, "sumbi", null));
        assertThat(a.of(ServerMessage.Evt.class)).isEmpty();
        assertThat(room.act(pa.id, "fly", null, 1000)).isFalse();
    }

    @Test
    void 채집은_물속에서만_1초_간격() {
        assertThat(room.act(pa.id, "harvest", "conch", 1000)).isFalse(); // 수면
        room.act(pa.id, "dive", null, 1000);
        assertThat(room.act(pa.id, "harvest", "conch", 2000)).isTrue();
        assertThat(room.act(pa.id, "harvest", "conch", 2500)).isFalse(); // 너무 빠름
        assertThat(room.act(pa.id, "harvest", "pearl", 4000)).isFalse(); // 없는 해산물
        assertThat(room.act(pa.id, "harvest", "urchin", 4000)).isTrue();
    }

    @Test
    void 꾸미기_변경은_2초에_한_번() {
        NickParts n2 = new NickParts("작은", "소라");
        assertThat(room.changeLook(pa.id, n2, LOOK, 5000)).isTrue();
        assertThat(room.changeLook(pa.id, NICK, LOOK, 6000)).isFalse();
        assertThat(b.of(ServerMessage.LookChanged.class)).containsExactly(new ServerMessage.LookChanged(pa.id, "작은 소라", LOOK));
    }

    @Test
    void 잠깐_끊기면_자리를_지키고_같은_토큰으로_돌아옴() {
        room.detach(pb.id, 5000);
        assertThat(room.size()).isEqualTo(3);
        assertThat(room.reattach(pb.id, "wrong", new RecordingSink(), NICK, LOOK, null)).isNull();
        RecordingSink back = new RecordingSink();
        assertThat(room.reattach(pb.id, "token-b", back, NICK, LOOK, p -> new ServerMessage.Pong(1))).isSameAs(pb);
        assertThat(back.got).hasSize(1);
    }

    @Test
    void 유예_시간이_지나면_정리하고_leave_방송() {
        room.detach(pb.id, 5000);
        assertThat(room.removeExpired(4000)).isZero();
        assertThat(room.removeExpired(5000)).isEqualTo(1);
        assertThat(a.of(ServerMessage.Leave.class)).containsExactly(new ServerMessage.Leave(pb.id));
    }

    @Test
    void 빈_번호를_다시_쓰고_재접속은_원래_번호() {
        room.remove(pb.id);
        Player again = room.join("token-b", NICK, LOOK, new double[] {0, 0, 8}, new RecordingSink(), pb.id, null);
        assertThat(again.id).isEqualTo(pb.id);
        Player d = room.join("token-d", NICK, LOOK, new double[] {0, 0, 8}, new RecordingSink(), 1, null);
        assertThat(d.id).isEqualTo(4); // 1번은 사용 중이라 다음 빈 번호
    }
}
