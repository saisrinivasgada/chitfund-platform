package com.chitfund.supportservice.controller;

import com.chitfund.supportservice.client.TenantSupportClient;
import com.chitfund.supportservice.dto.request.SendChatMessageRequest;
import com.chitfund.supportservice.dto.request.StartConversationRequest;
import com.chitfund.supportservice.dto.response.ChatMessageResponse;
import com.chitfund.supportservice.dto.response.ConversationResponse;
import com.chitfund.supportservice.dto.response.PagedResponse;
import com.chitfund.supportservice.security.OrgRequestContext;
import com.chitfund.supportservice.service.ConversationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/conversations")
@RequiredArgsConstructor
@Slf4j
public class OrgConversationController {

    private final ConversationService conversationService;
    private final TenantSupportClient tenantSupportClient;

    // ── Admin/Manager endpoints ───────────────────────────────────────────────

    /** List all conversations in the org (admin/manager view). */
    @GetMapping
    public ResponseEntity<PagedResponse<ConversationResponse>> listConversations(
            HttpServletRequest req,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        OrgRequestContext ctx = orgCtx(req);
        requireAdminOrManager(ctx);
        return ResponseEntity.ok(conversationService.listConversations(ctx.getTenantId(), page, size));
    }

    /** Start or retrieve a DM with a specific member (idempotent). */
    @PostMapping
    public ResponseEntity<?> startConversation(
            HttpServletRequest req,
            @Valid @RequestBody StartConversationRequest body) {
        OrgRequestContext ctx = orgCtx(req);
        requireAdminOrManager(ctx);
        if (chatCapabilityDenied(ctx.getTenantId())) return chatDenied();
        return ResponseEntity.ok(conversationService.startOrGetConversation(
                ctx.getTenantId(), ctx.getUserId(), body));
    }

    /** Admin unread total — for the sidebar badge. Cached 45s. */
    @GetMapping("/unread")
    public ResponseEntity<?> adminUnread(HttpServletRequest req) {
        OrgRequestContext ctx = orgCtx(req);
        requireAdminOrManager(ctx);
        return ResponseEntity.ok(java.util.Map.of(
                "unread", conversationService.getAdminUnreadTotal(ctx.getTenantId())));
    }

    // ── Member endpoints ──────────────────────────────────────────────────────

    /** Member gets (or creates) their own conversation thread with the org. */
    @GetMapping("/mine")
    public ResponseEntity<ConversationResponse> myConversation(HttpServletRequest req) {
        OrgRequestContext ctx = orgCtx(req);
        requireMember(ctx);
        return ResponseEntity.ok(conversationService.getOrCreateMemberConversation(
                ctx.getTenantId(), ctx.getUserId(), ctx.getUserName()));
    }

    /** Member unread total — for their notification badge. Cached 45s. */
    @GetMapping("/mine/unread")
    public ResponseEntity<?> memberUnread(HttpServletRequest req) {
        OrgRequestContext ctx = orgCtx(req);
        requireMember(ctx);
        return ResponseEntity.ok(java.util.Map.of(
                "unread", conversationService.getMemberUnreadTotal(ctx.getTenantId(), ctx.getUserId())));
    }

    // ── Shared endpoints (admin or member for their own conversation) ─────────

    @GetMapping("/{id}/messages")
    public ResponseEntity<PagedResponse<ChatMessageResponse>> getMessages(
            HttpServletRequest req,
            @PathVariable String id,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "50") int limit) {
        OrgRequestContext ctx = orgCtx(req);
        requireAdminManagerOrMember(ctx);
        boolean isMember = "MEMBER".equals(ctx.getRole());
        return ResponseEntity.ok(conversationService.getMessages(
                id, ctx.getTenantId(), ctx.getUserId(), isMember, cursor, limit));
    }

    @PostMapping("/{id}/messages")
    public ResponseEntity<?> sendMessage(
            HttpServletRequest req,
            @PathVariable String id,
            @Valid @RequestBody SendChatMessageRequest body) {
        OrgRequestContext ctx = orgCtx(req);
        requireAdminManagerOrMember(ctx);
        if (chatCapabilityDenied(ctx.getTenantId())) return chatDenied();
        boolean isMember = "MEMBER".equals(ctx.getRole());
        return ResponseEntity.ok(conversationService.sendMessage(
                id, ctx.getTenantId(), ctx.getUserId(), ctx.getUserName(),
                ctx.getRole(), isMember, body));
    }

    @PutMapping("/{id}/messages/{msgId}/delete")
    public ResponseEntity<Void> deleteMessage(
            HttpServletRequest req,
            @PathVariable String id,
            @PathVariable String msgId) {
        OrgRequestContext ctx = orgCtx(req);
        requireAdminManagerOrMember(ctx);
        boolean isMember = "MEMBER".equals(ctx.getRole());
        conversationService.softDeleteMessage(id, msgId, ctx.getTenantId(), ctx.getUserId(), isMember);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/read")
    public ResponseEntity<Void> markRead(HttpServletRequest req, @PathVariable String id) {
        OrgRequestContext ctx = orgCtx(req);
        requireAdminManagerOrMember(ctx);
        boolean isMember = "MEMBER".equals(ctx.getRole());
        conversationService.markRead(id, ctx.getTenantId(), ctx.getUserId(), isMember);
        return ResponseEntity.noContent().build();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private OrgRequestContext orgCtx(HttpServletRequest req) {
        OrgRequestContext ctx = new OrgRequestContext(req);
        if (!ctx.isValid()) throw new SecurityException("Missing identity headers");
        return ctx;
    }

    private void requireAdminOrManager(OrgRequestContext ctx) {
        if (!"ADMIN".equals(ctx.getRole()) && !"MANAGER".equals(ctx.getRole())) {
            throw new SecurityException("Access denied");
        }
    }

    private void requireMember(OrgRequestContext ctx) {
        if (!"MEMBER".equals(ctx.getRole())) {
            throw new SecurityException("Only members can access this endpoint");
        }
    }

    private void requireAdminManagerOrMember(OrgRequestContext ctx) {
        String role = ctx.getRole();
        if (!"ADMIN".equals(role) && !"MANAGER".equals(role) && !"MEMBER".equals(role)) {
            throw new SecurityException("Access denied");
        }
    }

    private boolean chatCapabilityDenied(String tenantId) {
        try {
            List<String> caps = tenantSupportClient.getCapabilities(tenantId);
            return caps != null && !caps.contains("live_chat");
        } catch (Exception e) {
            log.warn("live_chat capability check failed for tenant {} — failing open: {}", tenantId, e.getMessage());
            return false;
        }
    }

    private static ResponseEntity<Map<String, String>> chatDenied() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "CAPABILITY_REQUIRED",
                        "message", "Live chat is not included in your current plan."));
    }
}
