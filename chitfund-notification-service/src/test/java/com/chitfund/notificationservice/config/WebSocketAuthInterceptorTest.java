package com.chitfund.notificationservice.config;

import com.chitfund.notificationservice.security.JwtTokenProvider;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;

import java.util.HashMap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WebSocketAuthInterceptorTest {

    private final JwtTokenProvider tokenProvider = mock(JwtTokenProvider.class);
    private final WebSocketAuthInterceptor interceptor = new WebSocketAuthInterceptor(tokenProvider);

    @Test
    void authenticatedConnectionStoresTrustedTenantClaim() {
        Claims claims = mock(Claims.class);
        when(tokenProvider.validateToken("signed-token")).thenReturn(true);
        when(tokenProvider.extractClaims("signed-token")).thenReturn(claims);
        when(claims.getSubject()).thenReturn("user-a");
        when(claims.get("role", String.class)).thenReturn("ROLE_ADMIN");
        when(claims.get("tenantId", String.class)).thenReturn("tenant-a");

        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setNativeHeader("Authorization", "Bearer signed-token");
        accessor.setSessionAttributes(new HashMap<>());

        interceptor.authenticate(accessor);

        assertThat(accessor.getSessionAttributes()).containsEntry("tenantId", "tenant-a");
        assertThat(accessor.getUser()).isNotNull();
    }

    @Test
    void tenantMaySubscribeOnlyToItsOwnUpdateTopic() {
        StompHeaderAccessor own = subscription("/topic/data-update/tenant-a", "tenant-a");
        StompHeaderAccessor foreign = subscription("/topic/data-update/tenant-b", "tenant-a");

        assertThatCode(() -> interceptor.authorizeSubscription(own)).doesNotThrowAnyException();
        assertThatThrownBy(() -> interceptor.authorizeSubscription(foreign))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("Cross-organization");
    }

    @Test
    void unscopedLegacyTopicIsRejected() {
        StompHeaderAccessor accessor = subscription("/topic/data-update", "tenant-a");

        assertThatThrownBy(() -> interceptor.authorizeSubscription(accessor))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void connectionWithoutTenantClaimIsRejected() {
        Claims claims = mock(Claims.class);
        when(tokenProvider.validateToken("signed-token")).thenReturn(true);
        when(tokenProvider.extractClaims("signed-token")).thenReturn(claims);
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setNativeHeader("Authorization", "Bearer signed-token");
        accessor.setSessionAttributes(new HashMap<>());

        assertThatThrownBy(() -> interceptor.authenticate(accessor))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("Tenant-scoped");
    }

    private static StompHeaderAccessor subscription(String destination, String tenantId) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        HashMap<String, Object> attributes = new HashMap<>();
        attributes.put("tenantId", tenantId);
        accessor.setSessionAttributes(attributes);
        accessor.setDestination(destination);
        return accessor;
    }
}
