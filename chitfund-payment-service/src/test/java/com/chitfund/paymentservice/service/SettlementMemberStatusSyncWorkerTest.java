package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.client.MemberServiceClient;
import com.chitfund.paymentservice.domain.SettlementMemberStatusSync;
import com.chitfund.paymentservice.repository.SettlementMemberStatusSyncRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SettlementMemberStatusSyncWorkerTest {
    @Mock private SettlementMemberStatusSyncRepository repository;
    @Mock private SettlementMemberStatusSyncStore store;
    @Mock private MemberServiceClient memberServiceClient;
    @InjectMocks private SettlementMemberStatusSyncWorker worker;

    @Test
    void completedSyncIsMarkedComplete() {
        UUID id = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        UUID claimToken = UUID.randomUUID();
        var sync = SettlementMemberStatusSync.builder()
                .id(id).memberId(memberId).desiredStatus("INACTIVE")
                .claimToken(claimToken).build();
        when(repository.findReadyIds(any(LocalDateTime.class), any())).thenReturn(List.of(id));
        when(store.claim(id)).thenReturn(Optional.of(sync));

        worker.processReady();

        verify(memberServiceClient).setMemberStatus(memberId, "INACTIVE");
        verify(store).complete(id, claimToken);
        verify(store, never()).fail(any(), any(), any());
    }

    @Test
    void failedSyncIsRecordedForRetry() {
        UUID id = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        UUID claimToken = UUID.randomUUID();
        var sync = SettlementMemberStatusSync.builder()
                .id(id).memberId(memberId).desiredStatus("ACTIVE")
                .claimToken(claimToken).build();
        when(repository.findReadyIds(any(LocalDateTime.class), any())).thenReturn(List.of(id));
        when(store.claim(id)).thenReturn(Optional.of(sync));
        var failure = new IllegalStateException("unavailable");
        doThrow(failure).when(memberServiceClient).setMemberStatus(memberId, "ACTIVE");

        worker.processReady();

        verify(store).fail(id, claimToken, failure);
        verify(store, never()).complete(any(), any());
    }
}
