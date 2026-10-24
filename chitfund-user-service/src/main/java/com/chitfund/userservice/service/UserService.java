package com.chitfund.userservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.exception.ResourceNotFoundException;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.UpdateUserProfileRequest;
import com.chitfund.userservice.dto.response.UserResponse;
import com.chitfund.userservice.mapper.UserMapper;
import com.chitfund.userservice.repository.RefreshTokenRepository;
import com.chitfund.userservice.repository.TrustedDeviceRepository;
import com.chitfund.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserService {

    private final UserRepository userRepository;
    private final com.chitfund.userservice.client.AuditClient auditClient;
    private final PlanService planService;
    private final UserMapper userMapper;
    private final RefreshTokenRepository refreshTokenRepository;
    private final TrustedDeviceRepository trustedDeviceRepository;

    public UserResponse getUserById(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        requireSameTenant(user);
        // Managers must not be able to fetch admin accounts by ID
        User caller = callerUser();
        if (caller != null && caller.getRole() == Role.MANAGER && user.getRole() == Role.ADMIN) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Access denied");
        }
        return userMapper.toResponse(user);
    }

    public UserResponse getCurrentUser(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User", username));
        return userMapper.toResponse(user);
    }

    @Transactional
    public UserResponse lockUser(UUID id, User caller) {
        User target = userRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        var before = userAuditState(target);
        requireSameTenant(target);
        // Managers can only lock MEMBER accounts
        if (caller.getRole() == Role.MANAGER && target.getRole() != Role.MEMBER) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Managers can only lock member accounts");
        }
        target.setLocked(true);
        target.setUpdatedBy(caller.getId());
        User saved = userRepository.save(target);
        User actor = callerUser();
        auditClient.log("USER", saved.getId().toString(), "USER_LOCKED",
                caller.getId() != null ? caller.getId().toString() : null,
                actor != null ? actor.getRole().name() : null, before, userAuditState(saved),
                saved.getTenantId() != null ? saved.getTenantId() : "PLATFORM");
        return userMapper.toResponse(saved);
    }

    @Transactional
    public UserResponse unlockUser(UUID id, User caller) {
        User target = userRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        var before = userAuditState(target);
        requireSameTenant(target);
        // Managers can only unlock MEMBER accounts
        if (caller.getRole() == Role.MANAGER && target.getRole() != Role.MEMBER) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Managers can only unlock member accounts");
        }
        target.setLocked(false);
        target.setFailedLoginAttempts(0);
        target.setUpdatedBy(caller.getId());
        User saved = userRepository.save(target);
        User actor = callerUser();
        auditClient.log("USER", saved.getId().toString(), "USER_UNLOCKED",
                caller.getId() != null ? caller.getId().toString() : null,
                actor != null ? actor.getRole().name() : null, before, userAuditState(saved),
                saved.getTenantId() != null ? saved.getTenantId() : "PLATFORM");
        return userMapper.toResponse(saved);
    }

    public boolean isUsernameAvailable(String username, UUID excludeUserId) {
        return userRepository.findByUsername(username)
                .map(existing -> existing.getId().equals(excludeUserId))
                .orElse(true);
    }

    @Transactional
    public UserResponse updateMyProfile(UUID userId, UpdateUserProfileRequest request) {
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        var before = userAuditState(user);

        if (request.getFullName() != null) user.setFullName(request.getFullName());

        if (request.getUsername() != null && !request.getUsername().equals(user.getUsername())) {
            if (userRepository.existsByUsername(request.getUsername())) {
                throw new BusinessException(ErrorCode.USERNAME_TAKEN);
            }
            user.setUsername(request.getUsername());
        }

        if (request.getEmail() != null && !request.getEmail().equals(user.getEmail())) {
            if (request.getEmail().isBlank()) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Email is required", HttpStatus.BAD_REQUEST);
            }
            if (user.getRole() == Role.MEMBER) {
                throw new BusinessException(ErrorCode.FORBIDDEN,
                        "A member recovery email can only be changed through email verification.",
                        HttpStatus.FORBIDDEN);
            }
            if (userRepository.existsByEmail(request.getEmail())) {
                throw new BusinessException(ErrorCode.EMAIL_TAKEN);
            }
            user.setEmail(request.getEmail());
            // A new address must earn its own verification. It must not inherit
            // the trust established for the previous address, and old trusted
            // sessions must not be usable for email-based recovery.
            user.setEmailVerifiedAt(null);
            user.setEmailVerificationRequired(true);
            refreshTokenRepository.revokeAllActiveByUser(user);
            trustedDeviceRepository.deleteByUserId(user.getId());
        }

        user.setUpdatedBy(userId);
        User saved = userRepository.save(user);
        User actor = callerUser();
        auditClient.log("USER", saved.getId().toString(), "USER_PROFILE_UPDATED",
                userId != null ? userId.toString() : null,
                actor != null ? actor.getRole().name() : null, before, userAuditState(saved),
                saved.getTenantId() != null ? saved.getTenantId() : "PLATFORM");
        return userMapper.toResponse(saved);
    }

    /** Called only by verifyPhoneChangeOtp after OTP is validated — not via the profile PATCH endpoint. */
    @Transactional
    public UserResponse updatePhone(UUID userId, String phone, String countryCode) {
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        var before = userAuditState(user);
        String cc = countryCode != null ? countryCode : "+91";
        if (user.getRole() == Role.MEMBER) {
            boolean heldByAnotherMember = userRepository
                    .findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull(phone, cc).stream()
                    .anyMatch(other -> other.getRole() == Role.MEMBER && !other.getId().equals(userId));
            if (heldByAnotherMember) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "This mobile number already belongs to another ChitWise member. Contact your organization if the number was reassigned.",
                        HttpStatus.CONFLICT);
            }
        }
        user.setPhone(phone);
        user.setPhoneCountryCode(cc);
        user.setUpdatedBy(userId);
        User saved = userRepository.save(user);
        User actor = callerUser();
        auditClient.log("USER", saved.getId().toString(), "USER_PHONE_CHANGED",
                userId != null ? userId.toString() : null,
                actor != null ? actor.getRole().name() : null, before, userAuditState(saved),
                saved.getTenantId() != null ? saved.getTenantId() : "PLATFORM");
        return userMapper.toResponse(saved);
    }

    /** Admin/manager updates another user's phone after OTP has been verified on the frontend. */
    @Transactional
    public UserResponse adminUpdatePhone(UUID targetId, User caller, String phone, String countryCode) {
        User target = userRepository.findByIdForUpdate(targetId)
                .orElseThrow(() -> new ResourceNotFoundException("User", targetId));
        var before = userAuditState(target);
        requireSameTenant(target);
        if (target.getRole() == Role.MEMBER) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "An app-enabled member controls their login phone. Create an Account Access ticket if identity support is required.",
                    HttpStatus.FORBIDDEN);
        }
        if (caller.getRole() == Role.MANAGER && target.getRole() != Role.MEMBER) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Managers can only update member phone numbers");
        }
        target.setPhone(phone);
        if (countryCode != null) target.setPhoneCountryCode(countryCode);
        target.setUpdatedBy(caller.getId());
        User saved = userRepository.save(target);
        User actor = callerUser();
        auditClient.log("USER", saved.getId().toString(), "USER_PHONE_CHANGED_BY_ADMIN",
                caller.getId() != null ? caller.getId().toString() : null,
                actor != null ? actor.getRole().name() : null, before, userAuditState(saved),
                saved.getTenantId() != null ? saved.getTenantId() : "PLATFORM");
        return userMapper.toResponse(saved);
    }

    public List<UserResponse> listStaff(boolean includeDeleted) {
        User caller = callerUser();
        List<Role> staffRoles = caller != null && caller.getRole() == Role.MANAGER
                ? List.of(Role.MANAGER, Role.STAFF, Role.AGENT)
                : List.of(Role.ADMIN, Role.MANAGER, Role.STAFF, Role.AGENT);

        String tenantId = requireTenant();
        List<User> users = includeDeleted
                ? userRepository.findByTenantIdAndRoleInAndDeletedAtIsNotNull(tenantId, staffRoles)
                : userRepository.findByTenantIdAndRoleInAndDeletedAtIsNull(tenantId, staffRoles);
        return users.stream().map(userMapper::toResponse).toList();
    }

    @Transactional
    public UserResponse deactivateStaff(UUID id) {
        planService.lockStaffQuota(requireTenant());
        User user = userRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        var before = userAuditState(user);
        requireSameTenant(user);
        if (user.getRole() == Role.MEMBER) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Member accounts are managed through the member panel");
        }
        // Prevent self-deactivation
        User caller = (User) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (caller.getId().equals(id)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "You cannot deactivate your own account");
        }
        user.setEnabled(false);
        user.setUpdatedBy(caller.getId());
        User saved = userRepository.save(user);
        User actor = callerUser();
        auditClient.log("USER", saved.getId().toString(), "STAFF_DEACTIVATED",
                caller.getId() != null ? caller.getId().toString() : null,
                actor != null ? actor.getRole().name() : null, before, userAuditState(saved),
                saved.getTenantId() != null ? saved.getTenantId() : "PLATFORM");
        return userMapper.toResponse(saved);
    }

    @Transactional
    public UserResponse activateStaff(UUID id) {
        planService.lockStaffQuota(requireTenant());
        User user = userRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        var before = userAuditState(user);
        requireSameTenant(user);
        if (user.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION, "Deleted staff accounts cannot be activated");
        }
        if (!user.isEnabled() && (user.getRole() == Role.STAFF || user.getRole() == Role.MANAGER)) {
            planService.checkStaffLimit(user.getTenantId());
        }
        user.setEnabled(true);
        user.setLocked(false);
        user.setFailedLoginAttempts(0);
        user.setUpdatedBy(callerId());
        User saved = userRepository.save(user);
        User actor = callerUser();
        auditClient.log("USER", saved.getId().toString(), "STAFF_ACTIVATED",
                callerId() != null ? callerId().toString() : null,
                actor != null ? actor.getRole().name() : null, before, userAuditState(saved),
                saved.getTenantId() != null ? saved.getTenantId() : "PLATFORM");
        return userMapper.toResponse(saved);
    }

    @Transactional
    public UserResponse changeRole(UUID id, Role newRole) {
        planService.lockStaffQuota(requireTenant());
        if (newRole == null || newRole == Role.MEMBER) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Role must be ADMIN, MANAGER, or STAFF");
        }
        User caller = (User) org.springframework.security.core.context.SecurityContextHolder
                .getContext().getAuthentication().getPrincipal();
        if (caller.getId().equals(id)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "You cannot change your own role");
        }
        User user = userRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        var before = userAuditState(user);
        requireSameTenant(user);
        if (user.getRole() == Role.MEMBER) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Member roles are managed through the member panel");
        }
        if (user.isEnabled() && user.getDeletedAt() == null && user.getRole() == Role.ADMIN
                && (newRole == Role.STAFF || newRole == Role.MANAGER)) {
            planService.checkStaffLimit(user.getTenantId());
        }
        user.setRole(newRole);
        user.setUpdatedBy(caller.getId());
        User saved = userRepository.save(user);
        User actor = callerUser();
        auditClient.log("USER", saved.getId().toString(), "STAFF_ROLE_CHANGED",
                caller.getId() != null ? caller.getId().toString() : null,
                actor != null ? actor.getRole().name() : null, before, userAuditState(saved),
                saved.getTenantId() != null ? saved.getTenantId() : "PLATFORM");
        return userMapper.toResponse(saved);
    }

    @Transactional
    public UserResponse softDeleteStaff(UUID id, UUID deletedBy) {
        planService.lockStaffQuota(requireTenant());
        User user = userRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        var before = userAuditState(user);
        requireSameTenant(user);
        if (user.getRole() == Role.MEMBER) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Member accounts are managed through the member panel");
        }
        User caller = (User) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (caller.getId().equals(id)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "You cannot delete your own account");
        }
        if (user.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Staff account is already deleted");
        }
        user.setDeletedAt(LocalDateTime.now());
        user.setDeletedBy(deletedBy);
        user.setUpdatedBy(deletedBy);
        user.setEnabled(false);
        User saved = userRepository.save(user);
        User actor = callerUser();
        auditClient.log("USER", saved.getId().toString(), "STAFF_DELETED",
                caller.getId() != null ? caller.getId().toString() : null,
                actor != null ? actor.getRole().name() : null, before, userAuditState(saved),
                saved.getTenantId() != null ? saved.getTenantId() : "PLATFORM");
        return userMapper.toResponse(saved);
    }

    private java.util.Map<String, Object> userAuditState(User user) {
        var state = new java.util.LinkedHashMap<String, Object>();
        state.put("role", user.getRole());
        state.put("enabled", user.isEnabled());
        state.put("locked", user.isLocked());
        state.put("deleted", user.getDeletedAt() != null);
        state.put("username", user.getUsername());
        state.put("fullName", user.getFullName());
        state.put("emailVerificationRequired", user.isEmailVerificationRequired());
        // Phone/email changes are identified by action; recovery details, OTPs,
        // passwords and bearer tokens never enter this administrative trail.
        return state;
    }

    private UUID callerId() {
        User caller = callerUser();
        return caller != null ? caller.getId() : null;
    }

    private User callerUser() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof User u) return u;
        return null;
    }

    private String requireTenant() {
        String tenantId = TenantContext.get();
        if (tenantId == null || tenantId.isBlank()) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Organization context is required", HttpStatus.FORBIDDEN);
        }
        return tenantId;
    }

    private void requireSameTenant(User target) {
        String tenantId = requireTenant();
        if (target.getTenantId() == null || !tenantId.equals(target.getTenantId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "User is not in your organization", HttpStatus.FORBIDDEN);
        }
    }
}
