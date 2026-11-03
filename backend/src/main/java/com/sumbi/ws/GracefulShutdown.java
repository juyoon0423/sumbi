package com.sumbi.ws;

import com.sumbi.game.GameServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

/**
 * 우아한 종료 (docker stop → SIGTERM → 스프링 종료): 웹 서버가 멈추기 전에 가장 먼저
 * 새 입장을 막고 → 모든 연결을 1012(다시 시작 중)로 닫고 → 닫기가 나갈 때까지 잠깐 기다림.
 * 클라이언트는 1012 를 받으면 "바다를 새로 단장하고 있어요" 후 무작위로 0.3~3초 뒤 다시 붙음 (블루그린이면 새 서버로).
 */
@Component
public class GracefulShutdown implements SmartLifecycle {
    private static final Logger log = LoggerFactory.getLogger(GracefulShutdown.class);
    private static final long WAIT_MS = 3_000;

    private final GameServer game;
    private final SumbiWebSocketHandler handler;
    private volatile boolean running;

    public GracefulShutdown(GameServer game, SumbiWebSocketHandler handler) {
        this.game = game;
        this.handler = handler;
    }

    @Override
    public void start() {
        running = true;
    }

    @Override
    public void stop() {
        int n = handler.connectionCount();
        log.info("shutting down: closing {} connection(s) with 1012", n);
        game.beginShutdown();
        handler.closeAllForRestart();
        long until = System.currentTimeMillis() + WAIT_MS;
        while (handler.connectionCount() > 0 && System.currentTimeMillis() < until) {
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        log.info("shutdown: {} connection(s) left", handler.connectionCount());
        running = false;
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    /** 가장 먼저 멈춤 (웹 서버보다 앞) */
    @Override
    public int getPhase() {
        return Integer.MAX_VALUE;
    }
}
