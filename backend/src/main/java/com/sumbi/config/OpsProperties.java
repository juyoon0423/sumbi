package com.sumbi.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 운영: 대기열 자리 제안, 동시접속 상한 바꾸기, 휴대폰 알림 (application.yml 의 sumbi.ops.*) */
@ConfigurationProperties(prefix = "sumbi.ops")
public record OpsProperties(
    /** 자리가 났다는 제안을 기다려 주는 시간 (ms) */
    long slotOfferMs,
    /** Redis 의 상한 값(sumbi:config:max-total)을 읽는 주기 (ms) */
    long capPollMs,
    /** 알림 웹훅 주소 (디스코드 웹훅, 또는 텔레그램 sendMessage 주소). 비면 알림 끔 */
    String alertWebhookUrl,
    /** 텔레그램이면 chat id */
    String alertTelegramChat,
    /** 같은 종류 알림 최소 간격 (ms) */
    long alertMinIntervalMs,
    /** 알림 앞에 붙는 이름 (예: [숨비]) */
    String alertName) {}
