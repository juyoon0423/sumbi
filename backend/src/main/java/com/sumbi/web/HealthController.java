package com.sumbi.web;

import com.sumbi.game.GameServer;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** 배포·로드밸런서·실행 스크립트가 서버가 떴는지 확인하는 곳 */
@RestController
public class HealthController {
    private final GameServer game;

    public HealthController(GameServer game) {
        this.game = game;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
            "status", "ok",
            "rooms", game.rooms().rooms().size(),
            "players", game.rooms().totalPlayers(),
            "waiting", game.waitingCount());
    }
}
