package com.chitfund.paymentservice.kafka;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.event.ChitMonthOpenedEvent;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.paymentservice.domain.EventOutbox;
import com.chitfund.paymentservice.repository.EventOutboxRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionSynchronizationUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class PaymentEventPublisherTest {

    @Mock private SqsTemplate sqsTemplate;
    @Mock private EventOutboxRepository repository;

    @BeforeEach
    void setUp() {
        TenantContext.set("tenant-test");
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
        TenantContext.clear();
    }

    @Test
    void enabledOutboxPersistsOneRowPerDestinationInsideBusinessTransaction() {
        PaymentEventPublisher publisher = publisher(true);

        publisher.publish(monthOpened());

        ArgumentCaptor<EventOutbox> rows = ArgumentCaptor.forClass(EventOutbox.class);
        verify(repository, times(2)).save(rows.capture());
        assertThat(rows.getAllValues())
                .extracting(EventOutbox::getDestination)
                .containsExactlyInAnyOrder(
                        SqsQueues.NOTIFICATION_EVENTS, SqsQueues.REPORTING_EVENTS);
        assertThat(rows.getAllValues()).allSatisfy(row -> {
            assertThat(row.getTenantId()).isEqualTo("tenant-test");
            assertThat(row.getAggregateId()).isEqualTo("chit-1");
            assertThat(row.getPayload()).contains("chit-1");
        });
        verify(sqsTemplate, never()).send(anyString(), anyString());
    }

    @Test
    void enabledOutboxRefusesPublicationOutsideBusinessTransaction() {
        TransactionSynchronizationManager.setActualTransactionActive(false);

        assertThatThrownBy(() -> publisher(true).publish(monthOpened()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("active business transaction");
        verify(repository, never()).save(any());
    }

    @Test
    void directFallbackSendsOnlyAfterCommit() {
        PaymentEventPublisher publisher = publisher(false);

        publisher.publish(monthOpened());
        verify(sqsTemplate, never()).send(anyString(), anyString());

        TransactionSynchronizationUtils.invokeAfterCommit(
                TransactionSynchronizationManager.getSynchronizations());
        verify(sqsTemplate, times(2)).send(anyString(), anyString());
    }

    @Test
    void directFallbackPublishesNothingOnRollback() {
        publisher(false).publish(monthOpened());

        TransactionSynchronizationUtils.invokeAfterCompletion(
                TransactionSynchronizationManager.getSynchronizations(),
                TransactionSynchronization.STATUS_ROLLED_BACK);

        verify(sqsTemplate, never()).send(anyString(), anyString());
    }

    private PaymentEventPublisher publisher(boolean enabled) {
        return new PaymentEventPublisher(
                sqsTemplate, new ObjectMapper().findAndRegisterModules(), repository, enabled);
    }

    private ChitMonthOpenedEvent monthOpened() {
        return new ChitMonthOpenedEvent(
                "tenant-test", "chit-1", "Test Chit", 1,
                LocalDate.of(2026, 10, 1), new BigDecimal("1000.00"), 1,
                List.of(UUID.randomUUID().toString()), UUID.randomUUID().toString(),
                "ADMIN", Instant.now());
    }
}
