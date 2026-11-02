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
    void 전체_상한을_넘으면_대기하다가_자리가_나면_입장() {
        GameServer g = server(50, 1);
        FakeClient a = join(g, null);
        FakeClient b = join(g, null);
        assertThat(b.of(ServerMessage.Queue.class)).containsExactly(new ServerMessage.Queue(0));
        assertThat(b.of(ServerMessage.Welcome.class)).isEmpty();
        g.disconnected(a, false);
        assertThat(b.of(ServerMessage.Welcome.class)).hasSize(1);
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
