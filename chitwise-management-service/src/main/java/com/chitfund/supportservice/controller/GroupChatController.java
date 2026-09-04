package com.chitfund.supportservice.controller;

import com.chitfund.supportservice.dto.request.AddGroupMemberRequest;
import com.chitfund.supportservice.dto.request.CreateGroupRequest;
import com.chitfund.supportservice.dto.request.SendGroupMessageRequest;
import com.chitfund.supportservice.dto.response.ChatGroupMemberResponse;
import com.chitfund.supportservice.dto.response.ChatGroupMessageResponse;
import com.chitfund.supportservice.dto.response.ChatGroupResponse;
import com.chitfund.supportservice.dto.response.PagedResponse;
import com.chitfund.supportservice.security.OrgRequestContext;
import com.chitfund.supportservice.service.GroupChatService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/groups")
@RequiredArgsConstructor
public class GroupChatController {

    private final GroupChatService groupChatService;

    @PostMapping
    public ResponseEntity<ChatGroupResponse> createGroup(
            HttpServletRequest req,
            @Valid @RequestBody CreateGroupRequest body) {
        OrgRequestContext ctx = orgCtx(req);
        requireAdminOrManager(ctx);
        String name = ctx.getUserName() != null ? ctx.getUserName() : ctx.getUserId();
        ChatGroupResponse group = groupChatService.createGroup(
                ctx.getTenantId(), ctx.getUserId(), name, ctx.getRole(), body);
        return ResponseEntity.status(HttpStatus.CREATED).body(group);
    }

    @GetMapping
    public ResponseEntity<PagedResponse<ChatGroupResponse>> listGroups(
            HttpServletRequest req,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        OrgRequestContext ctx = orgCtx(req);
        return ResponseEntity.ok(groupChatService.listGroups(ctx.getTenantId(), ctx.getUserId(), page, size));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ChatGroupResponse> getGroup(
            HttpServletRequest req,
            @PathVariable String id) {
        OrgRequestContext ctx = orgCtx(req);
        return ResponseEntity.ok(groupChatService.getGroup(id, ctx.getTenantId(), ctx.getUserId()));
    }

    @PostMapping("/{id}/members")
    public ResponseEntity<ChatGroupMemberResponse> addMember(
            HttpServletRequest req,
            @PathVariable String id,
            @Valid @RequestBody AddGroupMemberRequest body) {
        OrgRequestContext ctx = orgCtx(req);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(groupChatService.addMember(id, ctx.getTenantId(), ctx.getRole(), body));
    }

    @DeleteMapping("/{id}/members/{userId}")
    public ResponseEntity<Void> removeMember(
            HttpServletRequest req,
            @PathVariable String id,
            @PathVariable String userId) {
        OrgRequestContext ctx = orgCtx(req);
        groupChatService.removeMember(id, ctx.getTenantId(), userId, ctx.getUserId(), ctx.getRole());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/members")
    public ResponseEntity<List<ChatGroupMemberResponse>> getMembers(
            HttpServletRequest req,
            @PathVariable String id) {
        OrgRequestContext ctx = orgCtx(req);
        return ResponseEntity.ok(groupChatService.getMembers(id, ctx.getTenantId(), ctx.getUserId(), ctx.getRole()));
    }

    @GetMapping("/{id}/messages")
    public ResponseEntity<PagedResponse<ChatGroupMessageResponse>> getMessages(
            HttpServletRequest req,
            @PathVariable String id,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "50") int limit) {
        OrgRequestContext ctx = orgCtx(req);
        return ResponseEntity.ok(groupChatService.getMessages(
                id, ctx.getTenantId(), ctx.getUserId(), cursor, limit));
    }

    @PostMapping("/{id}/messages")
    public ResponseEntity<ChatGroupMessageResponse> sendMessage(
            HttpServletRequest req,
            @PathVariable String id,
            @Valid @RequestBody SendGroupMessageRequest body) {
        OrgRequestContext ctx = orgCtx(req);
        String name = ctx.getUserName() != null ? ctx.getUserName() : ctx.getUserId();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(groupChatService.sendMessage(
                        id, ctx.getTenantId(), ctx.getUserId(), name, ctx.getRole(), body));
    }

    @PutMapping("/{id}/messages/{msgId}/delete")
    public ResponseEntity<Void> deleteMessage(
            HttpServletRequest req,
            @PathVariable String id,
            @PathVariable String msgId) {
        OrgRequestContext ctx = orgCtx(req);
        groupChatService.softDeleteMessage(id, msgId, ctx.getTenantId(), ctx.getUserId());
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
            throw new SecurityException("Only admins and managers can perform this action");
        }
    }
}
