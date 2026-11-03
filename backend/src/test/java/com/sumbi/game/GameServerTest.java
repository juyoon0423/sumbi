package com.sumbi.game;

import static org.assertj.core.api.Assertions.assertThat;

import com.sumbi.TestProps;
import com.sumbi.catalog.CustomizeCatalog;
import com.sumbi.config.SumbiProperties;
import com.sumbi.protocol.ClientMessage;
import com.sumbi.protocol.LookInfo;
import com.sumbi.protocol.NickParts;
import com.sumbi.protocol.ServerMessage;
import com.sumbi.room.MovementValidator;
import com.sumbi.room.Room;
import com.sumbi.room.RoomManager;
import com.sumbi.stats.InMemoryDailyStats;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.random.RandomGenerator;
import org.junit.jupiter.api.Test;

class GameServerTest {
    long now = 1_000_000;

    static class FakeClient implements Client {
        final List<ServerMessage> got = new ArrayList<>();
        Boolean closedAbnormal;

        @Override
        public void send(ServerMessage message) {
            got.add(message);
        }

        @Override
        public void close(boolean abnormal) {
            closedAbnormal = abnormal;
        }

        <T extends ServerMessage> List<T> of(Class<T> type) {
            return got.stream().filter(type::isInstance).map(type::cast).toList();
        }

        ServerMessage.Welcome welcome() {
            return of(ServerMessage.Welcome.class).getFirst();
        }
    }

    GameServer server(int capacity, int maxTotal) {
        SumbiProperties props = TestProps.props(capacity, maxTotal);
        MovementValidator mv = new MovementValidator(props.sea());
        RoomManager rooms = new RoomManager(capacity, id -> new Room(id, capacity, mv, 2000, 1000));
        return new GameServer(props, new CustomizeCatalog(), rooms, new InMemoryDailyStats(Clock.systemUTC()), () -> now,
            RandomGenerator.getDefault());
    }

    static ClientMessage.Hello hello(String token) {
        return new ClientMessage.Hello(1, token, "pc", new NickParts("느린", "파도"), new LookInfo("pink", "orange", "rose"));
    }

    FakeClient join(GameServer g, String token) {
        FakeClient c = new FakeClient();
        g.connected(c);
        g.received(c, hello(token));
        return c;
    }

    @Test
    void 정원이_차면_두번째_바다로() {
        GameServer g = server(2, 100);
        FakeClient a = join(g, null), b = join(g, null), c = join(g, null);
        assertThat(a.welcome().room().id()).isEqualTo("sea-1");
        assertThat(b.welcome().room().id()).isEqualTo("sea-1");
        assertThat(c.welcome().room().id()).isEqualTo("sea-2");
        assertThat(b.welcome().players()).hasSize(1);
        assertThat(a.of(ServerMessage.Join.class)).hasSize(1);
    }

    @Test
    void 잘못된_닉네임과_색은_고쳐서_welcome() {
        GameServer g = server(50, 100);
        FakeClient c = new FakeClient();
        g.connected(c);
        g.received(c, new ClientMessage.Hello(1, null, "pc", new NickParts("느린", "괴물"), new LookInfo("pink", "orange", "black")));
        var you = c.welcome().you();
        assertThat(you.nick()).startsWith("느린 ").doesNotContain("괴물");
        assertThat(you.look().towel()).isEqualTo("pink");
        assertThat(CustomizeCatalog.CHEEKS).contains(you.look().cheek());
        assertThat(you.token()).isNotBlank();
    }

    @Test
    void 전체_상한을_넘으면_대기하다가_자리가_나면_제안_받고_들어가기() {
        GameServer g = server(50, 1);
        FakeClient a = join(g, null);
        FakeClient b = join(g, null);
        assertThat(b.of(ServerMessage.Queue.class)).containsExactly(new ServerMessage.Queue(0, null));
        assertThat(b.of(ServerMessage.Welcome.class)).isEmpty();
        g.disconnected(a, false);
        // 자리가 나면 바로 들어가지 않고 "자리가 났어요" 제안 → 들어가기를 눌러야 입장
        assertThat(b.of(ServerMessage.Slot.class)).hasSize(1);
        assertThat(b.of(ServerMessage.Welcome.class)).isEmpty();
        g.received(b, new ClientMessage.Enter());
        assertThat(b.of(ServerMessage.Welcome.class)).hasSize(1);
    }

    @Test
    void 제안_중인_자리는_새로_온_사람이_새치기_못함() {
        GameServer g = server(50, 1);
        FakeClient a = join(g, null);
        FakeClient b = join(g, null);
        g.disconnected(a, false);
        FakeClient c = join(g, null);
        assertThat(c.of(ServerMessage.Welcome.class)).isEmpty();
        assertThat(c.of(ServerMessage.Queue.class)).isNotEmpty();
        g.received(b, new ClientMessage.Enter());
        assertThat(b.of(ServerMessage.Welcome.class)).hasSize(1);
        assertThat(g.rooms().totalPlayers()).isEqualTo(1);
    }

