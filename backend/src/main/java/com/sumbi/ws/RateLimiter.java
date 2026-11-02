package com.sumbi.ws;

/** 1초 단위 고정 창 메시지 수 제한 (연결 하나가 혼자 쓰므로 동기화 불필요) */
public class RateLimiter {
    private final int perSecond;
    private long windowStart;
    private boolean started;
    private int count;

    public RateLimiter(int perSecond) {
        this.perSecond = perSecond;
    }

    public boolean tryAcquire(long nowMs) {
        if (!started || nowMs - windowStart >= 1000) {
            started = true;
            windowStart = nowMs;
            count = 0;
        }
        return ++count <= perSecond;
    }
}
