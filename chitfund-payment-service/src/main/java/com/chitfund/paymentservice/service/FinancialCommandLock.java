package com.chitfund.paymentservice.service;

import com.chitfund.common.exception.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** A database mutex survives process boundaries and releases with its transaction. */
@Component @RequiredArgsConstructor
public class FinancialCommandLock {
    private final JdbcTemplate jdbc;
    public void lock(String tenant, String operation) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("Financial command lock requires a transaction");
        if (operation == null || operation.isBlank() || operation.length() > 128) throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Include a valid collection operation identity");
        // The upsert takes an exclusive row lock, avoiding shared-to-exclusive
        // lock upgrades when two first submissions arrive together.
        jdbc.update("INSERT INTO offline_payment_command_locks(tenant_id, operation_key) VALUES (?, ?) "
                + "ON DUPLICATE KEY UPDATE operation_key=offline_payment_command_locks.operation_key", tenant, operation);
    }
}
