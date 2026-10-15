package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.InternalFinancialOperation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface InternalFinancialOperationRepository
        extends JpaRepository<InternalFinancialOperation, UUID> {
}
