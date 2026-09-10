package com.chitfund.paymentservice.kafka;

import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.paymentservice.domain.EventOutbox;
import com.chitfund.paymentservice.domain.enums.OutboxStatus;
import com.chitfund.paymentservice.repository.EventOutboxRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(name = "chitwise.outbox.enabled", havingValue = "true")
public class OutboxRelay {

    static final int MAX_ATTEMPTS = 10;

    private final EventOutboxRepository repository;
    private final SqsTemplate sqsTemplate;
    private final ObjectMapper objectMapper;

    @Scheduled(fixedDelayString = "${chitwise.outbox.relay-delay-ms:2000}")
    @Transactional
    public void drain() {
        List<EventOutbox> batch = repository.claimBatch(100);
        for (EventOutbox event : batch) {
            try {
                String envelope = objectMapper.writeValueAsString(new SqsEventEnvelope(
                        event.getId().toString(), event.getEventType(), event.getPayload()));
                sqsTemplate.send(event.getDestination(), envelope);
                event.setStatus(OutboxStatus.PUBLISHED);
                event.setPublishedAt(LocalDateTime.now());
                event.setLastError(null);
            } catch (Exception failure) {
                markFailure(event, failure);
            }
        }
    }

    private void markFailure(EventOutbox event, Exception failure) {
        int attempts = event.getAttempts() + 1;
        event.setAttempts(attempts);
        event.setLastError(limit(failure.getMessage(), 2000));
        if (attempts >= MAX_ATTEMPTS) {
            event.setStatus(OutboxStatus.FAILED);
            log.error("Outbox event {} permanently failed after {} attempts: {}",
                    event.getId(), attempts, failure.getMessage());
            return;
        }
        long delaySeconds = Math.min(1L << Math.min(attempts, 8), 300L);
        event.setNextAttemptAt(LocalDateTime.now().plusSeconds(delaySeconds));
        log.warn("Outbox event {} failed (attempt {}); retrying in {}s: {}",
                event.getId(), attempts, delaySeconds, failure.getMessage());
    }

    private String limit(String message, int maxLength) {
        if (message == null || message.length() <= maxLength) return message;
        return message.substring(0, maxLength);
    }
}
