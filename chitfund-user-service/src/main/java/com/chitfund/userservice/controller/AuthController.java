package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.LoginRequest;
import com.chitfund.userservice.dto.request.RefreshTokenRequest;
import com.chitfund.userservice.dto.request.RegisterRequest;
import com.chitfund.userservice.dto.response.AuthResponse;
import com.chitfund.userservice.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    /**
     * Public endpoint — used only for MEMBER account creation (admin creates a login for a member).
     * Staff roles (ADMIN, MANAGER, WORKER) must be created through POST /api/users/staff
     * which requires an authenticated ADMIN token. This prevents anonymous privilege escalation.
     */
    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(@Valid @RequestBody RegisterRequest request) {
        Role role = request.getRole();
        if (role != null && role != Role.MEMBER) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Staff accounts must be created by an admin via /api/users/staff");
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(authService.register(request), "Registration successful"));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(ApiResponse.success(authService.login(request), "Login successful"));
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<AuthResponse>> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ResponseEntity.ok(ApiResponse.success(authService.refresh(request)));
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(@Valid @RequestBody RefreshTokenRequest request) {
        authService.logout(request.getRefreshToken());
        return ResponseEntity.ok(ApiResponse.success(null, "Logged out successfully"));
    }
}
