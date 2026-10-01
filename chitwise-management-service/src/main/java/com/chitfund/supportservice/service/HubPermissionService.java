package com.chitfund.supportservice.service;

import com.chitfund.supportservice.domain.enums.TicketType;
import com.chitfund.supportservice.domain.enums.TicketStatus;
import com.chitfund.supportservice.repository.EmployeeRepository;
import com.chitfund.supportservice.repository.HubCustomRoleRepository;
import com.chitfund.supportservice.repository.SupportTicketRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/** Database-authoritative authorization for Hub custom roles. */
@Service
@RequiredArgsConstructor
public class HubPermissionService {

    public static final Set<String> ALLOWED_PERMISSIONS = Set.of(
            "TICKET_VIEW_BILLING", "TICKET_VIEW_PAYMENT", "TICKET_VIEW_PAYOUT",
            "TICKET_VIEW_CHIT", "TICKET_VIEW_DRAW", "TICKET_VIEW_ACCOUNT",
            "TICKET_VIEW_MEMBER_MGMT", "TICKET_VIEW_TECHNICAL",
            "TICKET_VIEW_FEATURE_REQUEST", "TICKET_VIEW_INQUIRY",
            "TICKET_VIEW_GENERAL", "TICKET_REOPEN", "TICKET_ASSIGN_ANY",
            "PROXY_ACCESS", "PLATFORM_CONSOLE_ACCESS");

    private final EmployeeRepository employeeRepository;
    private final HubCustomRoleRepository roleRepository;
    private final SupportTicketRepository ticketRepository;

    public Set<TicketType> visibleTicketTypes(String employeeId) {
        var employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new SecurityException("Hub employee not found"));
        if (!employee.isActive()) {
            throw new SecurityException("Hub employee is inactive");
        }
        if ("SUPER_ADMIN".equals(employee.getRole())) {
            return EnumSet.allOf(TicketType.class);
        }
        // Missing role data must never expand access. Support agents receive only
        // the ticket categories explicitly granted by an active custom role.
        if (employee.getCustomRoleId() == null) {
            return Collections.emptySet();
        }
        Set<String> permissions = permissions(employee.getCustomRoleId());
        EnumSet<TicketType> allowed = EnumSet.noneOf(TicketType.class);
        for (TicketType type : TicketType.values()) {
            if (permissions.contains("TICKET_VIEW_" + type.name())) allowed.add(type);
        }
        return Collections.unmodifiableSet(allowed);
    }

    public void requireTicketType(String employeeId, TicketType type) {
        if (type == null || !visibleTicketTypes(employeeId).contains(type)) {
            throw new SecurityException("You do not have access to this ticket category");
        }
    }

    public void requireAnyTicketAccess(String employeeId) {
        if (visibleTicketTypes(employeeId).isEmpty()) {
            throw new SecurityException("No Hub ticket categories are assigned");
        }
    }

    public void requireTicket(String employeeId, String ticketId) {
        var ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found"));
        requireTicketType(employeeId, ticket.getType());
    }

    public void requireStatusChange(String employeeId, String ticketId, TicketStatus nextStatus) {
        var ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found"));
        requireTicketType(employeeId, ticket.getType());
        if ((ticket.getStatus() == TicketStatus.RESOLVED || ticket.getStatus() == TicketStatus.CLOSED)
                && ticket.getStatus() != nextStatus) {
            requirePermission(employeeId, "TICKET_REOPEN");
        }
    }

    public void requirePermission(String employeeId, String permission) {
        var employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new SecurityException("Hub employee not found"));
        if (!employee.isActive()) {
            throw new SecurityException("Hub employee is inactive");
        }
        if ("SUPER_ADMIN".equals(employee.getRole())) return;
        if (employee.getCustomRoleId() == null
                || !permissions(employee.getCustomRoleId()).contains(permission)) {
            throw new SecurityException("Required Hub permission is missing");
        }
    }

    public boolean hasPermission(String employeeId, String permission) {
        var employee = employeeRepository.findById(employeeId)
                .orElse(null);
        if (employee == null) return false;
        if (!employee.isActive()) {
            return false;
        }
        if ("SUPER_ADMIN".equals(employee.getRole())) return true;
        return employee.getCustomRoleId() != null
                && permissions(employee.getCustomRoleId()).contains(permission);
    }

    public static void validatePermissions(Set<String> permissions) {
        if (permissions == null) return;
        var unknown = permissions.stream()
                .filter(permission -> !ALLOWED_PERMISSIONS.contains(permission))
                .sorted()
                .toList();
        if (!unknown.isEmpty()) {
            throw new IllegalArgumentException("Unknown Hub permissions: " + String.join(", ", unknown));
        }
    }

    private Set<String> permissions(String roleId) {
        return roleRepository.findById(roleId)
                .map(role -> role.getPermissions() != null ? role.getPermissions() : Set.<String>of())
                .orElseGet(Set::of);
    }
}
