package com.chitfund.userservice.controller;

import com.chitfund.common.offline.OfflineReconciliationRequest;
import com.chitfund.userservice.repository.UserRepository;
import com.chitfund.userservice.service.OfflineAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/internal/offline-access")
@RequiredArgsConstructor
public class InternalOfflineAccessController {
    private final UserRepository users;
    private final OfflineAccessService offlineAccess;

    @Value("${app.internal-key}")
    private String internalKey;

    @PostMapping("/verify-recorded-action")
    public ResponseEntity<Map<String, String>> verifyRecordedAction(
            @RequestHeader("X-Internal-Key") String key,
            @RequestBody OfflineReconciliationRequest request) {
        if (!internalKey.equals(key)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of());
        UUID actorId;
        try {
            actorId = UUID.fromString(request.actorId());
        } catch (IllegalArgumentException | NullPointerException invalid) {
            return ResponseEntity.badRequest().body(Map.of());
        }
        var actor = users.findById(actorId).orElse(null);
        if (actor == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of());
        var grant = offlineAccess.authorizeRecordedAction(actor, request);
        return ResponseEntity.ok(Map.of("grantId", grant.id()));
    }
}
