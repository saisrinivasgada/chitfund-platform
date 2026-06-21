package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.ChangePasswordRequest;
import com.chitfund.userservice.dto.request.RegisterRequest;
import com.chitfund.userservice.dto.request.UpdateUserProfileRequest;
import com.chitfund.userservice.dto.response.AuthResponse;
import com.chitfund.userservice.dto.response.ResetPasswordResponse;
import com.chitfund.userservice.dto.response.UserResponse;
import com.chitfund.userservice.service.AuthService;
import com.chitfund.userservice.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * WHY @PreAuthorize instead of .requestMatchers() in SecurityConfig?
 * - SecurityConfig is good for coarse-grained rules (all of /api/users/** needs auth)
 * - @PreAuthorize is better for method-level rules (this specific method needs ADMIN)
 * - Mixing both is normal: SecurityConfig as the gate, @PreAuthorize as the lock
 * - SpEL expressions: hasRole('ADMIN'), hasAnyRole('ADMIN','MANAGER'),
 *   #userId == authentication.principal.id (ownership checks)
 */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final AuthService authService;

    // Any authenticated user can fetch their own profile
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> getCurrentUser(Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(
                userService.getCurrentUser(authentication.getName())));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<UserResponse>> getUserById(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(userService.getUserById(id)));
    }

    @PutMapping("/{id}/lock")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<ApiResponse<UserResponse>> lockUser(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(userService.lockUser(id), "User account locked"));
    }

    @PutMapping("/{id}/unlock")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<ApiResponse<UserResponse>> unlockUser(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(userService.unlockUser(id), "User account unlocked"));
    }

    /**
     * Admin generates a new temp password for a member who forgot theirs.
     * Returns the plaintext password — shown to admin once, never stored again.
     */
    @PostMapping("/{id}/reset-password")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<ApiResponse<ResetPasswordResponse>> resetPassword(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(authService.resetPassword(id), "Temporary password generated"));
    }

    /**
     * Member changes their own password. Clears the mustChangePassword flag.
     * Requires the current (temp) password — prevents unauthorized changes.
     */
    @PostMapping("/me/change-password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @Valid @RequestBody ChangePasswordRequest request,
            Authentication auth) {
        User user = (User) auth.getPrincipal();
        authService.changePassword(user.getId(), request);
        return ResponseEntity.ok(ApiResponse.success(null, "Password changed successfully"));
    }

    /**
     * Real-time username availability check — used for the Instagram-style indicator
     * while the user types. Excludes the caller's own current username so they can
     * "re-submit" their current name without it flagging as taken.
     */
    @GetMapping("/check-username")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> checkUsername(
            @RequestParam String username,
            Authentication auth) {
        User currentUser = (User) auth.getPrincipal();
        boolean available = userService.isUsernameAvailable(username, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(Map.of("available", available)));
    }

    /**
     * Any authenticated user can update their own username and/or email.
     * The frontend calls this for both admins (MyAccountPage) and members (MemberPortalPage).
     */
    @PatchMapping("/me/profile")
    public ResponseEntity<ApiResponse<UserResponse>> updateMyProfile(
            @Valid @RequestBody UpdateUserProfileRequest request,
            Authentication auth) {
        User user = (User) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(userService.updateMyProfile(user.getId(), request)));
    }

    // ── Staff management (ADMIN / MANAGER / WORKER accounts) ─────────────────

    /**
     * Admin lists staff accounts. Pass ?deleted=true to see soft-deleted records.
     */
    @GetMapping("/staff")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<List<UserResponse>>> listStaff(
            @RequestParam(defaultValue = "false") boolean deleted) {
        return ResponseEntity.ok(ApiResponse.success(userService.listStaff(deleted)));
    }

    /**
     * ADMIN can create ADMIN, MANAGER, or WORKER accounts.
     * MANAGER can only create WORKER accounts.
     */
    @PostMapping("/staff")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<AuthResponse>> createStaff(
            @Valid @RequestBody RegisterRequest request,
            Authentication authentication) {
        if (request.getRole() == null || request.getRole() == Role.MEMBER) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Role must be ADMIN, MANAGER, or WORKER for staff creation");
        }
        boolean isManager = authentication.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("MANAGER"));
        if (isManager && request.getRole() != Role.WORKER) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Managers can only create Worker accounts");
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(authService.register(request), "Staff account created"));
    }

    /**
     * Admin deactivates a staff account (soft disable — does not delete).
     */
    @PutMapping("/staff/{id}/deactivate")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<ApiResponse<UserResponse>> deactivateStaff(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(userService.deactivateStaff(id), "Staff account deactivated"));
    }

    /**
     * Admin reactivates a previously deactivated staff account.
     */
    @PutMapping("/staff/{id}/activate")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<ApiResponse<UserResponse>> activateStaff(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(userService.activateStaff(id), "Staff account activated"));
    }

    /**
     * Admin changes the role of a staff account (ADMIN/MANAGER/WORKER only).
     * Cannot change your own role or a MEMBER's role.
     */
    @PatchMapping("/staff/{id}/role")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<ApiResponse<UserResponse>> changeRole(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body) {
        Role newRole = Role.valueOf(body.get("role"));
        return ResponseEntity.ok(ApiResponse.success(userService.changeRole(id, newRole), "Role updated"));
    }

    /**
     * Admin soft-deletes a staff account. Record is kept in DB with deletedAt/deletedBy.
     */
    @DeleteMapping("/staff/{id}")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<ApiResponse<UserResponse>> deleteStaff(
            @PathVariable UUID id,
            Authentication auth) {
        User admin = (User) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(
                userService.softDeleteStaff(id, admin.getId()), "Staff account deleted"));
    }
}
