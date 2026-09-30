package com.chitfund.supportservice.service;

import com.chitfund.supportservice.domain.entity.HubCustomRole;
import com.chitfund.supportservice.dto.request.CreateRoleRequest;
import com.chitfund.supportservice.dto.response.HubRoleResponse;
import com.chitfund.supportservice.repository.HubCustomRoleRepository;
import com.chitfund.supportservice.repository.EmployeeRepository;
import com.chitfund.supportservice.repository.HubRefreshSessionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.time.Instant;

@Service
@RequiredArgsConstructor
public class HubRoleService {

    private final HubCustomRoleRepository roleRepository;
    private final EmployeeRepository employeeRepository;
    private final HubRefreshSessionRepository refreshSessionRepository;

    @Transactional(readOnly = true)
    public List<HubRoleResponse> listAll() {
        return roleRepository.findAll().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public HubRoleResponse create(CreateRoleRequest req) {
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
        return toResponse(roleRepository.save(role));
    }

    @Transactional
    public HubRoleResponse update(String id, CreateRoleRequest req) {
        HubPermissionService.validatePermissions(req.getPermissions());
        HubCustomRole role = roleRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Role not found"));
        if (roleRepository.existsByNameIgnoreCaseAndIdNot(req.getName().trim(), id)) {
            throw new IllegalStateException("A role with this name already exists");
        }
        role.setName(req.getName().trim());
        role.setDescription(req.getDescription() != null ? req.getDescription().trim() : null);
        role.getPermissions().clear();
        if (req.getPermissions() != null) {
            role.getPermissions().addAll(req.getPermissions());
        }
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
        return response;
    }

    @Transactional
    public void delete(String id) {
        HubCustomRole role = roleRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Role not found"));
        if (roleRepository.countEmployeesWithRole(id) > 0) {
            throw new IllegalStateException("Cannot delete a role that is assigned to employees");
        }
        roleRepository.delete(role);
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
