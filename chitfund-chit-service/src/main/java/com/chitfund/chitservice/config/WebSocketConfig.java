package com.chitfund.chitservice.config;

import com.chitfund.chitservice.repository.AuctionSessionRepository;
import com.chitfund.chitservice.security.JwtTokenProvider;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.Map;
import java.util.UUID;

@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final JwtTokenProvider jwtTokenProvider;
    private final AuctionSessionRepository auctionSessionRepository;

    @Value("${app.websocket.allowed-origins}")
    private String allowedOrigins;

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableSimpleBroker("/topic");
        config.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        String[] origins = java.util.Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isBlank())
                .toArray(String[]::new);
        registry.addEndpoint("/ws/auction")
                .setAllowedOrigins(origins)
                .withSockJS();
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(
                        message, StompHeaderAccessor.class);
                if (accessor == null || accessor.getCommand() == null) return message;

                if (StompCommand.CONNECT.equals(accessor.getCommand())) {
                    authenticate(accessor);
                } else if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
                    authorizeSubscription(accessor);
                } else if (StompCommand.SEND.equals(accessor.getCommand())) {
                    throw new MessagingException("Auction WebSocket does not accept client messages");
                }
                return message;
            }
        });
    }

    void authenticate(StompHeaderAccessor accessor) {
        String header = accessor.getFirstNativeHeader("Authorization");
        if (!StringUtils.hasText(header) || !header.startsWith("Bearer ")) {
            throw new MessagingException("Authorization header required");
        }

        String token = header.substring(7);
        if (!jwtTokenProvider.validateToken(token)) {
            throw new MessagingException("Invalid or expired token");
        }

        Claims claims = jwtTokenProvider.extractClaims(token);
        String tenantId = claims.get("tenantId", String.class);
        if (!StringUtils.hasText(tenantId)) {
            throw new MessagingException("Tenant-scoped token required");
        }
        Map<String, Object> attributes = accessor.getSessionAttributes();
        if (attributes == null) {
            throw new MessagingException("WebSocket session is unavailable");
        }
        attributes.put("userId", claims.getSubject());
        attributes.put("tenantId", tenantId);
        attributes.put("role", claims.get("role", String.class));
    }

    void authorizeSubscription(StompHeaderAccessor accessor) {
        Map<String, Object> attributes = accessor.getSessionAttributes();
        String tenantId = attributes != null ? (String) attributes.get("tenantId") : null;
        if (!StringUtils.hasText(tenantId)) {
            throw new MessagingException("Not authenticated");
        }

        String destination = accessor.getDestination();
        String prefix = "/topic/auction/";
        if (destination == null || !destination.startsWith(prefix)) {
            throw new MessagingException("Subscription destination is not allowed");
        }

        String auctionIdText = destination.substring(prefix.length());
        try {
            UUID auctionId = UUID.fromString(auctionIdText);
            if (auctionSessionRepository.findByIdAndTenantId(auctionId, tenantId).isEmpty()) {
                throw new MessagingException("Auction subscription is not allowed");
            }
        } catch (IllegalArgumentException ex) {
            throw new MessagingException("Invalid auction destination");
        }
    }
}
