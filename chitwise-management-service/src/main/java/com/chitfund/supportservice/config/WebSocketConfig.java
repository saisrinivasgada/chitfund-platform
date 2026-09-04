package com.chitfund.supportservice.config;

import com.chitfund.supportservice.security.HubJwtTokenProvider;
import com.chitfund.supportservice.security.OrgJwtTokenProvider;
import com.chitfund.supportservice.security.WsAuthorizationService;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.List;
import java.util.Map;

@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
@Slf4j
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final HubJwtTokenProvider hubJwtTokenProvider;
    private final OrgJwtTokenProvider orgJwtTokenProvider;
    private final WsAuthorizationService wsAuthz;

    @Value("${spring.websocket.allowed-origins}")
    private String allowedOrigins;

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        String[] origins = allowedOrigins.split(",");
        for (int i = 0; i < origins.length; i++) origins[i] = origins[i].trim();
        registry.addEndpoint("/ws/support").setAllowedOrigins(origins).withSockJS();
        registry.addEndpoint("/ws/support-native").setAllowedOrigins(origins);
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(
                        message, StompHeaderAccessor.class);
                if (accessor == null) return message;

                if (StompCommand.CONNECT.equals(accessor.getCommand())) {
                    handleConnect(accessor);
                } else if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
                    handleSubscribe(accessor);
                }
                return message;
            }
        });
    }

    // ── CONNECT: validate JWT and set principal with claims ──────────────────

    private void handleConnect(StompHeaderAccessor accessor) {
        String authHeader = accessor.getFirstNativeHeader("Authorization");
        if (!StringUtils.hasText(authHeader) || !authHeader.startsWith("Bearer ")) {
            throw new MessagingException("Authorization header required");
        }

        String token = authHeader.substring(7);

        // Try hub JWT first (has "type":"HUB" claim)
        if (hubJwtTokenProvider.validateToken(token)) {
            String employeeId = hubJwtTokenProvider.extractEmployeeId(token);
            String role = hubJwtTokenProvider.extractRole(token);
            accessor.setUser(new UsernamePasswordAuthenticationToken(
                    employeeId, null, List.of(new SimpleGrantedAuthority(role))));
            if (accessor.getSessionAttributes() != null) {
                accessor.getSessionAttributes().put("userId", employeeId);
                accessor.getSessionAttributes().put("role", role);
                // tenantId null → hub employee, has cross-tenant access
            }
            return;
        }

        // Try org JWT (signed with JWT_SECRET)
        Claims claims = orgJwtTokenProvider.validateAndExtract(token);
        if (claims != null) {
            String userId = claims.getSubject();
            String role = claims.get("role", String.class);
            String tenantId = claims.get("tenantId", String.class);
            accessor.setUser(new UsernamePasswordAuthenticationToken(
                    userId, null, List.of(new SimpleGrantedAuthority(role != null ? role : "USER"))));
            if (accessor.getSessionAttributes() != null) {
                accessor.getSessionAttributes().put("userId", userId);
                accessor.getSessionAttributes().put("role", role);
                accessor.getSessionAttributes().put("tenantId", tenantId);
            }
            return;
        }

        throw new MessagingException("Invalid or expired token");
    }

    // ── SUBSCRIBE: verify caller is allowed to listen on the topic ───────────

    private void handleSubscribe(StompHeaderAccessor accessor) {
        if (accessor.getUser() == null) {
            throw new MessagingException("Not authenticated");
        }

        String destination = accessor.getDestination();
        if (destination == null) return;

        Map<String, Object> attrs = accessor.getSessionAttributes();
        String userId = attrs != null ? (String) attrs.get("userId") : null;
        String tenantId = attrs != null ? (String) attrs.get("tenantId") : null;
        String role = attrs != null ? (String) attrs.get("role") : null;

        if (destination.startsWith("/topic/conversation.")) {
            String convId = destination.substring("/topic/conversation.".length());
            if (!wsAuthz.canSubscribeToConversation(convId, tenantId, userId, role)) {
                log.warn("WS SUBSCRIBE denied: userId={} tenantId={} topic={}", userId, tenantId, destination);
                throw new MessagingException("Access denied to conversation " + convId);
            }
        } else if (destination.startsWith("/topic/support-ticket.")) {
            String ticketId = destination.substring("/topic/support-ticket.".length());
            if (!wsAuthz.canSubscribeToTicket(ticketId, tenantId)) {
                log.warn("WS SUBSCRIBE denied: userId={} tenantId={} topic={}", userId, tenantId, destination);
                throw new MessagingException("Access denied to ticket " + ticketId);
            }
        } else if (destination.startsWith("/topic/group.")) {
                String groupId = destination.substring("/topic/group.".length());
                if (!wsAuthz.canSubscribeToGroup(groupId, tenantId, userId)) {
                    log.warn("WS SUBSCRIBE denied: userId={} tenantId={} topic={}", userId, tenantId, destination);
                    throw new MessagingException("Access denied to group " + groupId);
                }
        } else if (destination.startsWith("/topic/hub.dm.")) {
            if (tenantId != null) {
                // Only hub employees (tenantId == null) can access hub DMs
                throw new MessagingException("Only hub employees can subscribe to hub DMs");
            }
            String convId = destination.substring("/topic/hub.dm.".length());
            if (!wsAuthz.canSubscribeToHubDm(convId, userId)) {
                log.warn("WS SUBSCRIBE denied (hub DM): employeeId={} topic={}", userId, destination);
                throw new MessagingException("Access denied to hub DM " + convId);
            }
        } else if (destination.startsWith("/topic/hub.group.")) {
            if (tenantId != null) {
                throw new MessagingException("Only hub employees can subscribe to hub groups");
            }
            String groupId = destination.substring("/topic/hub.group.".length());
            if (!wsAuthz.canSubscribeToHubGroup(groupId, userId)) {
                log.warn("WS SUBSCRIBE denied (hub group): employeeId={} topic={}", userId, destination);
                throw new MessagingException("Access denied to hub group " + groupId);
            }
        } else if ("/topic/chitwise-pool".equals(destination)) {
            if (!wsAuthz.canSubscribeToPool(tenantId)) {
                throw new MessagingException("Only hub employees can subscribe to the pool");
            }
        }
    }
}
