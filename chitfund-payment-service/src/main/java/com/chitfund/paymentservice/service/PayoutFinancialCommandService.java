package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.dto.PayoutFinancialCommandRequest;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.paymentservice.domain.InternalFinancialOperation;
import com.chitfund.paymentservice.domain.enums.AccountType;
import com.chitfund.paymentservice.domain.enums.WalletEntryType;
import com.chitfund.paymentservice.repository.InternalFinancialOperationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class PayoutFinancialCommandService {
    private final InternalFinancialOperationRepository receiptRepository;
    private final PaymentService paymentService;
    private final AdminWalletService walletService;

    @Transactional
    public void execute(PayoutFinancialCommandRequest request) {
        validateEnvelope(request);
        validateCommand(request);
        String requestHash = IdempotencyFingerprint.of(
                request.commandType(), request.tenantId(), request.actorId(), request.payoutId(),
                request.chitId(), request.memberId(), request.monthNumber(),
                request.amount(), request.disbursementMode());
        var existing = receiptRepository.findById(request.commandId());
        if (existing.isPresent()) {
            InternalFinancialOperation receipt = existing.get();
            if (!receipt.getOperationType().equals(request.commandType())
                    || !receipt.getRequestHash().equals(requestHash)) {
                throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                        "Financial command id was already used with different details",
                        HttpStatus.CONFLICT);
            }
            return;
        }

        // Insert and flush before changing money. A concurrent execution of the
        // same command loses on the primary key before it can apply side effects.
        receiptRepository.saveAndFlush(InternalFinancialOperation.builder()
                .id(request.commandId())
                .tenantId(request.tenantId())
                .operationType(request.commandType())
                .requestHash(requestHash)
                .completedAt(LocalDateTime.now())
                .build());

        String previousTenant = TenantContext.get();
        TenantContext.set(request.tenantId());
        try {
            switch (request.commandType()) {
                case "MARK_INSTALLMENT_DEDUCTION" -> paymentService.markPayoutDeducted(
                        request.chitId(), request.memberId(), request.monthNumber(), request.amount(),
                        request.payoutId(), request.tenantId());
                case "MARK_CROSS_CHIT_DEDUCTION" -> paymentService.markCrossChitDisbursementSettled(
                        request.chitId(), request.memberId(), request.amount(),
                        request.payoutId(), request.tenantId());
                case "REVERT_DEDUCTIONS" -> paymentService.revertPayoutDeductions(
                        request.payoutId(), request.tenantId());
                case "RECORD_TREASURY_DEBIT" -> walletService.addPayoutCommandEntry(
                        request.commandId(), request.payoutId(), request.amount(),
                        accountType(request.disbursementMode()), WalletEntryType.OUT,
                        "PAYOUT_DISBURSEMENT",
                        "Payout disbursed · " + request.memberId() + " via " + request.disbursementMode(),
                        request.actorId(), request.tenantId());
                case "RECORD_TREASURY_REVERSAL" -> walletService.addPayoutCommandEntry(
                        request.commandId(), request.payoutId(), request.amount(),
                        accountType(request.disbursementMode()), WalletEntryType.IN,
                        "PAYOUT_VOID_REVERSAL",
                        "Payout voided · reversal via " + request.disbursementMode(),
                        request.actorId(), request.tenantId());
                default -> throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Unknown payout financial command", HttpStatus.BAD_REQUEST);
            }
        } finally {
            if (previousTenant == null || previousTenant.isBlank()) TenantContext.clear();
            else TenantContext.set(previousTenant);
        }
    }

    private void validateEnvelope(PayoutFinancialCommandRequest request) {
        if (request == null || request.commandId() == null || request.payoutId() == null
                || request.commandType() == null || request.commandType().isBlank()
                || request.tenantId() == null || request.tenantId().isBlank()
                || request.actorId() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Financial command identity, type, payout and tenant are required",
                    HttpStatus.BAD_REQUEST);
        }
    }

    private void validateCommand(PayoutFinancialCommandRequest request) {
        switch (request.commandType()) {
            case "MARK_INSTALLMENT_DEDUCTION" -> {
                requireChitAndMember(request);
                if (request.monthNumber() == null || request.monthNumber() < 1) invalidCommand();
                requirePositiveAmount(request.amount());
            }
            case "MARK_CROSS_CHIT_DEDUCTION" -> {
                requireChitAndMember(request);
                requirePositiveAmount(request.amount());
            }
            case "REVERT_DEDUCTIONS" -> { }
            case "RECORD_TREASURY_DEBIT", "RECORD_TREASURY_REVERSAL" -> {
                requirePositiveAmount(request.amount());
                accountType(request.disbursementMode());
            }
            default -> throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Unknown payout financial command", HttpStatus.BAD_REQUEST);
        }
    }

    private void requireChitAndMember(PayoutFinancialCommandRequest request) {
        if (request.chitId() == null || request.memberId() == null) invalidCommand();
    }

    private void requirePositiveAmount(java.math.BigDecimal amount) {
        if (amount == null || amount.compareTo(java.math.BigDecimal.ZERO) <= 0) invalidCommand();
    }

    private void invalidCommand() {
        throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                "Payout financial command has missing or invalid fields",
                HttpStatus.BAD_REQUEST);
    }

    private AccountType accountType(String mode) {
        if (mode == null || mode.isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Disbursement mode is required for treasury commands",
                    HttpStatus.BAD_REQUEST);
        }
        return switch (mode) {
            case "CASH" -> AccountType.CASH;
            case "UPI", "BANK_TRANSFER", "CHEQUE" -> AccountType.BANK;
            default -> throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Unsupported disbursement mode", HttpStatus.BAD_REQUEST);
        };
    }
}
