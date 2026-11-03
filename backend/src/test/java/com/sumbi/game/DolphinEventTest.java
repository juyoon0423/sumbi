package com.sumbi.game;

import static org.assertj.core.api.Assertions.assertThat;

import com.sumbi.TestProps;
import com.sumbi.catalog.CustomizeCatalog;
import com.sumbi.config.SumbiProperties;
import com.sumbi.game.GameServerTest.FakeClient;
import com.sumbi.protocol.ClientMessage;
import com.sumbi.protocol.ServerMessage;
import com.sumbi.room.MovementValidator;
import com.sumbi.room.Room;
import com.sumbi.room.RoomManager;
import com.sumbi.sea.DolphinSchedule;
import com.sumbi.stats.InMemoryDailyStats;
import java.time.Clock;
import java.util.SplittableRandom;
import org.junit.jupiter.api.Test;

/** 남방큰돌고래: 서버가 바다마다 정해 같은 바다 모두에게, 늦게 온 사람도 남은 장면, 오늘의 바다 횟수 */
class DolphinEventTest {
    long now = 1_000_000;
    static final DolphinSchedule.Settings S = new DolphinSchedule.Settings(60_000, 30_000, 120_000);
    InMemoryDailyStats stats = new InMemoryDailyStats(Clock.systemUTC());

    GameServer server(int capacity, boolean dev) {
        SumbiProperties props = TestProps.props(capacity, 100);
        MovementValidator mv = new MovementValidator(props.sea());
        RoomManager rooms = new RoomManager(capacity, id -> new Room(id, capacity, mv, 2000, 1000));
        GameServer g = new GameServer(props, new CustomizeCatalog(), rooms, stats, () -> now, new SplittableRandom(11));
        g.setSeaFriends(S, dev);
        return g;
    }

    FakeClient join(GameServer g, String token) {
        FakeClient c = new FakeClient();
        g.connected(c);
        g.received(c, GameServerTest.hello(token));
        return c;
    }

    /** 1초씩 housekeeping 을 돌리며 시간을 보냄 */
    void advance(GameServer g, long ms) {
        for (long t = 0; t < ms; t += 1000) {
            now += 1000;
            g.housekeeping();
        }
    }

    @Test
    void 같은_바다의_모두가_같은_돌고래를_같은_순간에() {
        GameServer g = server(2, false);
        FakeClient a = join(g, null), b = join(g, null), other = join(g, null); // other 는 두 번째 바다
        g.housekeeping();
        long next = g.nextDolphinAt("sea-1");
        assertThat(next - now).isBetween(S.minMs(), S.maxMs());
        advance(g, next - now + 1000);
        var da = a.of(ServerMessage.Dolphin.class);
        var db = b.of(ServerMessage.Dolphin.class);
        assertThat(da).hasSize(1);
        assertThat(db).hasSize(1);
        assertThat(db.getFirst()).usingRecursiveComparison().isEqualTo(da.getFirst());
        assertThat(da.getFirst().el()).isLessThan(1000);
        // 다른 바다는 자기 일정대로 (같은 순간에 나오지 않음)
        long otherNext = g.nextDolphinAt("sea-2");
        assertThat(other.of(ServerMessage.Dolphin.class)).hasSize(now >= otherNext ? 1 : 0);
        assertThat(stats.snapshot().dolphins()).isGreaterThanOrEqualTo(1);
    }

    @Test
    void 지나가는_중에_들어온_사람은_남은_장면부터() {
        GameServer g = server(50, false);
        FakeClient a = join(g, null);
        g.housekeeping();
        advance(g, g.nextDolphinAt("sea-1") - now + 1000);
        ServerMessage.Dolphin first = a.of(ServerMessage.Dolphin.class).getFirst();
        now += 5_000;
        FakeClient late = join(g, null);
        // welcome 바로 다음에 돌고래
        int w = late.got.indexOf(late.welcome());
        assertThat(late.got.get(w + 1)).isInstanceOf(ServerMessage.Dolphin.class);
        ServerMessage.Dolphin d = (ServerMessage.Dolphin) late.got.get(w + 1);
        assertThat(d.seq()).isEqualTo(first.seq());
        // 같은 장면의 5초 뒤부터 (advance 가 시작 뒤 1초 더 흐른 것까지)
        assertThat(d.el()).isBetween(5_000L, 6_000L);
        assertThat(d.dur()).isEqualTo(first.dur());
        // 다 지나간 뒤에 온 사람은 받지 않음
        now += first.dur();
        FakeClient after = join(g, null);
        assertThat(after.of(ServerMessage.Dolphin.class)).isEmpty();
    }

    @Test
    void 오늘의_바다에_돌고래_횟수() {
        GameServer g = server(50, false);
        FakeClient a = join(g, null);
        g.housekeeping();
        advance(g, g.nextDolphinAt("sea-1") - now + 1000);
        advance(g, g.nextDolphinAt("sea-1") - now + 1000);
        assertThat(a.of(ServerMessage.Dolphin.class)).hasSize(2);
        assertThat(stats.snapshot().dolphins()).isEqualTo(2);
        advance(g, 6_000);
        assertThat(a.of(ServerMessage.Today.class).getLast().dolphins()).isEqualTo(2);
    }

    @Test
    void 개발용_바로_부르기는_설정이_켜져_있을_때만() {
        GameServer off = server(50, false);
        FakeClient a = join(off, null);
        off.received(a, new ClientMessage.Dev("dolphin"));
        assertThat(a.of(ServerMessage.Dolphin.class)).isEmpty();

        GameServer on = server(50, true);
        FakeClient b = join(on, null), c = join(on, null);
        on.received(b, new ClientMessage.Dev("dolphin"));
        assertThat(b.of(ServerMessage.Dolphin.class)).hasSize(1);
        assertThat(c.of(ServerMessage.Dolphin.class)).hasSize(1);
        // 지나가는 중엔 또 부를 수 없음
        on.received(b, new ClientMessage.Dev("dolphin"));
        assertThat(b.of(ServerMessage.Dolphin.class)).hasSize(1);
    }

    @Test
    void 빈_바다가_정리되면_일정도_정리() {
        GameServer g = server(50, false);
        FakeClient a = join(g, null);
        g.housekeeping();
        assertThat(g.nextDolphinAt("sea-1")).isNotNull();
        g.disconnected(a, false);
        g.housekeeping();
        assertThat(g.nextDolphinAt("sea-1")).isNull();
    }
}
