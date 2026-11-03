package com.sumbi.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sumbi.TestProps;
import java.util.List;
import org.junit.jupiter.api.Test;

class SumbiPropertiesTest {

    private static SumbiProperties withOrigins(List<String> origins) {
        SumbiProperties p = TestProps.props(50, 500);
        return new SumbiProperties(origins, p.roomCapacity(), p.maxTotal(), p.tickMs(), p.heartbeatTimeoutMs(),
            p.reconnectGraceMs(), p.maxMessagesPerSec(), p.maxMessageBytes(), p.sendTimeLimitMs(), p.sendBufferBytes(),
            p.todayIntervalMs(), p.lookIntervalMs(), p.harvestIntervalMs(), p.bulteok(), p.sea());
    }

    @Test
    void 채운_주소는_통과() {
        assertThatCode(() -> withOrigins(List.of("https://sumbi.kr", "https://www.sumbi.kr"))).doesNotThrowAnyException();
        assertThatCode(() -> withOrigins(List.of("http://localhost:*"))).doesNotThrowAnyException();
    }

    @Test
    void 운영_설정이_빠지거나_채우지_않으면_서버가_뜨지_않음() {
        // 환경변수가 없으면 Spring 은 글자 그대로 넣음
        assertThatThrownBy(() -> withOrigins(List.of("${SUMBI_ALLOWED_ORIGINS}"))).isInstanceOf(IllegalArgumentException.class);
        // backend.env.example 을 그대로 둔 경우
        assertThatThrownBy(() -> withOrigins(List.of("https://<도메인>"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> withOrigins(List.of())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> withOrigins(List.of(" "))).isInstanceOf(IllegalArgumentException.class);
    }
}
