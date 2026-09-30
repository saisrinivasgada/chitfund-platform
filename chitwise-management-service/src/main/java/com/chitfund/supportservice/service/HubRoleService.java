package com.chitfund.supportservice.service;

import com.chitfund.supportservice.domain.entity.HubCustomRole;
import com.chitfund.supportservice.dto.request.CreateRoleRequest;
import com.chitfund.supportservice.dto.response.HubRoleResponse;
import com.chitfund.supportservice.repository.HubCustomRoleRepository;
import com.chitfund.supportservice.repository.EmployeeRepository;
import com.chitfund.supportservice.repository.HubRefreshSessionRepository;
import com.chitfund.supportservice.client.AuditClient;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.Objects;
import java.util.UUID;
import java.time.Instant;

@Service
@RequiredArgsConstructor
public class HubRoleService {

    private final HubCustomRoleRepository roleRepository;
    private final EmployeeRepository employeeRepository;
    private final HubRefreshSessionRepository refreshSessionRepository;
    private final AuditClient auditClient;

    private static final String PLATFORM_AUDIT_TENANT = "PLATFORM";

    @Transactional(readOnly = true)
    public List<HubRoleResponse> listAll() {
        return roleRepository.findAll().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public HubRoleResponse create(CreateRoleRequest req, String actorId) {
        HubPermissionService.validatePermissions(req.getPermissions());
        if (roleRepository.existsByNameIgnoreCase(req.getName().trim())) {
            throw new IllegalStateException("A role with this name already exists");
        }
        HubCustomRole role = HubCustomRole.builder()
                .id(UUID.randomUUID().toString())
                .name(req.getName().trim())
                .description(req.getDescription() != null ? req.getDescription().trim() : null)
                .permissions(req.getPermissions() != null ? req.getPermissions() : Set.of())
                .build();
        HubCustomRole saved = roleRepository.save(role);
        auditClient.logEntity("HUB_ROLE", saved.getId(), "CREATED", actorId,
                "SUPER_ADMIN", null,
                java.util.Map.of("name", saved.getName(),
                        "permissions", Set.copyOf(saved.getPermissions())),
                null, PLATFORM_AUDIT_TENANT, null);
        return toResponse(saved);
    }

    @Transactional
    public HubRoleResponse update(String id, CreateRoleRequest req, String actorId) {
        HubPermissionService.validatePermissions(req.getPermissions());
        HubCustomRole role = roleRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Role not found"));
        if (roleRepository.existsByNameIgnoreCaseAndIdNot(req.getName().trim(), id)) {
            throw new IllegalStateException("A role with this name already exists");
        }
        String requestedDescription = req.getDescription() != null
                ? req.getDescription().trim() : null;
        Set<String> requestedPermissions = req.getPermissions() != null
                ? req.getPermissions() : Set.of();
        if (role.getName().equals(req.getName().trim())
                && Objects.equals(role.getDescription(), requestedDescription)
                && Set.copyOf(role.getPermissions()).equals(Set.copyOf(requestedPermissions))) {
            return toResponse(role);
        }
        String previousName = role.getName();
        Set<String> previousPermissions = Set.copyOf(role.getPermissions());
        role.setName(req.getName().trim());
        role.setDescription(requestedDescription);
        role.getPermissions().clear();
        role.getPermissions().addAll(requestedPermissions);
        HubRoleResponse response = toResponse(roleRepository.save(role));
        // A role edit may remove platform-console or ticket access. Invalidate
        // every assigned employee's existing access and refresh credentials.
        var assigned = employeeRepository.findByCustomRoleId(id);
        Instant now = Instant.now();
        for (var employee : assigned) {
            employee.setAuthVersion(employee.getAuthVersion() + 1);
            refreshSessionRepository.revokeAllForEmployee(employee.getId(), now);
        }
        employeeRepository.saveAll(assigned);
        auditClient.logEntity("HUB_ROLE", id, "UPDATED", actorId, "SUPER_ADMIN",
                java.util.Map.of("name", previousName,
                        "permissions", previousPermissions),
                java.util.Map.of("name", role.getName(),
                        "permissions", Set.copyOf(role.getPermissions())),
                java.util.Map.of("affectedEmployees", assigned.size(),
                        "sessionsRevoked", !assigned.isEmpty()),
                PLATFORM_AUDIT_TENANT, null);
        return response;
    }

    @Transactional
    public void delete(String id, String actorId) {
        HubCustomRole role = roleRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Role not found"));
        if (roleRepository.countEmployeesWithRole(id) > 0) {
            throw new IllegalStateException("Cannot delete a role that is assigned to employees");
        }
        roleRepository.delete(role);
        auditClient.logEntity("HUB_ROLE", id, "DELETED", actorId, "SUPER_ADMIN",
                java.util.Map.of("name", role.getName(),
                        "permissions", Set.copyOf(role.getPermissions())),
                null, null, PLATFORM_AUDIT_TENANT, null);
    }

    private HubRoleResponse toResponse(HubCustomRole role) {
        return HubRoleResponse.builder()
                .id(role.getId())
                .name(role.getName())
                .description(role.getDescription())
                .permissions(role.getPermissions())
                .employeeCount(roleRepository.countEmployeesWithRole(role.getId()))
                .createdAt(role.getCreatedAt())
                .updatedAt(role.getUpdatedAt())
                .build();
    }
}
