package com.sumbi.room;

import static org.assertj.core.api.Assertions.assertThat;

import com.sumbi.MutableClock;
import com.sumbi.TestProps;
import com.sumbi.protocol.LookInfo;
import com.sumbi.protocol.NickParts;
import com.sumbi.protocol.ServerMessage;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

/** 불턱 자리 옮겨 앉기: 서버가 자리를 정하고, 같은 자리는 한 명만 */
class SeatMoveTest {
    long now = 1_000_000;
    final PrepLedger ledger = new PrepLedger(new MutableClock(Instant.parse("2026-11-03T03:00:00Z")));

    Room room() {
        Room.Settings s = new Room.Settings(50, 2000, 1000, 3000, 4000, 20, 4000);
        return new Room("sea-1", s, new MovementValidator(TestProps.sea()), ledger);
    }

    RecordingSink joinBulteok(Room r, String token) {
        RecordingSink sink = new RecordingSink();
        var info = r.join(token, new NickParts("작은", "소라"), new LookInfo("pink", "orange", "rose"), new double[] {0, 0, 8}, sink, null, null);
        assertThat(info).isNotNull();
        return sink;
    }

    void enterAll(Room r, int n) {
        now += 1000;
        for (int id = 1; id <= n; id++) assertThat(r.changeZone(id, "bulteok", now)).isTrue();
    }

    @Test
    void 빈자리를_고르면_승인되고_모두가_같은_이동을_받음() {
        Room r = room();
        RecordingSink a = joinBulteok(r, "token-aaaa"), b = joinBulteok(r, "token-bbbb");
        enterAll(r, 2); // 1 → 0번, 2 → 1번
        assertThat(r.requestSeat(1, 7, now)).isTrue();
        assertThat(r.get(1).seat).isEqualTo(7);
        assertThat(r.get(1).walkUntil).isEqualTo(now + SeatPath.walkMs(0, 7));
        for (RecordingSink s : List.of(a, b)) {
            assertThat(s.of(ServerMessage.SeatMove.class)).containsExactly(new ServerMessage.SeatMove(1, 0, 7));
        }
        // 원래 자리 0번은 바로 빔
        assertThat(r.requestSeat(2, 0, now)).isTrue();
        // 걷는 중에도 7번은 1번 해녀 자리
        assertThat(r.requestSeat(2, 7, now + 100)).isFalse();
        assertThat(b.of(ServerMessage.SeatDenied.class)).containsExactly(new ServerMessage.SeatDenied(7));
        assertThat(a.of(ServerMessage.SeatDenied.class)).isEmpty(); // 거절은 본인에게만
    }

    @Test
    void 걷는_중에_다른_자리를_고르면_방향을_바꿈() {
        Room r = room();
        RecordingSink a = joinBulteok(r, "token-aaaa");
        enterAll(r, 1);
        r.requestSeat(1, 5, now);
        assertThat(r.requestSeat(1, 9, now + 500)).isTrue();
        assertThat(a.of(ServerMessage.SeatMove.class)).extracting(ServerMessage.SeatMove::to).containsExactly(5, 9);
        assertThat(r.get(1).seat).isEqualTo(9);
    }

    @Test
    void 걷는_동안엔_손질_귤_졸기를_못함() {
        Room r = room();
        joinBulteok(r, "token-aaaa");
        enterAll(r, 1);
        r.requestSeat(1, 6, now);
        assertThat(r.act(1, "tangerine", null, now + 200)).isFalse();
        assertThat(r.act(1, "doze", null, now + 200)).isFalse();
        long after = r.get(1).walkUntil + 1;
        assertThat(r.act(1, "tangerine", null, after)).isTrue();
    }

