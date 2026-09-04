package com.chitfund.supportservice.controller.hub;

import com.chitfund.supportservice.domain.enums.SenderType;
import com.chitfund.supportservice.domain.enums.TicketStatus;
import com.chitfund.supportservice.dto.request.AssignTicketRequest;
import com.chitfund.supportservice.dto.request.SendMessageRequest;
import com.chitfund.supportservice.dto.request.UpdateStatusRequest;
import com.chitfund.supportservice.dto.response.PagedResponse;
import com.chitfund.supportservice.dto.response.TicketMessageResponse;
import com.chitfund.supportservice.dto.response.TicketResponse;
import com.chitfund.supportservice.service.EmployeeService;
import com.chitfund.supportservice.service.TicketService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/hub/tickets")
@RequiredArgsConstructor
public class HubTicketController {

    private final TicketService ticketService;
    private final EmployeeService employeeService;

    @GetMapping
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> listAll(@RequestParam(defaultValue = "0") int page,
                                      @RequestParam(defaultValue = "20") int size,
                                      @RequestParam(required = false) TicketStatus status) {
        PagedResponse<TicketResponse> result = ticketService.listAll(page, size, status);
        return ResponseEntity.ok(Map.of("success", true, "data", result));
    }

    @GetMapping("/{ticketId}")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> getTicket(@PathVariable String ticketId) {
        TicketResponse ticket = ticketService.getTicket(ticketId, null, true);
        return ResponseEntity.ok(Map.of("success", true, "data", ticket));
    }

    @GetMapping("/{ticketId}/messages")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> getMessages(@PathVariable String ticketId,
                                          @RequestParam(required = false) String cursor,
                                          @RequestParam(defaultValue = "50") int limit) {
        PagedResponse<TicketMessageResponse> result = ticketService.getMessages(
                ticketId, null, true, cursor, limit);
        return ResponseEntity.ok(Map.of("success", true, "data", result));
    }

    @PostMapping("/{ticketId}/messages")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> sendMessage(@PathVariable String ticketId,
                                          @Valid @RequestBody SendMessageRequest request,
                                          Authentication auth) {
        String employeeId = (String) auth.getPrincipal();
        var employee = employeeService.getById(employeeId);

        TicketMessageResponse message = ticketService.sendMessage(
                ticketId, null, true,
                employeeId, employee.getFullName(), SenderType.SUPER_ADMIN, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("success", true, "data", message));
    }

    @PutMapping("/{ticketId}/messages/{messageId}/delete")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> deleteMessage(@PathVariable String ticketId,
                                            @PathVariable String messageId,
                                            Authentication auth) {
        ticketService.softDeleteMessage(ticketId, messageId,
                (String) auth.getPrincipal(), null, true);
        return ResponseEntity.ok(Map.of("success", true, "message", "Message deleted"));
    }

    @PutMapping("/{ticketId}/status")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> updateStatus(@PathVariable String ticketId,
                                           @Valid @RequestBody UpdateStatusRequest request) {
        TicketResponse ticket = ticketService.updateStatus(ticketId, request);
        return ResponseEntity.ok(Map.of("success", true, "data", ticket));
    }

    @PutMapping("/{ticketId}/read")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> markRead(@PathVariable String ticketId) {
        ticketService.markRead(ticketId, null, true);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PatchMapping("/{ticketId}/assign")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> assignTicket(@PathVariable String ticketId,
                                           @Valid @RequestBody AssignTicketRequest request,
                                           Authentication auth) {
        String assignedById = (String) auth.getPrincipal();
        var ticket = ticketService.assignTicket(ticketId, assignedById, request, employeeService);
        return ResponseEntity.ok(Map.of("success", true, "data", ticket));
    }
}
