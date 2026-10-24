package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.client.AuditClient;
import com.chitfund.paymentservice.domain.enums.*;
import com.chitfund.paymentservice.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import java.time.LocalDateTime;
import java.util.*;

/** Durable, coalesced work: enqueue commits with money; reconciliation uses committed state. */
@Component
@RequiredArgsConstructor
public class DrawReconciliationQueue {
    private final JdbcTemplate jdbc;
    private final ChitMonthDrawRepository draws;
    private final PaymentRecordRepository payments;
    private final AuditClient audit;
    private static final UUID SYSTEM = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final Set<PaymentRecordStatus> SETTLED = EnumSet.of(
            PaymentRecordStatus.SETTLED, PaymentRecordStatus.WAIVED, PaymentRecordStatus.PAYOUT_DEDUCTED,
            PaymentRecordStatus.CREDIT_COVERED, PaymentRecordStatus.SETTLEMENT_CLEARED);

    @Transactional(propagation = Propagation.MANDATORY)
    public void enqueue(String tenantId, UUID chitId, int month, boolean checkReopen) {
        jdbc.update("""
                INSERT INTO draw_reconciliation_queue (tenant_id, chit_id, month_number, check_reopen)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE check_reopen = check_reopen OR VALUES(check_reopen)
                """, tenantId, chitId.toString(), month, checkReopen);
    }

    // Claim and consume in one short database transaction. If it fails, the work
    // remains pending; another instance can continue it. No network calls run here.
    // READ_COMMITTED also avoids a batch's first read pinning later draws to stale data.
    @Scheduled(fixedDelayString = "${chitwise.draw-reconciliation-delay-ms:2000}")
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void reconcile() {
        var pending = jdbc.query("""
                SELECT tenant_id, chit_id, month_number, check_reopen
                FROM draw_reconciliation_queue ORDER BY created_at, tenant_id, chit_id, month_number
                LIMIT 25 FOR UPDATE SKIP LOCKED
                """, (rs, row) -> new Pending(rs.getString(1), UUID.fromString(rs.getString(2)), rs.getInt(3), rs.getBoolean(4)));
        for (var work : pending) {
            var draw = draws.findAuctionDrawForUpdate(work.tenant(), work.chit(), work.month()).orElse(null);
            if (draw != null && (draw.getStatus() == DrawStatus.OPEN || draw.getStatus() == DrawStatus.CLOSED)) {
                var records = payments.findByTenantIdAndChitIdAndMonthNumber(work.tenant(), work.chit(), work.month());
                boolean allSettled = !records.isEmpty() && records.stream().allMatch(record -> SETTLED.contains(record.getStatus()));
                DrawStatus before = draw.getStatus();
                if (before == DrawStatus.OPEN && allSettled) {
                    draw.setStatus(DrawStatus.CLOSED); draw.setClosedAt(LocalDateTime.now()); draw.setClosedBy(SYSTEM);
                } else if (before == DrawStatus.CLOSED && work.reopen() && !records.isEmpty() && !allSettled) {
                    draw.setStatus(DrawStatus.OPEN); draw.setClosedAt(null); draw.setClosedBy(null);
                }
                if (draw.getStatus() != before) {
                    draws.save(draw);
                    audit.log("CHIT_DRAW", work.chit() + "-" + work.month(), work.chit().toString(),
                            draw.getStatus() == DrawStatus.CLOSED ? "DRAW_AUTO_CLOSED" : "DRAW_AUTO_REOPENED",
                            SYSTEM.toString(), "SYSTEM", Map.of("status", before),
                            Map.of("status", draw.getStatus(), "monthNumber", work.month(), "reason", "INSTALLMENT_BALANCE_CHANGED"), work.tenant());
                }
            }
            // A writer waiting on this row upserts a new command AFTER our commit.
            // Its later installment change therefore cannot be lost by this delete.
            jdbc.update("DELETE FROM draw_reconciliation_queue WHERE tenant_id=? AND chit_id=? AND month_number=?",
                    work.tenant(), work.chit().toString(), work.month());
        }
    }
    private record Pending(String tenant, UUID chit, int month, boolean reopen) {}
}