    @Test
    void 귤_까먹는_중이거나_자리_밖_번호면_거절() {
        Room r = room();
        RecordingSink a = joinBulteok(r, "token-aaaa");
        enterAll(r, 1);
        assertThat(r.requestSeat(1, 24, now)).isFalse();
        assertThat(r.requestSeat(1, -1, now)).isFalse();
        assertThat(r.act(1, "tangerine", null, now)).isTrue();
        assertThat(r.requestSeat(1, 3, now + 100)).isFalse();
        assertThat(a.of(ServerMessage.SeatDenied.class)).hasSize(3);
        assertThat(r.get(1).seat).isZero();
    }

    @Test
    void 바다에_있으면_자리_요청은_무시() {
        Room r = room();
        RecordingSink a = joinBulteok(r, "token-aaaa");
        assertThat(r.requestSeat(1, 3, now)).isFalse();
        assertThat(a.of(ServerMessage.SeatDenied.class)).isEmpty();
    }

    @Test
    void 걷는_중에_끊기면_목적지_자리가_비고_바다로() {
        Room r = room();
        RecordingSink b = joinBulteok(r, "token-aaaa");
        joinBulteok(r, "token-bbbb");
        enterAll(r, 2);
        r.requestSeat(1, 8, now);
        r.detach(1, now + 300, now + 10_000);
        assertThat(r.get(1).inBulteok()).isFalse();
        assertThat(r.get(1).seat).isEqualTo(-1);
        assertThat(r.requestSeat(2, 8, now + 400)).isTrue();
        // 앉아 있을 때 끊기면 자리는 유예 동안 그대로
        r.detach(2, r.get(2).walkUntil + 1, now + 20_000);
        assertThat(r.get(2).inBulteok()).isTrue();
        assertThat(b.got).isNotEmpty();
    }

    @Test
    void 같은_자리를_동시에_눌러도_한_명만_앉음() throws Exception {
        for (int round = 0; round < 50; round++) {
            Room r = room();
            int n = 16;
            for (int i = 0; i < n; i++) joinBulteok(r, "token-" + round + "-" + i + "-xxxx");
            enterAll(r, n); // 0~15번 자리
            int target = 20;
            AtomicInteger approved = new AtomicInteger();
            CountDownLatch go = new CountDownLatch(1);
            java.util.concurrent.CyclicBarrier raced = new java.util.concurrent.CyclicBarrier(n);
            ExecutorService pool = Executors.newFixedThreadPool(n);
            List<java.util.concurrent.Future<?>> fs = new ArrayList<>();
            for (int id = 1; id <= n; id++) {
                int me = id;
                fs.add(pool.submit(() -> {
                    go.await();
                    // 같은 자리를 노리거나, 아무 빈 자리나 마구 고름
                    if (r.requestSeat(me, target, now)) approved.incrementAndGet();
                    raced.await(5, TimeUnit.SECONDS);
                    for (int k = 0; k < 20; k++) r.requestSeat(me, (me * 7 + k * 5) % SeatPath.RING_SEATS, now + k);
                    return null;
                }));
            }
            go.countDown();
            for (var f : fs) f.get(5, TimeUnit.SECONDS);
            pool.shutdown();
            assertThat(approved.get()).isEqualTo(1);
            Set<Integer> seats = new HashSet<>();
            for (int id = 1; id <= n; id++) assertThat(seats.add(r.get(id).seat)).as("자리 겹침 %s", r.get(id).seat).isTrue();
        }
    }

    @Test
    void 걷는_시간은_길이에_비례하고_모닥불을_가로지르지_않음() {
        // 안쪽 마주 보는 자리(0 → 6): 고리를 반 바퀴 돌아야 함 (지름으로 가로지르면 4.1m)
        assertThat(SeatPath.length(0, 6)).isGreaterThan(Math.PI * 2.6 - 0.01);
        assertThat(SeatPath.walkMs(0, 1)).isLessThan(SeatPath.walkMs(0, 6));
        // 담 밖에서는 입구로 들어옴
        assertThat(SeatPath.length(24, 12)).isGreaterThan(SeatPath.radius(24) - SeatPath.radius(12));
    }
}
