package com.chitfund.supportservice.service;

import com.chitfund.supportservice.client.AuditClient;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class HubSecurityAuditServiceTest {

    @Test
    void deniedLoginAuditUsesStableDigestInsteadOfSubmittedUsername() {
        AuditClient auditClient = mock(AuditClient.class);
        HubSecurityAuditService service = new HubSecurityAuditService(auditClient);

        service.recordDeniedLogin("person@example.com", "UNKNOWN_ACCOUNT");

        var subject = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(auditClient).logEntity(eq("HUB_AUTH"), subject.capture(),
                eq("LOGIN_DENIED"), org.mockito.ArgumentMatchers.isNull(),
                eq("ANONYMOUS"), any(), any(), any(), eq("PLATFORM"),
                eq("Invalid credentials"));
        assertThat(subject.getValue()).hasSize(64).doesNotContain("person", "example.com");
    }

    @Test
    void auditSinkFailureCannotTurnDeniedLoginIntoAnErrorResponse() {
        AuditClient auditClient = mock(AuditClient.class);
        org.mockito.Mockito.doThrow(new IllegalStateException("outbox unavailable"))
                .when(auditClient).logEntity(any(), any(), any(), any(), any(),
                        any(), any(), any(), any(), any());
        HubSecurityAuditService service = new HubSecurityAuditService(auditClient);

        org.assertj.core.api.Assertions.assertThatCode(() ->
                service.recordDeniedLogin("person@example.com", "BAD_SECRET"))
                .doesNotThrowAnyException();
    }
}
