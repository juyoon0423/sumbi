package com.sumbi.ops;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;

/** 실제 HTTP 로 받아 보며: 디스코드 형식, 같은 종류 간격 제한, 묻힌 알림 수 덧붙이기 */
class WebhookAlertsTest {
    long now = 0;

    @Test
    void 같은_종류는_간격_안에_한_번만_그리고_묻힌_수를_덧붙임() throws Exception {
        List<String> bodies = new CopyOnWriteArrayList<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/hook", ex -> {
            bodies.add(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            ex.sendResponseHeaders(204, -1);
            ex.close();
        });
        server.start();
        try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {
            String url = "http://127.0.0.1:" + server.getAddress().getPort() + "/hook";
            WebhookAlerts alerts = new WebhookAlerts(url, null, "[숨비] ", 600_000, () -> now, exec);
            alerts.send("full", "가득 참");
            alerts.send("full", "가득 참");
            alerts.send("full", "가득 참");
            alerts.send("queue", "대기 시작");
            now += 600_000;
            alerts.send("full", "또 가득 참");
            long end = System.currentTimeMillis() + 5_000;
            while (bodies.size() < 3 && System.currentTimeMillis() < end) Thread.sleep(20);
            Thread.sleep(200); // 더 오지 않는지
        } finally {
            server.stop(0);
        }
        assertThat(bodies).hasSize(3);
        assertThat(bodies).anyMatch(b -> b.contains("\"content\":\"[숨비] 가득 참\""));
        assertThat(bodies).anyMatch(b -> b.contains("대기 시작"));
        assertThat(bodies).anyMatch(b -> b.contains("또 가득 참") && b.contains("2번 더"));
    }
}
