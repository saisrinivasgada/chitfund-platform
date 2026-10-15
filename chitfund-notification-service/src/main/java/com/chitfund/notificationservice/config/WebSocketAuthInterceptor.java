package com.chitfund.notificationservice.config;

import com.chitfund.notificationservice.security.JwtTokenProvider;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private final JwtTokenProvider jwtTokenProvider;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) return message;
        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            authenticate(accessor);
        } else if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            authorizeSubscription(accessor);
        } else if (StompCommand.SEND.equals(accessor.getCommand())) {
            throw new AccessDeniedException("Notification WebSocket does not accept client messages");
        }
        return message;
    }

    void authenticate(StompHeaderAccessor accessor) {
        String authHeader = accessor.getFirstNativeHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new AccessDeniedException("Missing or invalid Authorization header");
        }
        String token = authHeader.substring(7);
        if (!jwtTokenProvider.validateToken(token)) {
            throw new AccessDeniedException("Invalid or expired token");
        }
        try {
            Claims claims = jwtTokenProvider.extractClaims(token);
            String scope = claims.get("scope", String.class);
            if ("TENANT_SELECT".equals(scope) || "LOGIN_OTP_PENDING".equals(scope)) {
                throw new AccessDeniedException("Token scope not permitted for WebSocket");
            }
            String role = claims.get("role", String.class);
            String tenantId = claims.get("tenantId", String.class);
            if (tenantId == null || tenantId.isBlank()) {
                throw new AccessDeniedException("Tenant-scoped token required for WebSocket");
            }
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    claims.getSubject(), null,
                    role != null ? List.of(new SimpleGrantedAuthority(role)) : List.of());
            accessor.setUser(auth);
            Map<String, Object> attributes = accessor.getSessionAttributes();
            if (attributes == null) {
                throw new AccessDeniedException("WebSocket session is unavailable");
            }
            attributes.put("tenantId", tenantId);
        } catch (AccessDeniedException ex) {
            throw ex;
        } catch (Exception e) {
            log.warn("WebSocket auth failed: {}", e.getMessage());
            throw new AccessDeniedException("WebSocket authentication failed");
        }
    }

    void authorizeSubscription(StompHeaderAccessor accessor) {
        Map<String, Object> attributes = accessor.getSessionAttributes();
        String tenantId = attributes != null ? (String) attributes.get("tenantId") : null;
        String destination = accessor.getDestination();
        if (tenantId == null || tenantId.isBlank()) {
            throw new AccessDeniedException("WebSocket is not authenticated");
        }
        if (!("/topic/data-update/" + tenantId).equals(destination)) {
            throw new AccessDeniedException("Cross-organization WebSocket subscription denied");
        }
    }
}
