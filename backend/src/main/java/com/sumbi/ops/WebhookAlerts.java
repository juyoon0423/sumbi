package com.sumbi.ops;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.function.LongSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 디스코드(또는 텔레그램) 웹훅으로 알림.
 * 같은 종류(key)는 minIntervalMs 에 한 번만 보내고, 그 사이 묻힌 알림 수를 다음 알림에 덧붙임.
 * 전송은 가상 스레드에서 (게임 잠금·틱을 붙잡지 않음), 실패해도 게임엔 영향 없음.
 */
public class WebhookAlerts implements Alerts {
    private static final Logger log = LoggerFactory.getLogger(WebhookAlerts.class);

    private final String url;
    /** 텔레그램이면 chat id (디스코드면 null) */
    private final String telegramChat;
    private final String prefix;
    private final long minIntervalMs;
    private final LongSupplier clock;
    private final Executor executor;
    private final HttpClient http;
    private final ObjectMapper json = new ObjectMapper();
    private final Map<String, long[]> last = new ConcurrentHashMap<>();

    public WebhookAlerts(String url, String telegramChat, String prefix, long minIntervalMs, LongSupplier clock, Executor executor) {
        this.url = url;
        this.telegramChat = telegramChat == null || telegramChat.isBlank() ? null : telegramChat;
        this.prefix = prefix == null ? "" : prefix;
        this.minIntervalMs = minIntervalMs;
        this.clock = clock;
        this.executor = executor;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    }

    @Override
    public void send(String key, String text) {
        long now = clock.getAsLong();
        // [마지막 보낸 시각, 그 뒤 묻힌 수]
        long[] s = last.computeIfAbsent(key, k -> new long[] {Long.MIN_VALUE / 2, 0});
        String body;
        synchronized (s) {
            if (now - s[0] < minIntervalMs) {
                s[1]++;
                return;
            }
            long skipped = s[1];
            s[0] = now;
            s[1] = 0;
            body = prefix + text + (skipped > 0 ? " (지난 " + minIntervalMs / 60_000 + "분 동안 비슷한 알림 " + skipped + "번 더)" : "");
        }
        executor.execute(() -> post(body));
    }

    private void post(String text) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            if (telegramChat != null) {
                payload.put("chat_id", telegramChat);
                payload.put("text", text);
            } else {
                payload.put("content", text);
            }
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(8))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload)))
                .build();
            HttpResponse<Void> res = http.send(req, HttpResponse.BodyHandlers.discarding());
            if (res.statusCode() >= 300) log.warn("alert webhook returned {}", res.statusCode());
        } catch (Exception e) {
            log.warn("alert webhook failed: {}", e.getMessage());
        }
    }
}
