package com.chitfund.chitservice.config;

import com.chitfund.chitservice.repository.AuctionSessionRepository;
import com.chitfund.chitservice.security.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;

import java.util.HashMap;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WebSocketConfigTest {

    private final JwtTokenProvider tokenProvider = mock(JwtTokenProvider.class);
    private final AuctionSessionRepository repository = mock(AuctionSessionRepository.class);
    private final WebSocketConfig config = new WebSocketConfig(tokenProvider, repository);

    @Test
    void deniesUnknownSubscriptionDestination() {
        StompHeaderAccessor accessor = authenticatedSubscription("/topic/not-auction/value", "tenant-a");

        assertThatThrownBy(() -> config.authorizeSubscription(accessor))
                .isInstanceOf(MessagingException.class)
                .hasMessageContaining("not allowed");
    }

    @Test
    void deniesAuctionOwnedByAnotherTenant() {
        UUID auctionId = UUID.randomUUID();
        StompHeaderAccessor accessor = authenticatedSubscription(
                "/topic/auction/" + auctionId, "tenant-a");
        when(repository.findByIdAndTenantId(auctionId, "tenant-a")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> config.authorizeSubscription(accessor))
                .isInstanceOf(MessagingException.class)
                .hasMessageContaining("not allowed");
    }

    @Test
    void rejectsConnectWithoutBearerToken() {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);

        assertThatThrownBy(() -> config.authenticate(accessor))
                .isInstanceOf(MessagingException.class)
                .hasMessageContaining("Authorization header required");
    }

    private static StompHeaderAccessor authenticatedSubscription(String destination, String tenantId) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        HashMap<String, Object> attributes = new HashMap<>();
        attributes.put("tenantId", tenantId);
        accessor.setSessionAttributes(attributes);
        accessor.setDestination(destination);
        return accessor;
    }
}
