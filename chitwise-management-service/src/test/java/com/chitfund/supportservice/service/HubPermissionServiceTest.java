package com.chitfund.supportservice.service;

import com.chitfund.supportservice.domain.entity.Employee;
import com.chitfund.supportservice.domain.entity.HubCustomRole;
import com.chitfund.supportservice.domain.entity.SupportTicket;
import com.chitfund.supportservice.domain.enums.TicketType;
import com.chitfund.supportservice.domain.enums.TicketStatus;
import com.chitfund.supportservice.repository.EmployeeRepository;
import com.chitfund.supportservice.repository.HubCustomRoleRepository;
import com.chitfund.supportservice.repository.SupportTicketRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HubPermissionServiceTest {
    @Mock EmployeeRepository employeeRepository;
    @Mock HubCustomRoleRepository roleRepository;
    @Mock SupportTicketRepository ticketRepository;
    @InjectMocks HubPermissionService service;

    @Test
    void customRoleOnlySeesExplicitTicketCategories() {
        when(employeeRepository.findById("agent-1")).thenReturn(Optional.of(agent("role-1")));
        when(roleRepository.findById("role-1")).thenReturn(Optional.of(HubCustomRole.builder()
                .id("role-1").permissions(Set.of("TICKET_VIEW_PAYMENT")).build()));

        assertThat(service.visibleTicketTypes("agent-1")).containsExactly(TicketType.PAYMENT);
        assertThatThrownBy(() -> service.requireTicketType("agent-1", TicketType.ACCOUNT))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void supportAgentWithoutCustomRoleIsDeniedByDefault() {
        when(employeeRepository.findById("agent-1")).thenReturn(Optional.of(agent(null)));

        assertThat(service.visibleTicketTypes("agent-1")).isEmpty();
        assertThatThrownBy(() -> service.requireTicketType("agent-1", TicketType.ACCOUNT))
                .isInstanceOf(SecurityException.class);
        assertThatThrownBy(() -> service.requireAnyTicketAccess("agent-1"))
                .isInstanceOf(SecurityException.class)
                .hasMessageContaining("No Hub ticket categories");
    }

    @Test
    void inactiveEmployeeCannotUseRolePermissions() {
        Employee employee = agent("role-1");
        employee.setActive(false);
        when(employeeRepository.findById("agent-1")).thenReturn(Optional.of(employee));

        assertThatThrownBy(() -> service.visibleTicketTypes("agent-1"))
                .isInstanceOf(SecurityException.class)
                .hasMessageContaining("inactive");
        assertThatThrownBy(() -> service.requirePermission("agent-1", "TICKET_ASSIGN_ANY"))
                .isInstanceOf(SecurityException.class)
                .hasMessageContaining("inactive");
    }

    @Test
    void superAdminRetainsAllTicketCategoriesWithoutCustomRole() {
        Employee owner = Employee.builder().id("owner-1").role("SUPER_ADMIN")
                .active(true).build();
        when(employeeRepository.findById("owner-1")).thenReturn(Optional.of(owner));

        assertThat(service.visibleTicketTypes("owner-1"))
                .containsExactlyInAnyOrder(TicketType.values());
    }

    @Test
    void directTicketLookupUsesTheSameCategoryPolicy() {
        when(employeeRepository.findById("agent-1")).thenReturn(Optional.of(agent("role-1")));
        when(roleRepository.findById("role-1")).thenReturn(Optional.of(HubCustomRole.builder()
                .id("role-1").permissions(Set.of("TICKET_VIEW_PAYMENT")).build()));
        when(ticketRepository.findById("ticket-1")).thenReturn(Optional.of(SupportTicket.builder()
                .id("ticket-1").type(TicketType.ACCOUNT).build()));

        assertThatThrownBy(() -> service.requireTicket("agent-1", "ticket-1"))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void rejectsUnknownPermissionNames() {
        assertThatThrownBy(() -> HubPermissionService.validatePermissions(Set.of("SUPER_ADMIN")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("SUPER_ADMIN");
    }

    @Test
    void reopeningResolvedTicketRequiresExplicitPermission() {
        when(employeeRepository.findById("agent-1")).thenReturn(Optional.of(agent("role-1")));
        when(roleRepository.findById("role-1")).thenReturn(Optional.of(HubCustomRole.builder()
                .id("role-1").permissions(Set.of("TICKET_VIEW_PAYMENT")).build()));
        when(ticketRepository.findById("ticket-1")).thenReturn(Optional.of(SupportTicket.builder()
                .id("ticket-1").type(TicketType.PAYMENT).status(TicketStatus.RESOLVED).build()));

        assertThatThrownBy(() -> service.requireStatusChange(
                "agent-1", "ticket-1", TicketStatus.IN_PROGRESS))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void platformConsoleAccessReflectsTheEmployeesEffectivePermission() {
        when(employeeRepository.findById("agent-1")).thenReturn(Optional.of(agent("role-1")));
        when(roleRepository.findById("role-1")).thenReturn(Optional.of(HubCustomRole.builder()
                .id("role-1").permissions(Set.of("PLATFORM_CONSOLE_ACCESS")).build()));

        assertThat(service.hasPermission("agent-1", "PLATFORM_CONSOLE_ACCESS")).isTrue();
    }

    @Test
    void inactiveOrUnassignedEmployeeDoesNotHavePlatformConsoleAccess() {
        Employee inactive = agent("role-1");
        inactive.setActive(false);
        when(employeeRepository.findById("inactive-agent")).thenReturn(Optional.of(inactive));
        when(employeeRepository.findById("agent-1")).thenReturn(Optional.of(agent(null)));
        when(employeeRepository.findById("missing-agent")).thenReturn(Optional.empty());

        assertThat(service.hasPermission("inactive-agent", "PLATFORM_CONSOLE_ACCESS")).isFalse();
        assertThat(service.hasPermission("agent-1", "PLATFORM_CONSOLE_ACCESS")).isFalse();
        assertThat(service.hasPermission("missing-agent", "PLATFORM_CONSOLE_ACCESS")).isFalse();
    }

    private Employee agent(String customRoleId) {
        return Employee.builder().id("agent-1").role("SUPPORT_AGENT")
                .customRoleId(customRoleId).active(true).build();
    }
}
