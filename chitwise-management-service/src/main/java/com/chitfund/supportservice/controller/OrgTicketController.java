package com.chitfund.supportservice.controller;

import com.chitfund.supportservice.domain.enums.SenderType;
import com.chitfund.supportservice.dto.request.CreateTicketRequest;
import com.chitfund.supportservice.dto.request.SendMessageRequest;
import com.chitfund.supportservice.dto.response.PagedResponse;
import com.chitfund.supportservice.dto.response.TicketMessageResponse;
import com.chitfund.supportservice.dto.response.TicketResponse;
import com.chitfund.supportservice.security.OrgRequestContext;
import com.chitfund.supportservice.service.TicketService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/tickets")
@RequiredArgsConstructor
public class OrgTicketController {

    private final TicketService ticketService;

    @PostMapping
    public ResponseEntity<?> createTicket(@Valid @RequestBody CreateTicketRequest request,
                                           HttpServletRequest httpRequest) {
        OrgRequestContext ctx = new OrgRequestContext(httpRequest);
        if (!ctx.isValid()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("success", false, "message", "Missing authentication context"));
        }
        String userName = ctx.getUserName();
        if (userName == null) userName = ctx.getUserId();

        TicketResponse ticket = ticketService.createTicket(
                ctx.getUserId(), userName, ctx.getTenantId(), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("success", true, "data", ticket));
    }

    @GetMapping
    public ResponseEntity<?> listTickets(@RequestParam(defaultValue = "0") int page,
                                          @RequestParam(defaultValue = "20") int size,
                                          HttpServletRequest httpRequest) {
        OrgRequestContext ctx = new OrgRequestContext(httpRequest);
        if (!ctx.isValid()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("success", false, "message", "Missing authentication context"));
        }

        PagedResponse<TicketResponse> result = "MEMBER".equals(ctx.getRole())
                ? ticketService.listForMember(ctx.getTenantId(), ctx.getUserId(), page, size)
                : ticketService.listForOrg(ctx.getTenantId(), page, size);
        return ResponseEntity.ok(Map.of("success", true, "data", result));
    }

    @GetMapping("/{ticketId}")
    public ResponseEntity<?> getTicket(@PathVariable String ticketId,
                                        HttpServletRequest httpRequest) {
        OrgRequestContext ctx = new OrgRequestContext(httpRequest);
        if (!ctx.isValid()) return unauthorized();

        TicketResponse ticket = ticketService.getTicket(ticketId, ctx.getTenantId(), false);
        return ResponseEntity.ok(Map.of("success", true, "data", ticket));
    }

    @GetMapping("/{ticketId}/messages")
    public ResponseEntity<?> getMessages(@PathVariable String ticketId,
                                          @RequestParam(required = false) String cursor,
                                          @RequestParam(defaultValue = "50") int limit,
                                          HttpServletRequest httpRequest) {
        OrgRequestContext ctx = new OrgRequestContext(httpRequest);
        if (!ctx.isValid()) return unauthorized();

        PagedResponse<TicketMessageResponse> result = ticketService.getMessages(
                ticketId, ctx.getTenantId(), false, cursor, limit);
        return ResponseEntity.ok(Map.of("success", true, "data", result));
    }

    @PostMapping("/{ticketId}/messages")
    public ResponseEntity<?> sendMessage(@PathVariable String ticketId,
                                          @Valid @RequestBody SendMessageRequest request,
                                          HttpServletRequest httpRequest) {
        OrgRequestContext ctx = new OrgRequestContext(httpRequest);
        if (!ctx.isValid()) return unauthorized();

        String userName = ctx.getUserName();
        if (userName == null) userName = ctx.getUserId();

        SenderType senderType = "MEMBER".equals(ctx.getRole()) ? SenderType.ORG_MEMBER : SenderType.ORG_ADMIN;
        TicketMessageResponse message = ticketService.sendMessage(
                ticketId, ctx.getTenantId(), false,
                ctx.getUserId(), userName, senderType, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("success", true, "data", message));
    }

    @PutMapping("/{ticketId}/messages/{messageId}/delete")
    public ResponseEntity<?> deleteMessage(@PathVariable String ticketId,
                                            @PathVariable String messageId,
                                            HttpServletRequest httpRequest) {
        OrgRequestContext ctx = new OrgRequestContext(httpRequest);
        if (!ctx.isValid()) return unauthorized();

        ticketService.softDeleteMessage(ticketId, messageId, ctx.getUserId(),
                ctx.getTenantId(), false);
        return ResponseEntity.ok(Map.of("success", true, "message", "Message deleted"));
    }

    @PutMapping("/{ticketId}/read")
    public ResponseEntity<?> markRead(@PathVariable String ticketId,
                                       HttpServletRequest httpRequest) {
        OrgRequestContext ctx = new OrgRequestContext(httpRequest);
        if (!ctx.isValid()) return unauthorized();

        ticketService.markRead(ticketId, ctx.getTenantId(), false);
        return ResponseEntity.ok(Map.of("success", true));
    }

    private ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("success", false, "message", "Missing authentication context"));
    }
}
