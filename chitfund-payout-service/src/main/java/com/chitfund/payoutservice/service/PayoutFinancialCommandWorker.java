package com.chitfund.payoutservice.service;

import com.chitfund.payoutservice.client.PaymentServiceClient;
import com.chitfund.payoutservice.repository.PayoutFinancialCommandRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;

@Component
@Slf4j
public class PayoutFinancialCommandWorker {
    private final PayoutFinancialCommandRepository repository;
    private final PayoutFinancialCommandStore store;
    private final PaymentServiceClient paymentServiceClient;
    private final Counter completed;
    private final Counter retried;
    private final AtomicLong pendingGauge = new AtomicLong();
    private final AtomicLong failedGauge = new AtomicLong();

    public PayoutFinancialCommandWorker(PayoutFinancialCommandRepository repository,
                                        PayoutFinancialCommandStore store,
                                        PaymentServiceClient paymentServiceClient,
                                        MeterRegistry meterRegistry) {
        this.repository = repository;
        this.store = store;
        this.paymentServiceClient = paymentServiceClient;
        this.completed = meterRegistry.counter("chitwise.payout.financial_sync.completed");
        this.retried = meterRegistry.counter("chitwise.payout.financial_sync.retried");
        Gauge.builder("chitwise.payout.financial_sync.pending", pendingGauge, AtomicLong::get)
                .register(meterRegistry);
        Gauge.builder("chitwise.payout.financial_sync.failed", failedGauge, AtomicLong::get)
                .register(meterRegistry);
    }

    @Scheduled(fixedDelayString = "${chitwise.payout-financial-sync-delay-ms:2000}")
    public void processReady() {
        try {
            for (var id : repository.findReadyIds(LocalDateTime.now(), PageRequest.of(0, 25))) {
                var claimed = store.claim(id);
                if (claimed.isEmpty()) continue;
                try {
                    var command = claimed.get();
                    paymentServiceClient.execute(command);
                    store.complete(id, command.getClaimToken());
                    completed.increment();
                } catch (Exception error) {
                    log.warn("Payout financial command {} failed; it will retry", id);
                    store.fail(id, claimed.get().getClaimToken(), error);
                    retried.increment();
                }
            }
        } finally {
            refreshMetrics();
        }
    }

    private void refreshMetrics() {
        try {
            pendingGauge.set(repository.countByStatus("PENDING")
                    + repository.countByStatus("PROCESSING")
                    + repository.countByStatus("RETRY"));
            failedGauge.set(repository.countByStatus("FAILED"));
        } catch (Exception error) {
            log.warn("Could not refresh payout financial sync metrics: {}",
                    error.getClass().getSimpleName());
        }
    }
}
