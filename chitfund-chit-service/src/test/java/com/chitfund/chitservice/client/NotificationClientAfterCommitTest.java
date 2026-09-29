package com.chitfund.chitservice.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.RestTemplate;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class NotificationClientAfterCommitTest {

    private final RestTemplate restTemplate = mock(RestTemplate.class);
    private final SqsTemplate sqsTemplate = mock(SqsTemplate.class);
    private final NotificationClient client = new NotificationClient(
            restTemplate, sqsTemplate, new ObjectMapper());

    @AfterEach
    void clearTransactionState() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    void committedTransactionPublishesExactlyOnce() {
        beginTransactionSynchronization();

        client.notifyUsersInAppAfterCommit(
                List.of("member-1"), "TYPE", "Title", "Message", "/target");

        verify(sqsTemplate, never()).send(anyString(), anyString());
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(TransactionSynchronization::afterCommit);
        verify(sqsTemplate, times(1)).send(anyString(), anyString());
    }

    @Test
    void rolledBackTransactionPublishesNothing() {
        beginTransactionSynchronization();

        client.notifyUsersInAppAfterCommit(
                List.of("member-1"), "TYPE", "Title", "Message", "/target");
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(sync -> sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));

        verify(sqsTemplate, never()).send(anyString(), anyString());
    }

    private void beginTransactionSynchronization() {
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.initSynchronization();
    }
}
