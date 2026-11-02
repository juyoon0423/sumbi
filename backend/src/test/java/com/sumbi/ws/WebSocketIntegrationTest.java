package com.sumbi.ws;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

/** 실제 서버를 띄우고 WebSocket 클라이언트 두 개로 입장·위치·행동·퇴장 확인 */
// 로컬 Redis 가 켜져 있어도 테스트가 실제 집계를 건드리지 않게 메모리로
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "sumbi.stats-store=memory")
class WebSocketIntegrationTest {
    @LocalServerPort
    int port;

    final ObjectMapper json = new ObjectMapper();

    class TestClient implements WebSocket.Listener {
        final LinkedBlockingQueue<JsonNode> inbox = new LinkedBlockingQueue<>();
        final StringBuilder partial = new StringBuilder();
        WebSocket ws;

        TestClient open() {
            ws = HttpClient.newHttpClient().newWebSocketBuilder()
                .header("Origin", "http://localhost:5173")
                .buildAsync(URI.create("ws://localhost:" + port + "/ws"), this)
                .join();
            return this;
        }

        void send(String text) {
            ws.sendText(text, true).join();
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            partial.append(data);
            if (last) {
                try {
                    inbox.add(json.readTree(partial.toString()));
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
                partial.setLength(0);
            }
            webSocket.request(1);
            return null;
        }

        /** 조건에 맞는 메시지가 올 때까지 (다른 메시지는 버림) */
        JsonNode await(Predicate<JsonNode> match) throws InterruptedException {
            long end = System.nanoTime() + Duration.ofSeconds(5).toNanos();
            while (System.nanoTime() < end) {
                JsonNode m = inbox.poll(100, TimeUnit.MILLISECONDS);
                if (m != null && match.test(m)) return m;
            }
            throw new AssertionError("message not received");
        }

        JsonNode await(String type) throws InterruptedException {
            return await(m -> type.equals(m.path("t").asText()));
        }
    }

    static String hello(String adj, String noun, String towel) {
        return """
            {"t":"hello","v":1,"device":"pc","nick":{"adj":"%s","noun":"%s"},"look":{"towel":"%s","tewak":"orange","cheek":"rose"}}
            """.formatted(adj, noun, towel);
    }

    @Test
    void 두_해녀가_서로를_보고_움직임_행동_퇴장이_전달됨() throws Exception {
        TestClient a = new TestClient().open();
        a.send(hello("느린", "파도", "pink"));
        JsonNode wa = a.await("welcome");
        int idA = wa.at("/you/id").asInt();
        assertThat(wa.at("/you/nick").asText()).isEqualTo("느린 파도");
        assertThat(wa.at("/you/token").asText()).isNotBlank();

        TestClient b = new TestClient().open();
        b.send(hello("작은", "소라", "mint"));
        JsonNode wb = b.await("welcome");
        int idB = wb.at("/you/id").asInt();
        assertThat(wb.at("/room/id").asText()).isEqualTo(wa.at("/room/id").asText());
        assertThat(wb.get("players").get(0).get("nick").asText()).isEqualTo("느린 파도");

        JsonNode join = a.await("join");
        assertThat(join.at("/player/id").asInt()).isEqualTo(idB);
        assertThat(join.at("/player/look/towel").asText()).isEqualTo("mint");

        // 위치 → 100ms 틱 스냅샷
        b.send("{\"t\":\"move\",\"p\":[1.23,0,7.5],\"r\":0.5}");
        b.send("{\"t\":\"move\",\"p\":[1.4,0,7.4],\"r\":0.6}");
        JsonNode snap = a.await(m -> "snap".equals(m.path("t").asText()) && m.get("ps").get(0).get(0).asInt() == idB);
        assertThat(snap.get("ps").get(0).get(1).asDouble()).isEqualTo(1.4);

        // 행동은 즉시
        b.send("{\"t\":\"act\",\"a\":\"sumbi\"}");
        JsonNode evt = a.await("evt");
        assertThat(evt.get("id").asInt()).isEqualTo(idB);
        assertThat(evt.get("a").asText()).isEqualTo("sumbi");

        // 꾸미기 변경
        b.send("{\"t\":\"look\",\"nick\":{\"adj\":\"고요한\",\"noun\":\"윤슬\"},\"look\":{\"towel\":\"sky\",\"tewak\":\"amber\",\"cheek\":\"pink\"}}");
        JsonNode look = a.await("look");
        assertThat(look.get("nick").asText()).isEqualTo("고요한 윤슬");

        // ping
        a.send("{\"t\":\"ping\",\"ts\":42}");
        assertThat(a.await("pong").get("ts").asLong()).isEqualTo(42);

        // 이상한 메시지
        a.send("{\"t\":\"teleport\"}");
        assertThat(a.await("err").get("code").asText()).isEqualTo("BAD_MESSAGE");

        // 탭 닫기(1001) → 바로 leave
        b.ws.sendClose(1001, "bye").join();
        JsonNode leave = a.await("leave");
        assertThat(leave.get("id").asInt()).isEqualTo(idB);
        assertThat(idA).isNotEqualTo(idB);
        a.ws.sendClose(1000, "").join();
    }

    @Test
    void 허용되지_않은_주소에서는_연결_거부() {
        var future = HttpClient.newHttpClient().newWebSocketBuilder()
            .header("Origin", "https://evil.example")
            .buildAsync(URI.create("ws://localhost:" + port + "/ws"), new WebSocket.Listener() {});
        assertThat(future).failsWithin(Duration.ofSeconds(5));
    }
}
