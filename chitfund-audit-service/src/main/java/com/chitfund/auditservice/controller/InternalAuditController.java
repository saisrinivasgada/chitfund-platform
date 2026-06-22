package com.chitfund.auditservice.controller;

import com.chitfund.auditservice.dto.AuditLogRequest;
import com.chitfund.auditservice.service.AuditService;
import com.chitfund.common.dto.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Called by all other services to record audit events.
 *
 * WHY fire-and-forget from callers?
 * If audit-service is temporarily down, the primary transaction (e.g. payment) should
 * still succeed. In practice callers POST asynchronously or via Kafka so the audit write
 * never blocks the user-facing response. For now callers do a best-effort HTTP POST
 * and log a warning if it fails — the business operation is not rolled back.
 *
 * WHY batch endpoint?
 * When payment-service opens a month (creates records for all 20 members), it generates
 * 20+ audit events. Sending them as one request is far cheaper than 20 round trips.
 */
@RestController
@RequestMapping("/internal/audit")
@RequiredArgsConstructor
public class InternalAuditController {

    private final AuditService auditService;

    @Value("${audit.internal-key}")
    private String internalKey;

    @PostMapping
    public ResponseEntity<ApiResponse<Void>> record(
            @RequestHeader("X-Internal-Key") String key,
            @Valid @RequestBody AuditLogRequest request) {

        validateKey(key);
        auditService.record(request);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PostMapping("/batch")
    public ResponseEntity<ApiResponse<Void>> recordBatch(
            @RequestHeader("X-Internal-Key") String key,
            @RequestBody List<@Valid AuditLogRequest> requests) {

        validateKey(key);
        auditService.recordBatch(requests);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    private void validateKey(String provided) {
        if (!internalKey.equals(provided)) {
            throw new AccessDeniedException("Invalid internal key");
        }
    }
}
