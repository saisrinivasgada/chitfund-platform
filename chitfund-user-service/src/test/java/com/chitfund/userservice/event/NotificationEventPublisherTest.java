package com.chitfund.userservice.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

class NotificationEventPublisherTest {

    private final SqsTemplate sqsTemplate = mock(SqsTemplate.class);
    private final NotificationEventPublisher publisher = new NotificationEventPublisher(
            sqsTemplate, new ObjectMapper());

    @AfterEach
    void clearTransactionState() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    void committedNotificationPublishesExactlyOnce() {
        beginTransaction();

        publisher.publishPush(UUID.randomUUID(), "Title", "Body", Map.of("screen", "home"));

        verify(sqsTemplate, never()).send(anyString(), anyString());
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(TransactionSynchronization::afterCommit);
        verify(sqsTemplate, timeout(1000).times(1)).send(anyString(), anyString());
    }

    @Test
    void rolledBackNotificationPublishesNothing() {
        beginTransaction();

        publisher.publishEmail("recipient@example.test", "Subject", "<p>Body</p>", "Body");
        TransactionSynchronizationManager.getSynchronizations().forEach(
                sync -> sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));

        verify(sqsTemplate, never()).send(anyString(), anyString());
    }

    private void beginTransaction() {
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.initSynchronization();
    }
}
