package com.chitfund.memberservice.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Serializes exact-limit operations for one tenant until the caller commits. */
@Component
@RequiredArgsConstructor
public class TenantOperationLock {
    private final JdbcTemplate jdbcTemplate;

    @Transactional(propagation = Propagation.MANDATORY)
    public void acquire(String tenantId) {
        jdbcTemplate.update(
                "INSERT IGNORE INTO tenant_operation_locks (tenant_id, created_at) VALUES (?, NOW(6))",
                tenantId);
        jdbcTemplate.queryForObject(
                "SELECT tenant_id FROM tenant_operation_locks WHERE tenant_id = ? FOR UPDATE",
                String.class, tenantId);
    }
}
