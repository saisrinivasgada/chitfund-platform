package com.chitfund.paymentservice.controller;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.dto.ApiResponse;
import com.chitfund.paymentservice.domain.enums.AccountType;
import com.chitfund.paymentservice.domain.enums.WalletEntryType;
import com.chitfund.paymentservice.dto.request.AdminWalletEntryRequest;
import com.chitfund.paymentservice.dto.request.RedeemCreditRequest;
import com.chitfund.paymentservice.dto.request.TransferRequest;
import com.chitfund.paymentservice.dto.response.AdminWalletBalanceResponse;
import com.chitfund.paymentservice.dto.response.AdminWalletEntryResponse;
import com.chitfund.paymentservice.service.AdminWalletService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/admin/wallet")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminWalletController {

    private final AdminWalletService walletService;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    @GetMapping("/balance")
    public ResponseEntity<ApiResponse<AdminWalletBalanceResponse>> getBalance() {
        return ResponseEntity.ok(ApiResponse.success(walletService.getBalance(TenantContext.get())));
    }

    @GetMapping
    public ResponseEntity<?> listTransactions(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false, defaultValue = "50") int size) {
        String tenantId = TenantContext.get();
        if (page != null) {
            return ResponseEntity.ok(ApiResponse.success(walletService.listPaged(page, size, tenantId)));
        }
        return ResponseEntity.ok(ApiResponse.success(walletService.listAll(tenantId)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<AdminWalletEntryResponse>> addTransaction(
            @Valid @RequestBody AdminWalletEntryRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(walletService.addEntry(request, adminId, TenantContext.get())));
    }

    @PostMapping("/transfer")
    public ResponseEntity<ApiResponse<List<AdminWalletEntryResponse>>> transfer(
            @Valid @RequestBody TransferRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(walletService.transfer(request, adminId, TenantContext.get())));
    }

    @PostMapping("/credit-withdrawal")
    public ResponseEntity<ApiResponse<AdminWalletEntryResponse>> redeemCredit(
            @Valid @RequestBody RedeemCreditRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(walletService.redeemCredit(request, adminId, TenantContext.get())));
    }

    @PostMapping("/internal/payout-debit")
    @PreAuthorize("true")
    public ResponseEntity<Void> recordPayoutDebit(
            @RequestBody Map<String, Object> body,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        String tenantId = (String) body.get("tenantId");
        if (tenantId == null || tenantId.isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }
        AdminWalletEntryRequest req = new AdminWalletEntryRequest();
        req.setAccountType(AccountType.valueOf((String) body.get("accountType")));
        req.setEntryType(WalletEntryType.OUT);
        req.setAmount(new BigDecimal(body.get("amount").toString()));
        req.setCategory("PAYOUT_DISBURSEMENT");
        req.setDescription((String) body.getOrDefault("description", "Payout disbursement"));
        walletService.addEntry(req, UUID.fromString("00000000-0000-0000-0000-000000000001"), tenantId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/internal/payout-void-reversal")
    @PreAuthorize("true")
    public ResponseEntity<Void> recordPayoutVoidReversal(
            @RequestBody Map<String, Object> body,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        String tenantId = (String) body.get("tenantId");
        if (tenantId == null || tenantId.isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }
        AdminWalletEntryRequest req = new AdminWalletEntryRequest();
        req.setAccountType(AccountType.valueOf((String) body.get("accountType")));
        req.setEntryType(WalletEntryType.IN);
        req.setAmount(new BigDecimal(body.get("amount").toString()));
        req.setCategory("PAYOUT_VOID_REVERSAL");
        req.setDescription((String) body.getOrDefault("description", "Payout voided — disbursed amount reversed"));
        walletService.addEntry(req, UUID.fromString("00000000-0000-0000-0000-000000000001"), tenantId);
        return ResponseEntity.ok().build();
    }
}
