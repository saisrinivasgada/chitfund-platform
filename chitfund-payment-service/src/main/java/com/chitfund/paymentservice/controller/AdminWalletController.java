package com.chitfund.paymentservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.paymentservice.dto.request.AdminWalletEntryRequest;
import com.chitfund.paymentservice.dto.response.AdminWalletBalanceResponse;
import com.chitfund.paymentservice.dto.response.AdminWalletEntryResponse;
import com.chitfund.paymentservice.service.AdminWalletService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/admin/wallet")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminWalletController {

    private final AdminWalletService walletService;

    @GetMapping("/balance")
    public ResponseEntity<ApiResponse<AdminWalletBalanceResponse>> getBalance() {
        return ResponseEntity.ok(ApiResponse.success(walletService.getBalance()));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<AdminWalletEntryResponse>>> listTransactions() {
        return ResponseEntity.ok(ApiResponse.success(walletService.listAll()));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<AdminWalletEntryResponse>> addTransaction(
            @Valid @RequestBody AdminWalletEntryRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(walletService.addEntry(request, adminId)));
    }
}
