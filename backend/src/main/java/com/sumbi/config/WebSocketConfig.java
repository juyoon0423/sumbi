package com.sumbi.config;

import com.sumbi.ws.SumbiWebSocketHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final SumbiWebSocketHandler handler;
    private final SumbiProperties props;

    public WebSocketConfig(SumbiWebSocketHandler handler, SumbiProperties props) {
        this.handler = handler;
        this.props = props;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws").setAllowedOriginPatterns(props.allowedOrigins().toArray(String[]::new));
    }

    /** 컨테이너 수준 상한 (한글 1KB 메시지 여유 포함) */
    @Bean
    public ServletServerContainerFactoryBean webSocketContainer() {
        ServletServerContainerFactoryBean f = new ServletServerContainerFactoryBean();
        f.setMaxTextMessageBufferSize(8 * 1024);
        f.setMaxSessionIdleTimeout(props.heartbeatTimeoutMs() * 2);
        return f;
    }
}
