package com.sumbi.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** application.yml 의 sumbi.* (환경변수로 덮어쓰기 가능) */
@ConfigurationProperties(prefix = "sumbi")
public record SumbiProperties(
    /** 접속을 허용할 프론트 주소 (패턴 가능: http://localhost:*) */
    List<String> allowedOrigins,
    /** 한 바다 최대 인원 */
    int roomCapacity,
    /** 전체 동시 접속 상한. 넘으면 대기 */
    int maxTotal,
    /** 위치 스냅샷 주기 (ms) */
    long tickMs,
    /** 이 시간 동안 아무 메시지가 없으면 연결 정리 (ms) */
    long heartbeatTimeoutMs,
    /** 잠깐 끊겼을 때 같은 해녀로 돌아올 수 있는 시간 (ms) */
    long reconnectGraceMs,
    /** 연결당 초당 메시지 수 상한 */
    int maxMessagesPerSec,
    /** 메시지 크기 상한 (bytes) */
    int maxMessageBytes,
    /** 한 메시지 전송이 이보다 오래 걸리면 느린 연결로 보고 정리 (ms) */
    long sendTimeLimitMs,
    /** 연결 하나에 보내지 못하고 쌓인 메시지 상한 (bytes). 넘으면 정리 */
    int sendBufferBytes,
    /** 오늘의 바다 방송 최소 간격 (ms) */
    long todayIntervalMs,
    /** 꾸미기 변경 최소 간격 (ms) */
    long lookIntervalMs,
    /** 채집 최소 간격 (ms) */
    long harvestIntervalMs,
    /** 불턱: 손질·대야 */
    Bulteok bulteok,
    Sea sea) {

    /**
     * 허용 origin 이 비었거나 채우지 않은 자리(`${SUMBI_ALLOWED_ORIGINS}` 그대로, `<도메인>`)면 서버가 뜨지 않게.
     * (Spring 은 못 찾은 환경변수를 글자 그대로 넣어서, 운영 설정이 빠져도 조용히 뜸)
     */
    public SumbiProperties {
        if (allowedOrigins == null || allowedOrigins.isEmpty()) {
            throw new IllegalArgumentException("SUMBI_ALLOWED_ORIGINS 가 비었어요 (프론트 주소, 쉼표로 여러 개)");
        }
        for (String o : allowedOrigins) {
            if (o == null || o.isBlank() || o.contains("${") || o.contains("<") || o.contains(">")) {
                throw new IllegalArgumentException("SUMBI_ALLOWED_ORIGINS 를 채워 주세요: '" + o + "'");
            }
        }
    }

    /** 손질 모션 길이(ms, 프론트와 같게), 귤 까먹기 길이, 첫 대야 크기, 가득 찬 대야 축하 시간 */
    public record Bulteok(long prepMs, long restMs, int basinCapacity, long basinCelebrateMs) {}

    /** 바다 범위·이동 속도 (프론트 config.ts 의 playCenter·playRadius 와 맞춤) */
    public record Sea(double centerX, double centerZ, double radius, double minY, double maxY, double maxSpeed, double slack) {}
}