    @Test
    void 제안에_답이_없으면_맨_뒤로_가고_다음_사람에게() {
        GameServer g = new GameServerTestHelper(this).server(50, 1, 10_000);
        FakeClient a = join(g, null);
        FakeClient b = join(g, null);
        FakeClient c = join(g, null);
        g.disconnected(a, false);
        assertThat(b.of(ServerMessage.Slot.class)).hasSize(1);
        assertThat(c.of(ServerMessage.Slot.class)).isEmpty();
        now += 11_000;
        g.housekeeping();
        // b 는 맨 뒤(앞에 1명), c 가 제안 받음
        assertThat(c.of(ServerMessage.Slot.class)).hasSize(1);
        assertThat(b.of(ServerMessage.Queue.class).getLast().ahead()).isEqualTo(0);
        // 늦게 누른 b 는 들어가지 못하고 순번만 다시
        g.received(b, new ClientMessage.Enter());
        assertThat(b.of(ServerMessage.Welcome.class)).isEmpty();
        g.received(c, new ClientMessage.Enter());
        assertThat(c.of(ServerMessage.Welcome.class)).hasSize(1);
    }

    @Test
    void 상한을_서버를_끄지_않고_올리면_기다리던_사람에게_바로_제안() {
        GameServer g = server(50, 1);
        join(g, null);
        FakeClient b = join(g, null);
        FakeClient c = join(g, null);
        assertThat(g.waitingCount()).isEqualTo(2);
        g.setMaxTotal(3);
        assertThat(b.of(ServerMessage.Slot.class)).hasSize(1);
        assertThat(c.of(ServerMessage.Slot.class)).hasSize(1);
        g.received(b, new ClientMessage.Enter());
        g.received(c, new ClientMessage.Enter());
        assertThat(g.rooms().totalPlayers()).isEqualTo(3);
        // 내리면 이미 들어온 사람은 그대로, 새로 온 사람만 대기
        g.setMaxTotal(1);
        FakeClient d = join(g, null);
        assertThat(d.of(ServerMessage.Queue.class)).isNotEmpty();
        assertThat(g.rooms().totalPlayers()).isEqualTo(3);
    }

    @Test
    void 가득_차거나_대기가_생긴_순간에만_알림() {
        GameServer g = server(50, 2);
        List<String> sent = new ArrayList<>();
        g.setAlerts((key, text) -> sent.add(key));
        join(g, null);
        assertThat(sent).isEmpty();
        join(g, null);
        assertThat(sent).containsExactly("full");
        join(g, null);
        join(g, null);
        assertThat(sent).containsExactly("full", "queue");
        g.housekeeping();
        assertThat(sent).containsExactly("full", "queue");
        g.setMaxTotal(5);
        assertThat(sent).contains("cap");
    }

    @Test
    void 종료_중엔_새_입장을_받지_않음() {
        GameServer g = server(50, 100);
        g.beginShutdown();
        FakeClient a = join(g, null);
        assertThat(a.got).isEmpty();
    }

    @Test
    void 잠깐_끊겼다_같은_토큰으로_오면_같은_해녀() {
        GameServer g = server(50, 100);
        FakeClient a = join(g, null);
        FakeClient other = join(g, null);
        String token = a.welcome().you().token();
        int id = a.welcome().you().id();
        g.disconnected(a, true);
        now += 5_000;
        FakeClient back = join(g, token);
        assertThat(back.welcome().you().id()).isEqualTo(id);
        // 다른 사람에겐 leave/join 없이 그대로
        assertThat(other.of(ServerMessage.Leave.class)).isEmpty();
    }

    @Test
    void 유예_시간이_지나면_leave() {
        GameServer g = server(50, 100);
        FakeClient a = join(g, null);
        FakeClient other = join(g, null);
        g.disconnected(a, true);
        now += 25_000;
        g.housekeeping();
        assertThat(other.of(ServerMessage.Leave.class)).hasSize(1);
    }

    @Test
    void 탭을_닫으면_바로_leave_하고_빈_바다_정리() {
        GameServer g = server(50, 100);
        FakeClient a = join(g, null);
        FakeClient b = join(g, null);
        g.disconnected(a, false);
        assertThat(b.of(ServerMessage.Leave.class)).hasSize(1);
        g.disconnected(b, false);
        assertThat(g.rooms().rooms()).isEmpty();
    }

    @Test
    void 메시지가_끊기면_heartbeat_만료로_연결_정리() {
        GameServer g = server(50, 100);
        FakeClient a = join(g, null);
        now += 31_000;
        g.housekeeping();
        assertThat(a.closedAbnormal).isTrue();
    }

    @Test
    void 채집하면_오늘의_바다에_반영되어_방송() {
        GameServer g = server(50, 100);
        FakeClient a = join(g, null);
        g.received(a, new ClientMessage.Act("dive", null));
        now += 2000;
        g.received(a, new ClientMessage.Act("harvest", "abalone"));
        now += 6000;
        g.housekeeping();
        var today = a.of(ServerMessage.Today.class);
        assertThat(today).isNotEmpty();
        assertThat(today.getLast().items()).containsEntry("abalone", 1);
        assertThat(today.getLast().divers()).isEqualTo(1);
    }
}
