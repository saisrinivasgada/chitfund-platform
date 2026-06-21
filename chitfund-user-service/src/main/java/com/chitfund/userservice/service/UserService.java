package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.exception.ResourceNotFoundException;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.UpdateUserProfileRequest;
import com.chitfund.userservice.dto.response.UserResponse;
import com.chitfund.userservice.mapper.UserMapper;
import com.chitfund.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
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
    private final UserMapper userMapper;

    public UserResponse getUserById(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        return userMapper.toResponse(user);
    }

    public UserResponse getCurrentUser(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User", username));
        return userMapper.toResponse(user);
    }

    @Transactional
    public UserResponse lockUser(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        user.setLocked(true);
        return userMapper.toResponse(userRepository.save(user));
    }

    @Transactional
    public UserResponse unlockUser(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        user.setLocked(false);
        user.setFailedLoginAttempts(0);
        return userMapper.toResponse(userRepository.save(user));
    }

    public boolean isUsernameAvailable(String username, UUID excludeUserId) {
        return userRepository.findByUsername(username)
                .map(existing -> existing.getId().equals(excludeUserId))
                .orElse(true);
    }

    @Transactional
    public UserResponse updateMyProfile(UUID userId, UpdateUserProfileRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        if (request.getFullName() != null) user.setFullName(request.getFullName());
        if (request.getPhone() != null) user.setPhone(request.getPhone());

        if (request.getUsername() != null && !request.getUsername().equals(user.getUsername())) {
            if (userRepository.existsByUsername(request.getUsername())) {
                throw new BusinessException(ErrorCode.USERNAME_TAKEN);
            }
            user.setUsername(request.getUsername());
        }

        if (request.getEmail() != null && !request.getEmail().equals(user.getEmail())) {
            if (userRepository.existsByEmail(request.getEmail())) {
                throw new BusinessException(ErrorCode.EMAIL_TAKEN);
            }
            user.setEmail(request.getEmail());
        }

        return userMapper.toResponse(userRepository.save(user));
    }

    public List<UserResponse> listStaff(boolean includeDeleted) {
        List<Role> staffRoles = List.of(Role.ADMIN, Role.MANAGER, Role.WORKER, Role.AGENT);
        List<User> users = includeDeleted
                ? userRepository.findByRoleInAndDeletedAtIsNotNull(staffRoles)
                : userRepository.findByRoleInAndDeletedAtIsNull(staffRoles);
        return users.stream().map(userMapper::toResponse).toList();
    }

    @Transactional
    public UserResponse deactivateStaff(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        if (user.getRole() == Role.MEMBER) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Member accounts are managed through the member panel");
        }
        // Prevent self-deactivation
        User caller = (User) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (caller.getId().equals(id)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "You cannot deactivate your own account");
        }
        user.setEnabled(false);
        return userMapper.toResponse(userRepository.save(user));
    }

    @Transactional
    public UserResponse activateStaff(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        user.setEnabled(true);
        user.setLocked(false);
        user.setFailedLoginAttempts(0);
        return userMapper.toResponse(userRepository.save(user));
    }

    @Transactional
    public UserResponse changeRole(UUID id, Role newRole) {
        if (newRole == null || newRole == Role.MEMBER) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Role must be ADMIN, MANAGER, or WORKER");
        }
        User caller = (User) org.springframework.security.core.context.SecurityContextHolder
                .getContext().getAuthentication().getPrincipal();
        if (caller.getId().equals(id)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "You cannot change your own role");
        }
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        if (user.getRole() == Role.MEMBER) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Member roles are managed through the member panel");
        }
        user.setRole(newRole);
        return userMapper.toResponse(userRepository.save(user));
    }

    @Transactional
    public UserResponse softDeleteStaff(UUID id, UUID deletedBy) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
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
        user.setEnabled(false);
        return userMapper.toResponse(userRepository.save(user));
    }
}
