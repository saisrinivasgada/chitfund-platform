package com.chitfund.auditservice.controller;

import com.chitfund.auditservice.dto.AuditLogRequest;
import com.chitfund.auditservice.service.AuditService;
import com.chitfund.common.dto.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Called by all other services to record audit events.
 *
 * Business services persist audit events to their transactional outbox. Delivery to this
 * endpoint or the audit queue may happen after the business response, but failed delivery
 * remains visible and retryable instead of becoming a best-effort log message.
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
            @Valid @Size(max = 500) @RequestBody List<@Valid AuditLogRequest> requests) {

        validateKey(key);
        auditService.recordBatch(requests);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    private void validateKey(String provided) {
        byte[] expected = internalKey.getBytes(StandardCharsets.UTF_8);
        byte[] actual = provided.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expected, actual)) {
            throw new AccessDeniedException("Invalid internal key");
        }
    }
}
