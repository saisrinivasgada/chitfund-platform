package com.chitfund.supportservice.controller.hub;

import com.chitfund.supportservice.domain.enums.SenderType;
import com.chitfund.supportservice.domain.enums.TicketStatus;
import com.chitfund.supportservice.domain.enums.TicketPriority;
import com.chitfund.supportservice.domain.enums.TicketType;
import com.chitfund.supportservice.dto.request.AssignTicketRequest;
import com.chitfund.supportservice.dto.request.CreateHubTicketRequest;
import com.chitfund.supportservice.dto.request.SendMessageRequest;
import com.chitfund.supportservice.dto.request.UpdateStatusRequest;
import com.chitfund.supportservice.dto.response.PagedResponse;
import com.chitfund.supportservice.dto.response.TicketMessageResponse;
import com.chitfund.supportservice.dto.response.TicketResponse;
import com.chitfund.supportservice.service.EmployeeService;
import com.chitfund.supportservice.service.TicketService;
import com.chitfund.supportservice.service.HubPermissionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.time.LocalDate;
import java.time.ZoneOffset;

@RestController
@RequestMapping("/api/hub/tickets")
@RequiredArgsConstructor
public class HubTicketController {

    private final TicketService ticketService;
    private final EmployeeService employeeService;
    private final HubPermissionService permissionService;

