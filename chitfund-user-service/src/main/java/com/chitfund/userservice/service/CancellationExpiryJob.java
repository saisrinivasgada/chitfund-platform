package com.chitfund.userservice.service;

import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.repository.TenantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class CancellationExpiryJob {

    private final TenantRepository tenantRepository;
    private final AuditClient auditClient;

    // Runs daily at 01:00 — suspends tenants whose cancellation has taken effect (plan expired)
    @Scheduled(cron = "0 0 1 * * *")
    @Transactional
    public void effectCancelledSubscriptions() {
        LocalDateTime now = LocalDateTime.now();
        List<Tenant> due = tenantRepository
                .findAllByCancellationRequestedAtIsNotNullAndStatusAndPlanExpiresAtBefore("ACTIVE", now);

        if (due.isEmpty()) {
            log.info("CancellationExpiryJob: no expired cancellations to process");
            return;
        }

        log.info("CancellationExpiryJob: suspending {} tenant(s) whose cancellation has taken effect", due.size());
        for (Tenant t : due) {
            t.setStatus("SUSPENDED");
            t.setCancellationRequestedAt(null);
            t.setCancellationRequestedBy(null);
            tenantRepository.save(t);
            auditClient.log("TENANT", t.getId().toString(),
                    "SUBSCRIPTION_CANCELLED_EFFECTED", null, "SYSTEM",
                    Map.of("status", "ACTIVE"),
                    Map.of("status", "SUSPENDED", "reason", "cancellation_expiry"),
                    t.getId().toString());
            log.info("CancellationExpiryJob: suspended tenant {} ({})", t.getName(), t.getId());
        }
    }
}
