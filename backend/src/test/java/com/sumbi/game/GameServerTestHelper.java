package com.sumbi.game;

import com.sumbi.TestProps;
import com.sumbi.catalog.CustomizeCatalog;
import com.sumbi.config.SumbiProperties;
import com.sumbi.room.MovementValidator;
import com.sumbi.room.Room;
import com.sumbi.room.RoomManager;
import com.sumbi.stats.InMemoryDailyStats;
import java.time.Clock;
import java.util.random.RandomGenerator;

/** 자리 제안 시간을 바꿔 가며 만드는 테스트용 서버 */
record GameServerTestHelper(GameServerTest t) {
    GameServer server(int capacity, int maxTotal, long offerMs) {
        SumbiProperties props = TestProps.props(capacity, maxTotal);
        MovementValidator mv = new MovementValidator(props.sea());
        RoomManager rooms = new RoomManager(capacity, id -> new Room(id, capacity, mv, 2000, 1000));
        return new GameServer(props, new CustomizeCatalog(), rooms, new InMemoryDailyStats(Clock.systemUTC()), () -> t.now,
            RandomGenerator.getDefault(), offerMs);
    }
}
