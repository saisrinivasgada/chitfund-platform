package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.*;
import com.chitfund.userservice.dto.response.AuthResponse;
import com.chitfund.userservice.service.AuthService;
import com.chitfund.userservice.service.BrowserAccountSessions;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth/accounts/{accountId}")
@RequiredArgsConstructor
public class BrowserAccountSessionController {
    private final AuthService auth;
    private final BrowserAccountSessions sessions;

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<AuthResponse>> refresh(@PathVariable String accountId,
            @RequestHeader("X-Client-Source") String source, HttpServletRequest request, HttpServletResponse response) {
        requireWeb(source);
        String token = sessions.read(request, accountId);
        if (token == null || token.isBlank()) throw new BusinessException(ErrorCode.UNAUTHORIZED, "Sign in to this account again");
        AuthResponse refreshed = auth.refreshByToken(token);
        if (!accountId.equals(BrowserAccountSessions.id(refreshed))) {
            // Never return another account's access token, even for a misplaced cookie.
            auth.logout(refreshed.getRefreshToken());
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "Account session does not match");
        }
        sessions.write(response, refreshed);
        refreshed.setRefreshToken(null); // Browser persistence is HttpOnly only.
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(refreshed));
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(@PathVariable String accountId,
            @RequestHeader("X-Client-Source") String source, HttpServletRequest request, HttpServletResponse response) {
        requireWeb(source);
        String token = sessions.read(request, accountId);
        if (token != null && !token.isBlank()) auth.logout(token);
        sessions.clear(response, accountId);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(null));
    }

    private void requireWeb(String source) {
        if (!"WEB".equals(source)) throw new BusinessException(ErrorCode.FORBIDDEN, "Browser session is required", HttpStatus.FORBIDDEN);
    }
}
