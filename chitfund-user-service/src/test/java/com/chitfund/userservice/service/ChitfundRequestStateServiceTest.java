package com.chitfund.userservice.service;

import com.chitfund.userservice.domain.entity.ChitfundRequestAudit;
import com.chitfund.userservice.domain.enums.ChitfundRequestStatus;
import com.chitfund.userservice.repository.ChitfundAccessRequestRepository;
import com.chitfund.userservice.repository.ChitfundRequestAuditRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChitfundRequestStateServiceTest {
    @Mock ChitfundAccessRequestRepository requestRepository;
    @Mock ChitfundRequestAuditRepository auditRepository;

    @Test
    void expirationIsPersistedAndAuditedInItsOwnTransaction() {
        UUID requestId = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();
        when(requestRepository.findById(requestId)).thenReturn(java.util.Optional.of(
                com.chitfund.userservice.domain.entity.ChitfundAccessRequest.builder()
                        .id(requestId).status(ChitfundRequestStatus.PENDING_MEMBER)
                        .expiresAt(now.minusSeconds(1)).build()));
        when(requestRepository.expireByIdIfDue(eq(requestId), anyCollection(),
                eq(ChitfundRequestStatus.EXPIRED), eq(now))).thenReturn(1);
        when(auditRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        ChitfundRequestStateService service = new ChitfundRequestStateService(
                requestRepository, auditRepository);

        assertThat(service.expireIfDue(requestId, now)).isTrue();
        verify(auditRepository).save(argThat((ChitfundRequestAudit audit) ->
                audit.getRequestId().equals(requestId)
                        && audit.getToStatus() == ChitfundRequestStatus.EXPIRED
                        && audit.getAction().equals("REQUEST_EXPIRED")));
    }
}
