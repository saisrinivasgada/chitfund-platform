package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.SettlementPaymentRecordEffect;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SettlementPaymentRecordEffectRepository
        extends JpaRepository<SettlementPaymentRecordEffect, UUID> {
    List<SettlementPaymentRecordEffect> findBySettlementIdOrderByPaymentRecordId(UUID settlementId);
}
