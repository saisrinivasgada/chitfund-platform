package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.domain.AdminWalletEntry;
import com.chitfund.paymentservice.domain.enums.AccountType;
import com.chitfund.paymentservice.domain.enums.WalletEntryType;
import com.chitfund.paymentservice.dto.request.AdminWalletEntryRequest;
import com.chitfund.paymentservice.dto.request.RedeemCreditRequest;
import com.chitfund.paymentservice.dto.request.TransferRequest;
import com.chitfund.paymentservice.dto.response.AdminWalletBalanceResponse;
import com.chitfund.paymentservice.dto.response.AdminWalletEntryResponse;
import com.chitfund.paymentservice.repository.AdminWalletRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chitfund.paymentservice.dto.response.PagedResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AdminWalletService {

    private final AdminWalletRepository walletRepository;
    private final PlanExpiryChecker planExpiryChecker;
    private final MemberCreditService memberCreditService;

    @Transactional
    public AdminWalletEntryResponse addEntry(AdminWalletEntryRequest req, UUID createdBy, String tenantId) {
        planExpiryChecker.assertNotExpired();
        AdminWalletEntry entry = AdminWalletEntry.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .accountType(req.getAccountType())
                .entryType(req.getEntryType())
                .amount(req.getAmount())
                .category(req.getCategory())
                .description(req.getDescription())
                .referenceId(req.getReferenceId())
                .createdAt(LocalDateTime.now())
                .createdBy(createdBy)
                .build();
        return toResponse(walletRepository.save(entry));
    }

    public AdminWalletBalanceResponse getBalance(String tenantId) {
        BigDecimal cashIn  = walletRepository.sumByTenantAndAccountTypeAndEntryType(tenantId, AccountType.CASH, WalletEntryType.IN);
        BigDecimal cashOut = walletRepository.sumByTenantAndAccountTypeAndEntryType(tenantId, AccountType.CASH, WalletEntryType.OUT);
        BigDecimal bankIn  = walletRepository.sumByTenantAndAccountTypeAndEntryType(tenantId, AccountType.BANK, WalletEntryType.IN);
        BigDecimal bankOut = walletRepository.sumByTenantAndAccountTypeAndEntryType(tenantId, AccountType.BANK, WalletEntryType.OUT);

        BigDecimal cashBalance = cashIn.subtract(cashOut);
        BigDecimal bankBalance = bankIn.subtract(bankOut);

        List<AdminWalletEntryResponse> recent = walletRepository.findByTenantIdOrderByCreatedAtDesc(tenantId)
                .stream().limit(50).map(this::toResponse).toList();

        return AdminWalletBalanceResponse.builder()
                .cashBalance(cashBalance)
                .bankBalance(bankBalance)
                .totalBalance(cashBalance.add(bankBalance))
                .recentTransactions(recent)
                .build();
    }

    public List<AdminWalletEntryResponse> listAll(String tenantId) {
        return walletRepository.findByTenantIdOrderByCreatedAtDesc(tenantId)
                .stream().map(this::toResponse).toList();
    }

    public PagedResponse<AdminWalletEntryResponse> listPaged(int page, int size, String tenantId) {
        PageRequest pr = PageRequest.of(page, size, Sort.by("createdAt").descending());
        Page<AdminWalletEntry> result = walletRepository.findByTenantIdOrderByCreatedAtDesc(tenantId, pr);
        return PagedResponse.<AdminWalletEntryResponse>builder()
                .content(result.getContent().stream().map(this::toResponse).toList())
                .totalElements(result.getTotalElements())
                .page(page)
                .size(size)
                .hasMore(result.hasNext())
                .build();
    }

    @Transactional
    public List<AdminWalletEntryResponse> transfer(TransferRequest req, UUID createdBy, String tenantId) {
        AccountType from = req.getFromAccount();
        AccountType to = from == AccountType.CASH ? AccountType.BANK : AccountType.CASH;
        LocalDateTime now = LocalDateTime.now();
        String desc = req.getDescription() != null && !req.getDescription().isBlank()
                ? req.getDescription()
                : "Transfer " + from + " → " + to;

        AdminWalletEntry outEntry = AdminWalletEntry.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .accountType(from)
                .entryType(WalletEntryType.OUT)
                .amount(req.getAmount())
                .category("TRANSFER")
                .description(desc)
                .createdAt(now)
                .createdBy(createdBy)
                .build();

        AdminWalletEntry inEntry = AdminWalletEntry.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .accountType(to)
                .entryType(WalletEntryType.IN)
                .amount(req.getAmount())
                .category("TRANSFER")
                .description(desc)
                .createdAt(now)
                .createdBy(createdBy)
                .build();

        return List.of(toResponse(walletRepository.save(outEntry)),
                       toResponse(walletRepository.save(inEntry)));
    }

    @Transactional
    public AdminWalletEntryResponse redeemCredit(RedeemCreditRequest req, UUID adminId, String tenantId) {
        planExpiryChecker.assertNotExpired();
        java.math.BigDecimal available = memberCreditService.getBalance(req.getMemberId());
        if (available.compareTo(req.getAmount()) < 0) {
            throw new IllegalArgumentException(
                "Insufficient credit balance. Available: ₹" + available + ", requested: ₹" + req.getAmount());
        }
        memberCreditService.consumeCredit(
            req.getMemberId(), req.getAmount(), null, null, adminId,
            "Credit balance returned as cash" + (req.getNotes() != null ? " — " + req.getNotes() : ""));

        String desc = "Credit balance return for member " + req.getMemberId()
            + (req.getNotes() != null && !req.getNotes().isBlank() ? " — " + req.getNotes() : "");

        AdminWalletEntry entry = AdminWalletEntry.builder()
                .id(java.util.UUID.randomUUID())
                .tenantId(tenantId)
                .accountType(req.getAccountType())
                .entryType(WalletEntryType.OUT)
                .amount(req.getAmount())
                .category("CREDIT_WITHDRAWAL")
                .description(desc)
                .createdAt(java.time.LocalDateTime.now())
                .createdBy(adminId)
                .build();
        return toResponse(walletRepository.save(entry));
    }

    private AdminWalletEntryResponse toResponse(AdminWalletEntry e) {
        return AdminWalletEntryResponse.builder()
                .id(e.getId())
                .accountType(e.getAccountType())
                .entryType(e.getEntryType())
                .amount(e.getAmount())
                .category(e.getCategory())
                .description(e.getDescription())
                .referenceId(e.getReferenceId())
                .createdAt(e.getCreatedAt())
                .createdBy(e.getCreatedBy())
                .build();
    }
}
