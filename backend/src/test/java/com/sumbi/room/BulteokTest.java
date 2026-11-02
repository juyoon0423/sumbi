package com.sumbi.room;

import static org.assertj.core.api.Assertions.assertThat;

import com.sumbi.MutableClock;
import com.sumbi.TestProps;
import com.sumbi.protocol.LookInfo;
import com.sumbi.protocol.NickParts;
import com.sumbi.protocol.PlayerInfo;
import com.sumbi.protocol.ServerMessage;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 불턱: 자리 배정, "내가 딴 것만" 손질, 공동 대야, 구역별 행동 */
class BulteokTest {
    long now = 1_000_000;
    final MutableClock clock = new MutableClock(Instant.parse("2026-11-03T03:00:00Z"));
    final PrepLedger ledger = new PrepLedger(clock);

    Room room(int basinCapacity) {
        Room.Settings s = new Room.Settings(50, 2000, 1000, 3000, 4000, basinCapacity, 4000);
        return new Room("sea-1", s, new MovementValidator(TestProps.sea()), ledger);
    }

    RecordingSink join(Room r, String token) {
        RecordingSink sink = new RecordingSink();
        r.join(token, new NickParts("작은", "소라"), new LookInfo("pink", "orange", "rose"), new double[] {0, 0, 8}, sink, null, null);
        return sink;
    }

    /** 잠수해서 따고 올라옴 */
    void harvest(Room r, int id, String item) {
        r.act(id, "dive", null, now);
        now += 1500;
        assertThat(r.act(id, "harvest", item, now)).isTrue();
        r.act(id, "surface", null, now);
    }

    @Test
    void 불턱에_들어오면_빈자리에_앉고_모두에게_알림() {
        Room r = room(20);
        RecordingSink a = join(r, "token-aaaa"), b = join(r, "token-bbbb");
        now += 1000;
        assertThat(r.changeZone(1, "bulteok", now)).isTrue();
        assertThat(r.changeZone(2, "bulteok", now)).isTrue();

        ServerMessage.ZoneChanged mine = a.of(ServerMessage.ZoneChanged.class).getFirst();
        assertThat(mine.seat()).isEqualTo(0);
        assertThat(mine.left()).containsEntry("conch", 0);
        assertThat(a.of(ServerMessage.Basin.class)).hasSize(1);
        // b 는 a 의 이동(자리 0)과 자기 자리(1)를 받음, a 의 left 는 못 봄
        List<ServerMessage.ZoneChanged> seenByB = b.of(ServerMessage.ZoneChanged.class);
        assertThat(seenByB).extracting(ServerMessage.ZoneChanged::seat).containsExactly(0, 1);
        assertThat(seenByB.getFirst().left()).isNull();

        // 1번이 나가면 자리 0이 비고, 다음 사람이 0번에 앉음
        now += 1000;
        r.changeZone(1, "sea", now);
        join(r, "token-cccc");
        now += 1000;
        r.changeZone(3, "bulteok", now);
        assertThat(r.get(3).seat).isZero();
        PlayerInfo info = r.get(2).info();
        assertThat(info.zone()).isEqualTo("bulteok");
        assertThat(info.seat()).isEqualTo(1);
        assertThat(info.st()).isEqualTo("sit");
    }

    @Test
    void 물속에서는_불턱에_못_가고_불턱에서는_위치가_고정() {
        Room r = room(20);
        join(r, "token-aaaa");
        r.act(1, "dive", null, now);
        assertThat(r.changeZone(1, "bulteok", now + 1000)).isFalse();
        r.act(1, "surface", null, now);
        assertThat(r.changeZone(1, "bulteok", now + 2000)).isTrue();

        r.move(1, new double[] {30, 0, 30}, 0, now + 2100);
        assertThat(r.snapshot(now + 2100)).isNull(); // 앉은 사람은 스냅샷에 없음

        RecordingSink watcher = join(r, "token-bbbb");
        assertThat(r.changeZone(1, "sea", now + 3000)).isTrue();
        ServerMessage.ZoneChanged back = watcher.of(ServerMessage.ZoneChanged.class).getLast();
        assertThat(back.zone()).isEqualTo("sea");
        assertThat(back.p()).hasSize(3);
        // 바다로 돌아온 뒤 첫 위치는 거리 검사 없이 받아들임
        r.move(1, new double[] {back.p()[0] + 0.5, 0, back.p()[2]}, 0, now + 3100);
        assertThat(r.get(1).pos[0]).isEqualTo(back.p()[0] + 0.5);
    }

