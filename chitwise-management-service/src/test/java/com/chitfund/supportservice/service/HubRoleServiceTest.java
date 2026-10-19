package com.chitfund.supportservice.service;

import com.chitfund.supportservice.domain.entity.Employee;
import com.chitfund.supportservice.domain.entity.HubCustomRole;
import com.chitfund.supportservice.dto.request.CreateRoleRequest;
import com.chitfund.supportservice.repository.EmployeeRepository;
import com.chitfund.supportservice.repository.HubCustomRoleRepository;
import com.chitfund.supportservice.repository.HubRefreshSessionRepository;
import com.chitfund.supportservice.client.AuditClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HubRoleServiceTest {
    @Mock HubCustomRoleRepository roleRepository;
    @Mock EmployeeRepository employeeRepository;
    @Mock HubRefreshSessionRepository refreshSessionRepository;
    @Mock AuditClient auditClient;
    @InjectMocks HubRoleService service;

    @Test
    void editingRoleInvalidatesEveryAssignedEmployeesSessions() {
        HubCustomRole role = HubCustomRole.builder().id("role-1").name("Payments")
                .permissions(new HashSet<>(Set.of("TICKET_VIEW_PAYMENT"))).build();
        Employee employee = Employee.builder().id("employee-1").role("SUPPORT_AGENT")
                .customRoleId("role-1").authVersion(2).active(true).build();
        CreateRoleRequest request = new CreateRoleRequest();
        request.setName("Account support");
        request.setPermissions(Set.of("TICKET_VIEW_ACCOUNT"));
        request.setReason("Move this team to the account support queue");

        when(roleRepository.findByIdForUpdate("role-1")).thenReturn(Optional.of(role));
        when(roleRepository.save(role)).thenReturn(role);
        when(employeeRepository.findByCustomRoleId("role-1")).thenReturn(List.of(employee));

        service.update("role-1", request, "owner-1");

        assertThat(employee.getAuthVersion()).isEqualTo(3);
        verify(refreshSessionRepository).revokeAllForEmployee(
                org.mockito.ArgumentMatchers.eq("employee-1"), any(Instant.class));
        verify(employeeRepository).saveAll(List.of(employee));
        verify(auditClient).logEntity(
                org.mockito.ArgumentMatchers.eq("HUB_ROLE"),
                org.mockito.ArgumentMatchers.eq("role-1"),
                org.mockito.ArgumentMatchers.eq("UPDATED"),
                org.mockito.ArgumentMatchers.eq("owner-1"),
                org.mockito.ArgumentMatchers.eq("SUPER_ADMIN"),
                any(), any(), any(), org.mockito.ArgumentMatchers.eq("PLATFORM"),
                org.mockito.ArgumentMatchers.eq("Move this team to the account support queue"));
    }

    @Test
    void repeatingIdenticalRoleUpdateDoesNotRevokeSessionsOrDuplicateAudit() {
        HubCustomRole role = HubCustomRole.builder().id("role-1").name("Payments")
                .permissions(new HashSet<>(Set.of("TICKET_VIEW_PAYMENT"))).build();
        CreateRoleRequest request = new CreateRoleRequest();
        request.setName("Payments");
        request.setPermissions(Set.of("TICKET_VIEW_PAYMENT"));
        request.setReason("Retry the already applied role configuration");
        when(roleRepository.findByIdForUpdate("role-1")).thenReturn(Optional.of(role));

        service.update("role-1", request, "owner-1");

        verify(roleRepository, never()).save(any());
        verify(employeeRepository, never()).findByCustomRoleId(any());
        verify(refreshSessionRepository, never()).revokeAllForEmployee(any(), any());
        verify(auditClient, never()).logEntity(any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any());
    }

    @Test
    void roleChangeWithoutReasonIsRejectedBeforeLookupOrMutation() {
        CreateRoleRequest request = new CreateRoleRequest();
        request.setName("Payments");
        request.setPermissions(Set.of("TICKET_VIEW_PAYMENT"));

        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> service.update("role-1", request, "owner-1"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Reason is required");

        verifyNoInteractions(roleRepository, employeeRepository, refreshSessionRepository, auditClient);
    }
}
