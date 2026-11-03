package com.sumbi.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 바다 친구들 (application.yml 의 sumbi.sea-friends.*). 물고기 등은 각 화면에서, 돌고래만 서버가 정함 */
@ConfigurationProperties(prefix = "sumbi.sea-friends")
public record SeaFriendsProperties(
    /** 남방큰돌고래 평균 등장 간격 (ms, 바다마다) */
    long dolphinMeanMs,
    /** 가장 짧은 간격 / 가장 긴 간격 (ms) */
    long dolphinMinMs,
    long dolphinMaxMs,
    /** 개발용 바로 부르기(dev 메시지)를 받을지. 운영은 false */
    boolean devEvents) {}
