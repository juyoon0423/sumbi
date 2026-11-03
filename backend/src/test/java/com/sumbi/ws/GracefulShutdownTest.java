package com.sumbi.ws;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.annotation.DirtiesContext;

/** 서버 종료(배포) 때 연결을 1012(다시 시작 중)로 닫고, 그 뒤 새 연결도 바로 1012 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "sumbi.stats-store=memory")
@DirtiesContext
class GracefulShutdownTest {
    @LocalServerPort
    int port;

    @Autowired
    GracefulShutdown shutdown;

    CompletableFuture<Integer> connect(CompletableFuture<Void> welcomed) {
        CompletableFuture<Integer> closed = new CompletableFuture<>();
        HttpClient.newHttpClient().newWebSocketBuilder()
            .header("Origin", "http://localhost:5173")
            .buildAsync(URI.create("ws://localhost:" + port + "/ws"), new WebSocket.Listener() {
                @Override
                public void onOpen(WebSocket ws) {
                    ws.sendText("{\"t\":\"hello\",\"v\":1,\"device\":\"pc\",\"nick\":{\"adj\":\"느린\",\"noun\":\"파도\"},"
                        + "\"look\":{\"towel\":\"pink\",\"tewak\":\"orange\",\"cheek\":\"rose\"}}", true);
                    ws.request(10);
                }

                @Override
                public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
                    if (data.toString().contains("\"welcome\"")) welcomed.complete(null);
                    ws.request(1);
                    return null;
                }

                @Override
                public CompletionStage<?> onClose(WebSocket ws, int code, String reason) {
                    closed.complete(code);
                    return null;
                }
            }).join();
        return closed;
    }

    @Test
    void 종료하면_모든_연결을_1012_로_닫음() throws Exception {
        CompletableFuture<Void> welcomed = new CompletableFuture<>();
        CompletableFuture<Integer> closed = connect(welcomed);
        welcomed.get(5, TimeUnit.SECONDS);
        shutdown.stop();
        assertThat(closed.get(5, TimeUnit.SECONDS)).isEqualTo(1012);
        // 종료 중에 붙은 연결도 1012
        assertThat(connect(new CompletableFuture<>()).get(5, TimeUnit.SECONDS)).isEqualTo(1012);
    }
}
