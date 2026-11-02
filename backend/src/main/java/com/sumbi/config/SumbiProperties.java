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
    /** 오늘의 바다 방송 최소 간격 (ms) */
    long todayIntervalMs,
    /** 꾸미기 변경 최소 간격 (ms) */
    long lookIntervalMs,
    /** 채집 최소 간격 (ms) */
    long harvestIntervalMs,
    Sea sea) {

    /** 바다 범위·이동 속도 (프론트 config.ts 의 playCenter·playRadius 와 맞춤) */
    public record Sea(double centerX, double centerZ, double radius, double minY, double maxY, double maxSpeed, double slack) {}
}
