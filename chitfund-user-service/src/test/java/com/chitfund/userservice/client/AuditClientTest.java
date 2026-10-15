package com.chitfund.userservice.client;

import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.outbox.DurableAuditOutbox;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;

import java.util.UUID;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class AuditClientTest {

    private final DurableAuditOutbox outbox = mock(DurableAuditOutbox.class);
    private final AuditClient client = new AuditClient(outbox, new ObjectMapper());

    @AfterEach
    void clearTransactionFlag() {
        TransactionSynchronizationManager.setActualTransactionActive(false);
        SecurityContextHolder.clearContext();
    }

    @Test
    void rejectsAuditOutsideBusinessTransaction() {
        assertThatThrownBy(() -> client.log("TENANT", "entity", "UPDATED", "actor",
                "ADMIN", null, null, "tenant"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("business transaction");
        verify(outbox, never()).enqueue(anyString(), anyString(), anyString(),
                anyString(), anyString(), anyString());
    }

    @Test
    void enqueuesAuditInsideBusinessTransaction() {
        TransactionSynchronizationManager.setActualTransactionActive(true);
        client.log("TENANT", "entity", "UPDATED", "actor", "ADMIN",
                Map.of("status", "OLD"), Map.of("status", "NEW"), "tenant");

        var payload = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(outbox).enqueue(anyString(), org.mockito.ArgumentMatchers.eq("tenant"),
                org.mockito.ArgumentMatchers.eq("TENANT"),
                org.mockito.ArgumentMatchers.eq("entity"), payload.capture(),
                org.mockito.ArgumentMatchers.eq(SqsQueues.AUDIT_EVENTS));
        assertThat(payload.getValue()).contains("UPDATED", "OLD", "NEW");
    }

    @Test
    void resolvesHubOwnerIdFromAuthenticatedPrincipalWhenServiceCallOmitsIt() {
        UUID ownerId = UUID.randomUUID();
        User owner = User.builder().id(ownerId).username("owner").passwordHash("HUB_MANAGED")
                .role(Role.SUPER_ADMIN).enabled(true).build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(owner, null, owner.getAuthorities()));
        TransactionSynchronizationManager.setActualTransactionActive(true);

        client.log("TENANT", "tenant-1", "PLAN_CHANGED", null, "ROLE_SUPER_ADMIN",
                Map.of("plan", "BASIC"), Map.of("plan", "GROWTH"), "tenant-1");

        var payload = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(outbox).enqueue(anyString(), org.mockito.ArgumentMatchers.eq("tenant-1"),
                org.mockito.ArgumentMatchers.eq("TENANT"),
                org.mockito.ArgumentMatchers.eq("tenant-1"), payload.capture(),
                org.mockito.ArgumentMatchers.eq(SqsQueues.AUDIT_EVENTS));
        assertThat(payload.getValue()).contains(ownerId.toString(), "PLAN_CHANGED");
    }

    @Test
    void preservesCorrelationAndIdempotencyContextInDurableEvent() {
        TransactionSynchronizationManager.setActualTransactionActive(true);

        client.log("PLAN_PAYMENT", "payment-1", "REFUND_RECORDED", "owner-1",
                "SUPER_ADMIN", Map.of("status", "COMPLETED"),
                Map.of("status", "REFUNDED"), "tenant-1", "HUB", "SUCCESS",
                "Approved correction", "payment-1", "refund-key-1");

        var payload = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(outbox).enqueue(anyString(), org.mockito.ArgumentMatchers.eq("tenant-1"),
                org.mockito.ArgumentMatchers.eq("PLAN_PAYMENT"),
                org.mockito.ArgumentMatchers.eq("payment-1"), payload.capture(),
                org.mockito.ArgumentMatchers.eq(SqsQueues.AUDIT_EVENTS));
        assertThat(payload.getValue()).contains(
                "\"correlationId\":\"payment-1\"",
                "\"idempotencyKey\":\"refund-key-1\"",
                "\"source\":\"HUB\"",
                "Approved correction");
    }
}