    @PostMapping
    @PreAuthorize("hasAnyAuthority('SUPER_ADMIN', 'SUPPORT_AGENT')")
    public ResponseEntity<?> createTicket(@Valid @RequestBody CreateHubTicketRequest request,
                                           Authentication auth) {
        String employeeId = (String) auth.getPrincipal();
        permissionService.requireTicketType(employeeId, request.getType());
        var employee = employeeService.getById(employeeId);
        TicketResponse ticket = ticketService.createTicketByHub(
                employeeId, employee.getFullName() != null ? employee.getFullName() : employee.getUsername(),
                employee.getRole(), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("success", true, "data", ticket));
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('SUPER_ADMIN', 'SUPPORT_AGENT')")
    public ResponseEntity<?> listAll(@RequestParam(defaultValue = "0") int page,
                                      @RequestParam(defaultValue = "20") int size,
                                      @RequestParam(required = false) TicketStatus status,
                                      @RequestParam(required = false) TicketType type,
                                      @RequestParam(required = false) TicketPriority priority,
                                      @RequestParam(required = false) LocalDate fromDate,
                                      @RequestParam(required = false) LocalDate toDate,
                                      @RequestParam(required = false, name = "q") String query,
                                      Authentication auth) {
        String employeeId = (String) auth.getPrincipal();
        var allowedTypes = permissionService.visibleTicketTypes(employeeId);
        if (type != null) permissionService.requireTicketType(employeeId, type);
        var from = fromDate != null ? fromDate.atStartOfDay(ZoneOffset.UTC).toInstant() : null;
        var toExclusive = toDate != null ? toDate.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant() : null;
        PagedResponse<TicketResponse> result = ticketService.listAll(
                page, size, status, type, priority, from, toExclusive, query, allowedTypes);
        return ResponseEntity.ok(Map.of("success", true, "data", result));
    }

    @GetMapping("/{ticketId}")
    @PreAuthorize("hasAnyAuthority('SUPER_ADMIN', 'SUPPORT_AGENT')")
    public ResponseEntity<?> getTicket(@PathVariable String ticketId, Authentication auth) {
        permissionService.requireTicket((String) auth.getPrincipal(), ticketId);
        TicketResponse ticket = ticketService.getTicket(ticketId, null, true, null, false);
        return ResponseEntity.ok(Map.of("success", true, "data", ticket));
    }

    @GetMapping("/{ticketId}/messages")
    @PreAuthorize("hasAnyAuthority('SUPER_ADMIN', 'SUPPORT_AGENT')")
    public ResponseEntity<?> getMessages(@PathVariable String ticketId,
                                          @RequestParam(required = false) String cursor,
                                          @RequestParam(defaultValue = "50") int limit,
                                          Authentication auth) {
        permissionService.requireTicket((String) auth.getPrincipal(), ticketId);
        PagedResponse<TicketMessageResponse> result = ticketService.getMessages(
                ticketId, null, true, null, false, cursor, limit);
        return ResponseEntity.ok(Map.of("success", true, "data", result));
    }

    @PostMapping("/{ticketId}/messages")
    @PreAuthorize("hasAnyAuthority('SUPER_ADMIN', 'SUPPORT_AGENT')")
    public ResponseEntity<?> sendMessage(@PathVariable String ticketId,
                                          @Valid @RequestBody SendMessageRequest request,
                                          Authentication auth) {
        String employeeId = (String) auth.getPrincipal();
        permissionService.requireTicket(employeeId, ticketId);
        var employee = employeeService.getById(employeeId);

        var senderType = "SUPER_ADMIN".equals(employee.getRole())
                ? SenderType.SUPER_ADMIN : SenderType.SUPPORT_AGENT;
        TicketMessageResponse message = ticketService.sendMessage(
                ticketId, null, true,
                employeeId, employee.getFullName(), senderType, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("success", true, "data", message));
    }

    @PutMapping("/{ticketId}/messages/{messageId}/delete")
    @PreAuthorize("hasAnyAuthority('SUPER_ADMIN', 'SUPPORT_AGENT')")
    public ResponseEntity<?> deleteMessage(@PathVariable String ticketId,
                                            @PathVariable String messageId,
                                            Authentication auth) {
        String employeeId = (String) auth.getPrincipal();
        permissionService.requireTicket(employeeId, ticketId);
        var employee = employeeService.getById(employeeId);
        ticketService.softDeleteMessage(ticketId, messageId,
                employeeId, employee.getRole(), null, true);
        return ResponseEntity.ok(Map.of("success", true, "message", "Message deleted"));
    }

    @PutMapping("/{ticketId}/status")
    @PreAuthorize("hasAnyAuthority('SUPER_ADMIN', 'SUPPORT_AGENT')")
    public ResponseEntity<?> updateStatus(@PathVariable String ticketId,
                                           @Valid @RequestBody UpdateStatusRequest request,
                                           Authentication auth) {
        String employeeId = (String) auth.getPrincipal();
        permissionService.requireStatusChange(employeeId, ticketId, request.getStatus());
        var employee = employeeService.getById(employeeId);
        TicketResponse ticket = ticketService.updateStatus(
                ticketId, request, employeeId, employee.getRole());
        return ResponseEntity.ok(Map.of("success", true, "data", ticket));
    }

    @PutMapping("/{ticketId}/read")
    @PreAuthorize("hasAnyAuthority('SUPER_ADMIN', 'SUPPORT_AGENT')")
    public ResponseEntity<?> markRead(@PathVariable String ticketId, Authentication auth) {
        permissionService.requireTicket((String) auth.getPrincipal(), ticketId);
        ticketService.markRead(ticketId, null, true, null, false);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PatchMapping("/{ticketId}/assign")
    @PreAuthorize("hasAnyAuthority('SUPER_ADMIN', 'SUPPORT_AGENT')")
    public ResponseEntity<?> assignTicket(@PathVariable String ticketId,
                                           @Valid @RequestBody AssignTicketRequest request,
                                           Authentication auth) {
        String assignedById = (String) auth.getPrincipal();
        permissionService.requireTicket(assignedById, ticketId);
        permissionService.requirePermission(assignedById, "TICKET_ASSIGN_ANY");
        var ticketToAssign = ticketService.getTicket(ticketId, null, true, null, false);
        permissionService.requireTicketType(request.getAssigneeId(), ticketToAssign.getType());
        var assignedBy = employeeService.getById(assignedById);
        var ticket = ticketService.assignTicket(
                ticketId, assignedById, assignedBy.getRole(), request, employeeService);
        return ResponseEntity.ok(Map.of("success", true, "data", ticket));
    }
}
