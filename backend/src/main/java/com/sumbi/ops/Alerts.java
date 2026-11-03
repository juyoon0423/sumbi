package com.sumbi.ops;

/** 운영 알림 (휴대폰으로). 게임 잠금 안에서 불려도 막히지 않게 구현은 비동기여야 함 */
public interface Alerts {
    /**
     * @param key  같은 종류끼리 간격 제한 (예: "full", "queue")
     * @param text 보낼 문장
     */
    void send(String key, String text);

    Alerts NONE = (key, text) -> {};
}
