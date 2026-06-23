package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.domain.AdminWalletEntry;
import com.chitfund.paymentservice.domain.enums.AccountType;
import com.chitfund.paymentservice.domain.enums.WalletEntryType;
import com.chitfund.paymentservice.dto.request.AdminWalletEntryRequest;
import com.chitfund.paymentservice.dto.request.TransferRequest;
import com.chitfund.paymentservice.dto.response.AdminWalletBalanceResponse;
import com.chitfund.paymentservice.dto.response.AdminWalletEntryResponse;
import com.chitfund.paymentservice.repository.AdminWalletRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AdminWalletService {

    private final AdminWalletRepository walletRepository;

    @Transactional
    public AdminWalletEntryResponse addEntry(AdminWalletEntryRequest req, UUID createdBy) {
        AdminWalletEntry entry = AdminWalletEntry.builder()
                .id(UUID.randomUUID())
                .accountType(req.getAccountType())
                .entryType(req.getEntryType())
                .amount(req.getAmount())
                .category(req.getCategory())
                .description(req.getDescription())
                .createdAt(LocalDateTime.now())
                .createdBy(createdBy)
                .build();
        return toResponse(walletRepository.save(entry));
    }

    public AdminWalletBalanceResponse getBalance() {
        BigDecimal cashIn  = walletRepository.sumByAccountTypeAndEntryType(AccountType.CASH, WalletEntryType.IN);
        BigDecimal cashOut = walletRepository.sumByAccountTypeAndEntryType(AccountType.CASH, WalletEntryType.OUT);
        BigDecimal bankIn  = walletRepository.sumByAccountTypeAndEntryType(AccountType.BANK, WalletEntryType.IN);
        BigDecimal bankOut = walletRepository.sumByAccountTypeAndEntryType(AccountType.BANK, WalletEntryType.OUT);

        BigDecimal cashBalance = cashIn.subtract(cashOut);
        BigDecimal bankBalance = bankIn.subtract(bankOut);

        List<AdminWalletEntryResponse> recent = walletRepository.findAllByOrderByCreatedAtDesc()
                .stream().limit(50).map(this::toResponse).toList();

        return AdminWalletBalanceResponse.builder()
                .cashBalance(cashBalance)
                .bankBalance(bankBalance)
                .totalBalance(cashBalance.add(bankBalance))
                .recentTransactions(recent)
                .build();
    }

    public List<AdminWalletEntryResponse> listAll() {
        return walletRepository.findAllByOrderByCreatedAtDesc()
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public List<AdminWalletEntryResponse> transfer(TransferRequest req, UUID createdBy) {
        AccountType from = req.getFromAccount();
        AccountType to = from == AccountType.CASH ? AccountType.BANK : AccountType.CASH;
        LocalDateTime now = LocalDateTime.now();
        String desc = req.getDescription() != null && !req.getDescription().isBlank()
                ? req.getDescription()
                : "Transfer " + from + " → " + to;

        AdminWalletEntry outEntry = AdminWalletEntry.builder()
                .id(UUID.randomUUID())
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

    private AdminWalletEntryResponse toResponse(AdminWalletEntry e) {
        return AdminWalletEntryResponse.builder()
                .id(e.getId())
                .accountType(e.getAccountType())
                .entryType(e.getEntryType())
                .amount(e.getAmount())
                .category(e.getCategory())
                .description(e.getDescription())
                .createdAt(e.getCreatedAt())
                .createdBy(e.getCreatedBy())
                .build();
    }
}