    @Test
    void 딴_것만_손질할_수_있고_손질_중엔_새_손질_무시() {
        Room r = room(20);
        RecordingSink a = join(r, "token-aaaa");
        RecordingSink b = join(r, "token-bbbb");
        harvest(r, 1, "urchin");
        harvest(r, 1, "urchin");
        now += 1000;
        r.changeZone(1, "bulteok", now);
        r.changeZone(2, "bulteok", now);
        assertThat(a.of(ServerMessage.ZoneChanged.class).getFirst().left()).containsEntry("urchin", 2);

        assertThat(r.prep(1, "conch", now)).isFalse(); // 소라는 안 땄음
        assertThat(a.of(ServerMessage.Err.class)).extracting(ServerMessage.Err::code).containsExactly("NO_ITEM");
        assertThat(r.prep(2, "urchin", now)).isFalse(); // 남이 딴 것

        assertThat(r.prep(1, "urchin", now)).isTrue();
        assertThat(r.prep(1, "urchin", now + 1000)).isFalse(); // 아직 손질 중
        ServerMessage.Prep seen = b.of(ServerMessage.Prep.class).getFirst();
        assertThat(seen.id()).isEqualTo(1);
        assertThat(seen.item()).isEqualTo("urchin");
        assertThat(seen.left()).isEqualTo(1);

        assertThat(r.prep(1, "urchin", now + 3000)).isTrue();
        assertThat(r.prep(1, "urchin", now + 6000)).isFalse(); // 두 개 다 손질함
    }

    @Test
    void 손질이_끝나면_대야가_차고_가득_차면_축하_뒤_비움() {
        Room r = room(2);
        RecordingSink a = join(r, "token-aaaa");
        harvest(r, 1, "conch");
        harvest(r, 1, "conch");
        harvest(r, 1, "abalone");
        now += 1000;
        r.changeZone(1, "bulteok", now);

        r.prep(1, "conch", now);
        r.tickBasin(now + 2900);
        assertThat(a.of(ServerMessage.Basin.class)).hasSize(1); // 입장 때 1번뿐 (아직 손질 중)
        r.tickBasin(now + 3000);
        assertThat(a.of(ServerMessage.Basin.class).getLast().fill()).isEqualTo(1);

        r.prep(1, "conch", now + 3000);
        r.tickBasin(now + 6000);
        ServerMessage.Basin full = a.of(ServerMessage.Basin.class).getLast();
        assertThat(full.fill()).isEqualTo(2);
        assertThat(full.full()).isTrue();

        // 축하 중에 끝난 손질은 다음 대야로
        r.prep(1, "abalone", now + 6000);
        r.tickBasin(now + 9000);
        assertThat(a.of(ServerMessage.Basin.class).getLast().full()).isTrue();
        r.tickBasin(now + 10_000);
        ServerMessage.Basin next = a.of(ServerMessage.Basin.class).getLast();
        assertThat(next.round()).isEqualTo(2);
        assertThat(next.full()).isNull();
        assertThat(next.fill()).isEqualTo(1);
        assertThat(next.capacity()).isEqualTo(12); // 1명 × 4 → 최소 12
    }

    @Test
    void 구역마다_할_수_있는_행동이_다름() {
        Room r = room(20);
        RecordingSink other = join(r, "token-oooo");
        join(r, "token-aaaa");
        assertThat(r.act(2, "tangerine", null, now)).isFalse(); // 바다에서 귤 X
        assertThat(r.act(2, "breathe", null, now)).isTrue();
        assertThat(r.get(2).info().st()).isEqualTo("breathe");
        assertThat(r.act(2, "breathe", null, now)).isFalse(); // 이미 숨 고르는 중
        r.act(2, "dive", null, now);
        assertThat(r.get(2).breathing).isFalse();
        r.act(2, "surface", null, now);

        now += 1000;
        r.changeZone(2, "bulteok", now);
        assertThat(r.act(2, "breathe", null, now)).isFalse(); // 불턱에서 숨 고르기 X
        assertThat(r.act(2, "doze", null, now)).isTrue();
        assertThat(r.get(2).info().st()).isEqualTo("doze");
        assertThat(r.act(2, "wake", null, now)).isTrue();
        assertThat(r.act(2, "tangerine", null, now)).isTrue();
        assertThat(r.act(2, "tangerine", null, now + 1000)).isFalse(); // 아직 먹는 중
        assertThat(other.of(ServerMessage.Evt.class)).extracting(ServerMessage.Evt::a)
            .containsExactly("breathe", "dive", "surface", "doze", "wake", "tangerine");
    }

    @Test
    void 손질_장부는_토큰별이고_한국_자정에_비워짐() {
        ledger.addHarvest("token-aaaa", "conch");
        assertThat(ledger.left("token-aaaa")).isEqualTo(Map.of("conch", 1, "abalone", 0, "urchin", 0));
        assertThat(ledger.tryPrep("token-bbbb", "conch")).isEqualTo(-1);
        // 2026-11-03 14:59:59Z = KST 23:59:59 → 다음 순간 자정
        clock.now = Instant.parse("2026-11-03T14:59:59Z");
        assertThat(ledger.left("token-aaaa").get("conch")).isEqualTo(1);
        clock.now = Instant.parse("2026-11-03T15:00:00Z");
        assertThat(ledger.left("token-aaaa").get("conch")).isZero();
    }
}
