package com.sumbi.room;

import static org.assertj.core.api.Assertions.assertThat;

import com.sumbi.TestProps;
import com.sumbi.protocol.LookInfo;
import com.sumbi.protocol.NickParts;
import org.junit.jupiter.api.Test;

class RoomManagerTest {
    final MovementValidator mv = new MovementValidator(TestProps.sea());
    final RoomManager manager = new RoomManager(3, id -> new Room(id, 3, mv, 2000, 1000));

    void fill(Room r, int n) {
        for (int i = 0; i < n; i++) {
            r.join("t" + i, new NickParts("느린", "파도"), new LookInfo("pink", "orange", "rose"), new double[] {0, 0, 8},
                new RecordingSink(), null, null);
        }
    }

    @Test
    void 자리가_있으면_같은_바다_꽉_차면_새_바다() {
        Room first = manager.assign();
        fill(first, 2);
        assertThat(manager.assign()).isSameAs(first);
        fill(first, 1);
        Room second = manager.assign();
        assertThat(second).isNotSameAs(first);
        assertThat(second.id).isEqualTo("sea-2");
        assertThat(manager.rooms()).hasSize(2);
    }

    @Test
    void 앞_바다에_자리가_나면_다시_앞_바다부터() {
        Room first = manager.assign();
        fill(first, 3);
        Room second = manager.assign();
        fill(second, 1);
        first.remove(1);
        assertThat(manager.assign()).isSameAs(first);
    }

    @Test
    void 빈_바다는_정리() {
        Room first = manager.assign();
        manager.removeIfEmpty(first);
        assertThat(manager.rooms()).isEmpty();
        assertThat(manager.totalPlayers()).isZero();
    }
}
