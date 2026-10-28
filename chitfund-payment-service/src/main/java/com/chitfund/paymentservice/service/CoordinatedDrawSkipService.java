package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.dto.*;
import com.chitfund.common.exception.*;
import com.chitfund.paymentservice.domain.enums.DrawStatus;
import com.chitfund.paymentservice.repository.ChitMonthDrawRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CoordinatedDrawSkipService {
    private final FinancialCommandLock locks;
    private final ChitMonthDrawRepository draws;
    private final ChitMonthDrawService drawService;
    private final JdbcTemplate jdbc;

    @Transactional
    public DrawSkipResult execute(DrawSkipCommand command) {
        String tenant = TenantContext.get();
        if (tenant == null || tenant.isBlank() || command.commandId() == null) throw new BusinessException(ErrorCode.FORBIDDEN);
        String hash = command.fingerprint();
        locks.lock(tenant, "draw-schedule:" + command.request().getChitId());
        var prior = jdbc.query("SELECT request_hash, status, reason FROM draw_skip_command_receipts WHERE tenant_id=? AND command_id=?",
                (rs, row) -> new DrawSkipResult(command.commandId(), rs.getString(1), rs.getString(2), rs.getString(3)), tenant, command.commandId().toString());
        if (!prior.isEmpty()) {
            if (!hash.equals(prior.get(0).requestHash())) throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION, "Skip command details changed");
            return prior.get(0);
        }
        var existing = draws.findByTenantIdAndChitIdOrderByMonthNumberAsc(tenant, command.request().getChitId());
        boolean applied = existing.stream().anyMatch(draw -> draw.getStatus() == DrawStatus.SKIPPED
                && command.commandId().equals(draw.getSkipCommandId()) && hash.equals(draw.getSkipRequestHash()));
        // A persisted rejection proves that this command made no payment changes.
        // Never turn an HTTP exception or an ambiguous acknowledgement into rejection.
        boolean rejected = !applied && existing.stream().anyMatch(draw -> draw.getMonthNumber() >= command.request().getMonthNumber());
        if (!applied && !rejected) {
            if (command.scheduleOnly()) drawService.verifyScheduleShift(command);
            else drawService.skipDrawCommand(command);
        }
        String status = rejected ? "REJECTED" : "APPLIED", reason = rejected ? "DRAW_ALREADY_EXISTS" : null;
        jdbc.update("INSERT INTO draw_skip_command_receipts (tenant_id, command_id, chit_id, request_hash, status, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))",
                tenant, command.commandId().toString(), command.request().getChitId().toString(), hash, status, reason);
        return new DrawSkipResult(command.commandId(), hash, status, reason);
    }
}
