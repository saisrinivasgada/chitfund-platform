package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.config.AdminWalletPaiseProperties;
import com.chitfund.paymentservice.repository.AdminWalletRepository;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

@Component
@Slf4j
public class AdminWalletPaiseReconciliation {

    private final AdminWalletRepository repository;
    private final AdminWalletPaiseProperties properties;
    private final AtomicLong missing = new AtomicLong();
    private final AtomicLong mismatched = new AtomicLong();

    public AdminWalletPaiseReconciliation(AdminWalletRepository repository,
                                          AdminWalletPaiseProperties properties,
                                          MeterRegistry meterRegistry) {
        this.repository = repository;
        this.properties = properties;
        String required = Boolean.toString(properties.isRequireComplete());
        Gauge.builder("chitwise.money.shadow.missing", missing, AtomicLong::get)
                .tag("service", "payment")
                .tag("table", "admin_wallet")
                .tag("required", required)
                .register(meterRegistry);
        Gauge.builder("chitwise.money.shadow.mismatch", mismatched, AtomicLong::get)
                .tag("service", "payment")
                .tag("table", "admin_wallet")
                .register(meterRegistry);
    }

    @Scheduled(fixedDelayString =
            "${chitwise.money.admin-wallet.reconciliation-delay-ms:60000}")
    public void reconcile() {
        if (!properties.isReconciliationEnabled()) return;
        long missingCount = repository.countMissingPaise();
        long mismatchCount = repository.countPaiseMismatches();
        missing.set(missingCount);
        mismatched.set(mismatchCount);
        if (mismatchCount > 0) {
            log.error("admin_wallet has {} decimal/paise mismatches", mismatchCount);
        }
        if (properties.isRequireComplete() && missingCount > 0) {
            log.error("admin_wallet has {} rows without paise after completeness was required",
                    missingCount);
        }
    }
}
