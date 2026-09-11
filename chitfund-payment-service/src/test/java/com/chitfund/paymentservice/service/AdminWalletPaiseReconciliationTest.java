package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.config.AdminWalletPaiseProperties;
import com.chitfund.paymentservice.repository.AdminWalletRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AdminWalletPaiseReconciliationTest {

    @Test
    void exportsMissingAndMismatchCountsWithoutMoneyOrTenantLabels() {
        AdminWalletRepository repository = mock(AdminWalletRepository.class);
        when(repository.countMissingPaise()).thenReturn(12L);
        when(repository.countPaiseMismatches()).thenReturn(2L);
        AdminWalletPaiseProperties properties = new AdminWalletPaiseProperties();
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        var reconciliation = new AdminWalletPaiseReconciliation(
                repository, properties, registry);

        reconciliation.reconcile();

        assertThat(registry.get("chitwise.money.shadow.missing")
                .tag("table", "admin_wallet").gauge().value()).isEqualTo(12);
        assertThat(registry.get("chitwise.money.shadow.mismatch")
                .tag("table", "admin_wallet").gauge().value()).isEqualTo(2);
    }

    @Test
    void canBeDisabledDuringRollback() {
        AdminWalletRepository repository = mock(AdminWalletRepository.class);
        AdminWalletPaiseProperties properties = new AdminWalletPaiseProperties();
        properties.setReconciliationEnabled(false);
        var reconciliation = new AdminWalletPaiseReconciliation(
                repository, properties, new SimpleMeterRegistry());

        reconciliation.reconcile();

        verifyNoInteractions(repository);
    }
}
