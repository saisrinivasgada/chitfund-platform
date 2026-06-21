package com.chitfund.paymentservice.service;

import com.chitfund.common.event.ChitMonthOpenedEvent;
import com.chitfund.common.event.ChitMonthSkippedEvent;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.paymentservice.domain.ChitMonthDraw;
import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.enums.DrawStatus;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import com.chitfund.common.exception.ResourceNotFoundException;
import com.chitfund.paymentservice.dto.request.OpenMonthRequest;
import com.chitfund.paymentservice.dto.request.SkipMonthRequest;
import com.chitfund.paymentservice.dto.response.DrawSummaryResponse;
import com.chitfund.paymentservice.dto.response.PaymentRecordResponse;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
import com.chitfund.paymentservice.repository.ChitMonthDrawRepository;
import com.chitfund.paymentservice.repository.PaymentAllocationRepository;
import com.chitfund.paymentservice.repository.PaymentRecordRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChitMonthDrawService {

    private final ChitMonthDrawRepository drawRepository;
    private final PaymentRecordRepository paymentRecordRepository;
    private final PaymentAllocationRepository allocationRepository;
    private final PaymentEventPublisher eventPublisher;
    private final NotificationService notificationService;
    private final com.chitfund.paymentservice.client.MemberServiceClient memberServiceClient;

    @Transactional
    public DrawSummaryResponse openMonth(OpenMonthRequest request, UUID adminId) {
        long realCycles = drawRepository.countByChitIdAndStatusNot(request.getChitId(), DrawStatus.SKIPPED);
        if (realCycles >= request.getMaxCycles()) {
            throw new BusinessException(ErrorCode.CHIT_CYCLES_EXHAUSTED,
                    "All " + request.getMaxCycles() + " real cycles for this chit have already been opened. Skipped months do not count toward the total.");
        }

        if (drawRepository.existsByChitIdAndMonthNumber(request.getChitId(), request.getMonthNumber())) {
            throw new BusinessException(ErrorCode.MONTH_ALREADY_OPEN,
                    "Month " + request.getMonthNumber() + " is already open or skipped for this chit");
        }

        ChitMonthDraw cycle = ChitMonthDraw.builder()
                .chitId(request.getChitId())
                .monthNumber(request.getMonthNumber())
                .dueDate(request.getDueDate())
                .installmentAmount(request.getInstallmentAmount())
                .totalMembers(request.getMembers().size())
                .status(DrawStatus.OPEN)
                .openedAt(LocalDateTime.now())
                .openedBy(adminId)
                .build();
        drawRepository.save(cycle);

        List<PaymentRecord> records = request.getMembers().stream()
                .map(m -> PaymentRecord.builder()
                        .chitId(request.getChitId())
                        .memberId(m.getMemberId())
                        .monthNumber(request.getMonthNumber())
                        .dueDate(request.getDueDate())
                        .amountDue(m.getAmountDue())
                        .amountPaid(BigDecimal.ZERO)
                        .status(PaymentRecordStatus.OUTSTANDING)
                        .build())
                .toList();
        paymentRecordRepository.saveAll(records);

        log.info("Admin {} opened cycle {} for chit {} — {} payment records created",
                adminId, request.getMonthNumber(), request.getChitId(), records.size());

        List<String> memberIdStrings = request.getMembers().stream()
                .map(m -> m.getMemberId().toString()).toList();
        eventPublisher.publish(new ChitMonthOpenedEvent(
                request.getChitId().toString(),
                null,
                request.getMonthNumber(),
                request.getDueDate(),
                request.getInstallmentAmount(),
                request.getMembers().size(),
                memberIdStrings,
                adminId.toString(),
                Instant.now()
        ));

        // Notify enrolled members: their payment is due
        try {
            List<java.util.UUID> memberIds = request.getMembers().stream()
                    .map(m -> m.getMemberId()).toList();
            java.util.Map<String, String> userIdMap = memberServiceClient.batchGetUserIds(memberIds);
            List<java.util.UUID> userIds = userIdMap.values().stream()
                    .map(java.util.UUID::fromString).toList();
            if (!userIds.isEmpty()) {
                notificationService.notifyUsers(userIds,
                        com.chitfund.paymentservice.domain.enums.NotificationType.CYCLE_OPENED,
                        "Payment Due — Cycle #" + request.getMonthNumber(),
                        "Your installment of ₹" + request.getInstallmentAmount() +
                                " is due by " + request.getDueDate() + ".",
                        "CYCLE", cycle.getId(), "/member");
            }
        } catch (Exception ex) {
            log.warn("Could not send cycle notifications: {}", ex.getMessage());
        }

        return buildSummary(cycle, records);
    }

    @Transactional
    public DrawSummaryResponse skipMonth(SkipMonthRequest request, UUID adminId) {
        if (drawRepository.existsByChitIdAndMonthNumber(request.getChitId(), request.getMonthNumber())) {
            throw new BusinessException(ErrorCode.MONTH_ALREADY_OPEN,
                    "Month " + request.getMonthNumber() + " is already open or skipped for this chit");
        }

        ChitMonthDraw cycle = ChitMonthDraw.builder()
                .chitId(request.getChitId())
                .monthNumber(request.getMonthNumber())
                .dueDate(request.getDueDate())
                .installmentAmount(request.getInstallmentAmount())
                .totalMembers(request.getMemberIds().size())
                .status(DrawStatus.SKIPPED)
                .skipReason(request.getSkipReason())
                .skippedAt(LocalDateTime.now())
                .skippedBy(adminId)
                .build();
        drawRepository.save(cycle);

        // WAIVED records preserve installmentAmount for reports ("₹X waived in month Y due to Z")
        List<PaymentRecord> waivedRecords = request.getMemberIds().stream()
                .map(memberId -> PaymentRecord.builder()
                        .chitId(request.getChitId())
                        .memberId(memberId)
                        .monthNumber(request.getMonthNumber())
                        .dueDate(request.getDueDate())
                        .amountDue(request.getInstallmentAmount())
                        .amountPaid(BigDecimal.ZERO)
                        .status(PaymentRecordStatus.WAIVED)
                        .build())
                .toList();
        paymentRecordRepository.saveAll(waivedRecords);

        log.info("Admin {} skipped month {} for chit {}. Reason: {}",
                adminId, request.getMonthNumber(), request.getChitId(), request.getSkipReason());

        eventPublisher.publish(new ChitMonthSkippedEvent(
                request.getChitId().toString(),
                null,
                request.getMonthNumber(),
                request.getDueDate(),
                request.getInstallmentAmount(),
                request.getMemberIds().size(),
                request.getMemberIds().stream().map(UUID::toString).toList(),
                request.getSkipReason(),
                adminId.toString(),
                Instant.now()
        ));

        return buildSummary(cycle, waivedRecords);
    }

    @Transactional
    public DrawSummaryResponse closeMonth(UUID cycleId, UUID adminId) {
        ChitMonthDraw cycle = drawRepository.findById(cycleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                        "Cycle not found: " + cycleId));

        if (cycle.getStatus() != DrawStatus.OPEN) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Only OPEN months can be closed. Current status: " + cycle.getStatus());
        }

        cycle.setStatus(DrawStatus.CLOSED);
        cycle.setClosedAt(LocalDateTime.now());
        cycle.setClosedBy(adminId);
        drawRepository.save(cycle);

        log.info("Admin {} closed month {} for chit {}", adminId, cycle.getMonthNumber(), cycle.getChitId());

        return buildSummaryWithLiveStats(cycle);
    }

    @Transactional(readOnly = true)
    public List<DrawSummaryResponse> getDashboard() {
        List<ChitMonthDraw> openCycles = drawRepository.findByStatusOrderByDueDateAsc(DrawStatus.OPEN);
        return openCycles.stream()
                .map(this::buildSummaryWithLiveStats)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<DrawSummaryResponse> getCyclesForChit(UUID chitId) {
        return drawRepository.findByChitIdOrderByMonthNumberAsc(chitId).stream()
                .map(this::buildSummaryWithLiveStats)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<DrawSummaryResponse> getTodaysDraws() {
        LocalDateTime start = LocalDate.now().atStartOfDay();
        LocalDateTime end   = start.plusDays(1);
        return drawRepository.findTodaysDraws(start, end).stream()
                .map(this::buildSummaryWithLiveStats)
                .toList();
    }

    private DrawSummaryResponse buildSummaryWithLiveStats(ChitMonthDraw cycle) {
        List<PaymentRecord> records = paymentRecordRepository
                .findByChitIdAndMonthNumber(cycle.getChitId(), cycle.getMonthNumber());

        long settled     = count(records, PaymentRecordStatus.SETTLED);
        long partial     = count(records, PaymentRecordStatus.PARTIALLY_PAID);
        long outstanding = count(records, PaymentRecordStatus.OUTSTANDING);
        long waived      = count(records, PaymentRecordStatus.WAIVED);

        BigDecimal totalCollected = records.stream()
                .map(PaymentRecord::getAmountPaid)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalOutstanding = records.stream()
                .map(r -> r.getAmountDue().subtract(r.getAmountPaid()))
                .filter(b -> b.compareTo(BigDecimal.ZERO) > 0)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return DrawSummaryResponse.builder()
                .id(cycle.getId())
                .chitId(cycle.getChitId())
                .monthNumber(cycle.getMonthNumber())
                .dueDate(cycle.getDueDate())
                .installmentAmount(cycle.getInstallmentAmount())
                .totalMembers(cycle.getTotalMembers())
                .status(cycle.getStatus())
                .settledCount((int) settled)
                .partiallyPaidCount((int) partial)
                .outstandingCount((int) outstanding)
                .waivedCount((int) waived)
                .totalCollected(totalCollected)
                .totalOutstanding(totalOutstanding)
                .skipReason(cycle.getSkipReason())
                .openedAt(cycle.getOpenedAt())
                .openedBy(cycle.getOpenedBy())
                .closedAt(cycle.getClosedAt())
                .closedBy(cycle.getClosedBy())
                .skippedAt(cycle.getSkippedAt())
                .skippedBy(cycle.getSkippedBy())
                .build();
    }

    private DrawSummaryResponse buildSummary(ChitMonthDraw cycle, List<PaymentRecord> records) {
        boolean isSkipped = cycle.getStatus() == DrawStatus.SKIPPED;
        int memberCount = records.size();

        return DrawSummaryResponse.builder()
                .id(cycle.getId())
                .chitId(cycle.getChitId())
                .monthNumber(cycle.getMonthNumber())
                .dueDate(cycle.getDueDate())
                .installmentAmount(cycle.getInstallmentAmount())
                .totalMembers(memberCount)
                .status(cycle.getStatus())
                .settledCount(0)
                .partiallyPaidCount(0)
                .outstandingCount(isSkipped ? 0 : memberCount)
                .waivedCount(isSkipped ? memberCount : 0)
                .totalCollected(BigDecimal.ZERO)
                .totalOutstanding(isSkipped ? BigDecimal.ZERO
                        : records.stream().map(PaymentRecord::getAmountDue).reduce(BigDecimal.ZERO, BigDecimal::add))
                .skipReason(cycle.getSkipReason())
                .openedAt(cycle.getOpenedAt())
                .openedBy(cycle.getOpenedBy())
                .closedAt(cycle.getClosedAt())
                .closedBy(cycle.getClosedBy())
                .skippedAt(cycle.getSkippedAt())
                .skippedBy(cycle.getSkippedBy())
                .build();
    }

    /**
     * Deletes an accidentally-opened cycle and all its payment records.
     *
     * WHY require zero payments? Deletion reverses time — if any member already paid,
     * that money is physically with the admin. Deleting the cycle silently would create
     * untracked cash. Force admin to void those batches first (which reverses FIFO and
     * returns the record to OUTSTANDING), so the audit trail stays intact.
     */
    @Transactional
    public void deleteDraw(UUID cycleId, UUID adminId) {
        ChitMonthDraw cycle = drawRepository.findById(cycleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                        "Cycle not found: " + cycleId));

        if (cycle.getStatus() != DrawStatus.OPEN) {
            throw new BusinessException(ErrorCode.CYCLE_NOT_DELETABLE,
                    "Only OPEN cycles can be deleted. This cycle is " + cycle.getStatus());
        }

        List<PaymentRecord> records = paymentRecordRepository
                .findByChitIdAndMonthNumber(cycle.getChitId(), cycle.getMonthNumber());

        boolean hasPayments = records.stream()
                .anyMatch(r -> r.getAmountPaid().compareTo(BigDecimal.ZERO) > 0);

        if (hasPayments) {
            long count = records.stream()
                    .filter(r -> r.getAmountPaid().compareTo(BigDecimal.ZERO) > 0)
                    .count();
            throw new BusinessException(ErrorCode.CYCLE_HAS_PAYMENTS,
                    count + " member(s) have already paid for this cycle. Void their payment batches first, then delete.");
        }

        // Delete any orphaned allocations pointing to these records (from previously voided batches)
        List<UUID> recordIds = records.stream().map(PaymentRecord::getId).toList();
        if (!recordIds.isEmpty()) {
            allocationRepository.deleteByPaymentRecordIdIn(recordIds);
            paymentRecordRepository.deleteByChitIdAndMonthNumber(cycle.getChitId(), cycle.getMonthNumber());
        }

        drawRepository.delete(cycle);

        log.info("Admin {} deleted cycle {} (month {}) for chit {} — {} payment records removed",
                adminId, cycleId, cycle.getMonthNumber(), cycle.getChitId(), records.size());
    }

    @Transactional(readOnly = true)
    public Map<UUID, Integer> getLatestCycleNumbers(List<UUID> chitIds) {
        if (chitIds == null || chitIds.isEmpty()) return Map.of();
        return drawRepository.findMaxMonthNumberByChitIds(chitIds).stream()
                .collect(Collectors.toMap(
                        row -> (UUID) row[0],
                        row -> ((Number) row[1]).intValue()
                ));
    }

    @Transactional(readOnly = true)
    public List<PaymentRecordResponse> getCyclePayments(UUID cycleId) {
        ChitMonthDraw cycle = drawRepository.findById(cycleId)
                .orElseThrow(() -> new ResourceNotFoundException("Cycle", cycleId));
        LocalDate today = LocalDate.now();
        return paymentRecordRepository
                .findByChitIdAndMonthNumber(cycle.getChitId(), cycle.getMonthNumber())
                .stream()
                .map(r -> PaymentRecordResponse.builder()
                        .id(r.getId())
                        .chitId(r.getChitId())
                        .memberId(r.getMemberId())
                        .monthNumber(r.getMonthNumber())
                        .dueDate(r.getDueDate())
                        .amountDue(r.getAmountDue())
                        .amountPaid(r.getAmountPaid())
                        .balance(r.getAmountDue().subtract(r.getAmountPaid()))
                        .status(r.getStatus())
                        .overdue((r.getStatus() == PaymentRecordStatus.OUTSTANDING
                                || r.getStatus() == PaymentRecordStatus.PARTIALLY_PAID)
                                && r.getDueDate().isBefore(today))
                        .createdAt(r.getCreatedAt())
                        .updatedAt(r.getUpdatedAt())
                        .build())
                .collect(Collectors.toList());
    }

    private long count(List<PaymentRecord> records, PaymentRecordStatus status) {
        return records.stream().filter(r -> r.getStatus() == status).count();
    }
}
