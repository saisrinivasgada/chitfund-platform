package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.NotificationClient;
import com.chitfund.chitservice.repository.ChitLifecycleCommandRepository;
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
public class ChitLifecycleCommandWorker {
    private final ChitLifecycleCommandRepository repository;
    private final ChitLifecycleCommandStore store;
    private final NotificationClient paymentClient;
    private final DrawSkipCoordinator drawSkips;
    private final Counter completed;
    private final Counter retried;
    private final AtomicLong pendingGauge = new AtomicLong();
    private final AtomicLong failedGauge = new AtomicLong();

    public ChitLifecycleCommandWorker(ChitLifecycleCommandRepository repository,
                                      ChitLifecycleCommandStore store,
                                      NotificationClient paymentClient,
                                      MeterRegistry meterRegistry, DrawSkipCoordinator drawSkips) {
        this.drawSkips = drawSkips;
        this.repository = repository;
        this.store = store;
        this.paymentClient = paymentClient;
        this.completed = meterRegistry.counter("chitwise.chit.lifecycle_sync.completed");
        this.retried = meterRegistry.counter("chitwise.chit.lifecycle_sync.retried");
        Gauge.builder("chitwise.chit.lifecycle_sync.pending", pendingGauge, AtomicLong::get)
                .register(meterRegistry);
        Gauge.builder("chitwise.chit.lifecycle_sync.failed", failedGauge, AtomicLong::get)
                .register(meterRegistry);
    }

    @Scheduled(fixedDelayString = "${chitwise.lifecycle-sync-delay-ms:2000}")
    public void processReady() {
        try {
            for (var id : repository.findReadyIds(LocalDateTime.now(), PageRequest.of(0, 25))) {
                var claimed = store.claim(id);
                if (claimed.isEmpty()) continue;
                var command = claimed.get();
                try {
                    if (DrawSkipCoordinator.SKIP_DRAW.equals(command.getCommandType()) || "SHIFT_SCHEDULE".equals(command.getCommandType())) {
                        var result = paymentClient.skipDraw(drawSkips.decode(command), command.getTenantId());
                        drawSkips.complete(command, result);
                    } else if (ChitLifecycleCommandStore.CLOSE_DRAWS.equals(command.getCommandType())) {
                        paymentClient.closeDrawsForChit(command.getChitId(), command.getTenantId());
                        store.complete(id, command.getClaimToken());
                    } else {
                        throw new IllegalArgumentException("Unsupported chit lifecycle command");
                    }
                    completed.increment();
                } catch (Exception error) {
                    log.warn("Chit lifecycle command {} failed; it will retry", id);
                    store.fail(id, command.getClaimToken(), error);
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
            log.warn("Could not refresh chit lifecycle metrics: {}",
                    error.getClass().getSimpleName());
        }
    }
}
