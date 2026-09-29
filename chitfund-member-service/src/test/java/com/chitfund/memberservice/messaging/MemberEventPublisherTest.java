package com.chitfund.memberservice.messaging;

import com.chitfund.common.event.MemberUpdatedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

class MemberEventPublisherTest {

    private final SqsTemplate sqsTemplate = mock(SqsTemplate.class);
    private final MemberEventPublisher publisher = new MemberEventPublisher(
            sqsTemplate, new ObjectMapper().findAndRegisterModules());

    @AfterEach
    void clearTransactionState() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    void committedMemberUpdatePublishesExactlyOnce() {
        beginTransaction();

        publisher.publish(event());

        verify(sqsTemplate, never()).send(anyString(), any(Object.class));
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(TransactionSynchronization::afterCommit);
        verify(sqsTemplate, timeout(1000).times(1)).send(anyString(), any(Object.class));
    }

    @Test
    void rolledBackMemberUpdatePublishesNothing() {
        beginTransaction();

        publisher.publish(event());
        TransactionSynchronizationManager.getSynchronizations().forEach(
                sync -> sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));

        verify(sqsTemplate, never()).send(anyString(), any(Object.class));
    }

    private void beginTransaction() {
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.initSynchronization();
    }

    private MemberUpdatedEvent event() {
        return new MemberUpdatedEvent("tenant-a", "member-a", "referredById",
                null, "referrer-a", null, "Referrer", "actor-a", Instant.now());
    }
}
