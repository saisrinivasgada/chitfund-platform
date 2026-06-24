package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.SettlementChitItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SettlementChitItemRepository extends JpaRepository<SettlementChitItem, UUID> {

    List<SettlementChitItem> findBySettlementId(UUID settlementId);
}
