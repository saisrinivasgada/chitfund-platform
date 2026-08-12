package com.chitfund.notificationservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.notificationservice.service.PushTokenService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/notifications/push-token")
@RequiredArgsConstructor
public class PushTokenController {

    private final PushTokenService pushTokenService;

    private UUID currentUserId() {
        return (UUID) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    /**
     * POST /notifications/push-token
     * Body: { "token": "ExponentPushToken[...]", "platform": "android" }
     * Called on app launch after the user is authenticated.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<Void>> register(@RequestBody Map<String, String> body) {
        String token    = body.get("token");
        String platform = body.getOrDefault("platform", "unknown");
        if (token == null || token.isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("VALIDATION_ERROR", "token is required"));
        }
        pushTokenService.register(currentUserId(), token, platform);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /**
     * DELETE /notifications/push-token
     * Body: { "token": "ExponentPushToken[...]" }
     * Called on logout.
     */
    @DeleteMapping
    public ResponseEntity<ApiResponse<Void>> unregister(@RequestBody Map<String, String> body) {
        String token = body.get("token");
        if (token != null && !token.isBlank()) {
            pushTokenService.unregister(token);
        }
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
