package com.chitfund.userservice.controller;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.dto.request.RecordPaymentRequest;
import com.chitfund.userservice.dto.request.RecordRefundRequest;
import com.chitfund.userservice.dto.request.RecordUpgradeRequest;
import com.chitfund.userservice.dto.response.PaymentResponse;
import com.chitfund.userservice.dto.response.ReceiptResponse;
import com.chitfund.userservice.dto.response.UpgradePreviewResponse;
import com.chitfund.userservice.service.BillingService;
import jakarta.validation.Valid;
import com.chitfund.userservice.domain.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class BillingController {

    private final BillingService billingService;

    // ── Super-admin endpoints ─────────────────────────────────────────────────

    /** Preview proration before recording an upgrade — no DB writes */
    @GetMapping("/api/super-admin/billing/upgrade-preview")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<UpgradePreviewResponse>> upgradePreview(
            @RequestParam String tenantId,
            @RequestParam String newPlan) {
        return ResponseEntity.ok(ApiResponse.success(
                billingService.previewUpgrade(tenantId, newPlan)));
    }

    /** Record a PURCHASE or RENEWAL payment */
    @PostMapping("/api/super-admin/billing/payments")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<PaymentResponse>> recordPayment(
            @Valid @RequestBody RecordPaymentRequest req,
            @AuthenticationPrincipal User principal) {
        PaymentResponse resp = billingService.recordPayment(req, principal.getId().toString());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(resp, "Payment recorded"));
    }

    /** Record an UPGRADE with automatic proration */
    @PostMapping("/api/super-admin/billing/payments/upgrade")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<PaymentResponse>> recordUpgrade(
            @Valid @RequestBody RecordUpgradeRequest req,
            @AuthenticationPrincipal User principal) {
        PaymentResponse resp = billingService.recordUpgrade(req, principal.getId().toString());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(resp, "Upgrade recorded"));
    }

    /** Record a refund against an existing payment */
    @PostMapping("/api/super-admin/billing/payments/{paymentId}/refund")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<PaymentResponse>> recordRefund(
            @PathVariable String paymentId,
            @Valid @RequestBody RecordRefundRequest req,
            @AuthenticationPrincipal User principal) {
        PaymentResponse resp = billingService.recordRefund(paymentId, req, principal.getId().toString());
        return ResponseEntity.ok(ApiResponse.success(resp, "Refund recorded"));
    }

    /** List all payments (optionally filtered by tenant) */
    @GetMapping("/api/super-admin/billing/payments")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<Page<PaymentResponse>>> listPayments(
            @RequestParam(required = false) String tenantId,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "20") int size) {
        PageRequest pr = PageRequest.of(page, size, Sort.by("createdAt").descending());
        Page<PaymentResponse> result = tenantId != null
                ? billingService.listByTenant(tenantId, pr)
                : billingService.listAll(pr);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /** Get single payment with full detail + receipts */
    @GetMapping("/api/super-admin/billing/payments/{paymentId}")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<PaymentResponse>> getPayment(@PathVariable String paymentId) {
        return ResponseEntity.ok(ApiResponse.success(billingService.getPayment(paymentId)));
    }

    /** Get a single receipt by ID */
    @GetMapping("/api/super-admin/billing/receipts/{receiptId}")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<ReceiptResponse>> getReceipt(@PathVariable String receiptId) {
        return ResponseEntity.ok(ApiResponse.success(billingService.getReceipt(receiptId)));
    }

    // ── Admin (tenant) billing endpoints ─────────────────────────────────────

    /** Proration preview for the caller's own tenant (informational) */
    @GetMapping("/api/billing/upgrade-preview")
    @PreAuthorize("hasAnyAuthority('ADMIN','MANAGER')")
    public ResponseEntity<ApiResponse<UpgradePreviewResponse>> myUpgradePreview(
            @RequestParam String newPlan) {
        String tenantId = TenantContext.get();
        if (tenantId == null) throw new BusinessException(ErrorCode.UNAUTHORIZED, "No tenant context");
        return ResponseEntity.ok(ApiResponse.success(billingService.previewUpgrade(tenantId, newPlan)));
    }

    // ── Admin (tenant) read-only billing endpoints ────────────────────────────

    /** Admin views their own payment history */
    @GetMapping("/api/billing/my-payments")
    @PreAuthorize("hasAnyAuthority('ADMIN','MANAGER','STAFF')")
    public ResponseEntity<ApiResponse<List<PaymentResponse>>> myPayments() {
        String tenantId = TenantContext.get();
        if (tenantId == null) throw new BusinessException(ErrorCode.UNAUTHORIZED, "No tenant context");
        return ResponseEntity.ok(ApiResponse.success(billingService.listMyPayments(tenantId)));
    }

    /** Admin fetches a receipt (own tenant only) */
    @GetMapping("/api/billing/receipts/{receiptId}")
    @PreAuthorize("hasAnyAuthority('ADMIN','MANAGER','STAFF')")
    public ResponseEntity<ApiResponse<ReceiptResponse>> myReceipt(@PathVariable String receiptId) {
        String tenantId = TenantContext.get();
        if (tenantId == null) throw new BusinessException(ErrorCode.UNAUTHORIZED, "No tenant context");
        ReceiptResponse r = billingService.getReceipt(receiptId);
        if (!r.getTenantId().equals(tenantId)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "Receipt not found");
        }
        return ResponseEntity.ok(ApiResponse.success(r));
    }
}
