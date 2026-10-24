package com.chitfund.supportservice.service;

import com.chitfund.supportservice.client.AuditClient;
import com.chitfund.supportservice.domain.entity.ChatGroup;
import com.chitfund.supportservice.domain.entity.ChatGroupMember;
import com.chitfund.supportservice.domain.entity.ChatGroupMessage;
import com.chitfund.supportservice.dto.request.AddGroupMemberRequest;
import com.chitfund.supportservice.dto.request.CreateGroupRequest;
import com.chitfund.supportservice.dto.request.SendGroupMessageRequest;
import com.chitfund.supportservice.dto.response.ChatGroupMemberResponse;
import com.chitfund.supportservice.dto.response.ChatGroupMessageResponse;
import com.chitfund.supportservice.dto.response.ChatGroupResponse;
import com.chitfund.supportservice.dto.response.PagedResponse;
import com.chitfund.supportservice.repository.ChatGroupMemberRepository;
import com.chitfund.supportservice.repository.ChatGroupMessageRepository;
import com.chitfund.supportservice.repository.ChatGroupRepository;
import com.chitfund.supportservice.websocket.GroupChatWebSocketController;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class GroupChatService {

    private final ChatGroupRepository groupRepo;
    private final ChatGroupMemberRepository memberRepo;
    private final ChatGroupMessageRepository messageRepo;
    private final GroupChatWebSocketController wsController;
    private final AuditClient auditClient;

    @Value("${app.message-delete-window-seconds:300}")
    private long deleteWindowSeconds;

    // ── Group management ──────────────────────────────────────────────────────

    @Transactional
    public ChatGroupResponse createGroup(String tenantId, String creatorId, String creatorName,
                                          String creatorRole, CreateGroupRequest req) {
        ChatGroup group = ChatGroup.builder()
                .id(UUID.randomUUID().toString())
                .tenantId(tenantId)
                .name(req.getName())
                .description(req.getDescription())
                .createdBy(creatorId)
                .createdByName(creatorName)
                .memberCount(0)
                .build();
        group = groupRepo.save(group);

        // Auto-add creator
        addMemberInternal(group.getId(), creatorId, creatorName, creatorRole);

        // Add initial members from members list (with userName and role)
        if (req.getMembers() != null) {
            for (CreateGroupRequest.MemberInfo info : req.getMembers()) {
                if (!info.getUserId().equals(creatorId) &&
                        !memberRepo.existsByGroupIdAndUserId(group.getId(), info.getUserId())) {
                    addMemberInternal(group.getId(), info.getUserId(),
                            info.getUserName() != null ? info.getUserName() : "Member",
                            info.getRole() != null ? info.getRole() : "MEMBER");
                }
            }
        }

        // Refresh memberCount
        long count = memberRepo.countByGroupId(group.getId());
        group.setMemberCount((int) count);
        group = groupRepo.save(group);

        auditClient.logEntity("CHAT_GROUP", group.getId(), "CREATED",
                creatorId, creatorRole, null,
                java.util.Map.of("name", group.getName(), "memberCount", group.getMemberCount()),
                null, tenantId, null);

        return toGroupResponse(group, true);
    }

    @Transactional(readOnly = true)
    public PagedResponse<ChatGroupResponse> listGroups(String tenantId, String userId, int page, int size) {
        page = Math.max(page, 0);
        size = Math.min(Math.max(size, 1), 50);
        // Only return groups this user is a member of — groups are private by design
        List<ChatGroup> groups = groupRepo.findByTenantIdAndMemberUserIdOrderByLastMessageAtDesc(
                tenantId, userId, PageRequest.of(page, size));
        return PagedResponse.<ChatGroupResponse>builder()
                .items(groups.stream().map(g -> toGroupResponse(g, true)).toList())
                .page(page)
                .size(size)
                .hasNext(groups.size() == size)
                .build();
    }

    @Transactional(readOnly = true)
    public ChatGroupResponse getGroup(String groupId, String tenantId, String userId) {
        ChatGroup group = findGroupSecure(groupId, tenantId);
        requireMember(groupId, userId);
        return toGroupResponse(group, true);
    }

    @Transactional
    public ChatGroupMemberResponse addMember(String groupId, String tenantId, String callerId,
                                              String callerRole, AddGroupMemberRequest req) {
        requireAdminOrManager(callerRole);
        findGroupForUpdate(groupId, tenantId);
        if (memberRepo.existsByGroupIdAndUserId(groupId, req.getUserId())) {
            throw new IllegalStateException("User is already a member of this group");
        }
        ChatGroupMember member = addMemberInternal(groupId, req.getUserId(), req.getUserName(), req.getRole());
        groupRepo.incrementMemberCount(groupId);
        auditClient.logEntity("CHAT_GROUP", groupId, "MEMBER_ADDED",
                callerId, callerRole, null,
                java.util.Map.of("memberId", req.getUserId(), "memberRole", req.getRole()),
                null, tenantId, null);
        return toMemberResponse(member);
    }

    @Transactional
    public void removeMember(String groupId, String tenantId, String userId, String callerId, String callerRole) {
        requireAdminOrManager(callerRole);
        if (userId.equals(callerId)) {
            throw new IllegalStateException("You cannot remove yourself from the group");
        }
        findGroupForUpdate(groupId, tenantId);
        ChatGroupMember member = memberRepo.findByGroupIdAndUserId(groupId, userId)
                .orElseThrow(() -> new IllegalArgumentException("User is not a member of this group"));
        memberRepo.delete(member);
        groupRepo.decrementMemberCount(groupId);
        auditClient.logEntity("CHAT_GROUP", groupId, "MEMBER_REMOVED",
                callerId, callerRole,
                java.util.Map.of("memberId", userId), null, null,
                tenantId, "Administrator removed a member from the chat group");
    }

    @Transactional(readOnly = true)
    public List<ChatGroupMemberResponse> getMembers(String groupId, String tenantId, String callerId, String callerRole) {
        findGroupSecure(groupId, tenantId);
        // Only members or admins/managers can view the member list
        if (!"ADMIN".equals(callerRole) && !"MANAGER".equals(callerRole)) {
            requireMember(groupId, callerId);
        }
        return memberRepo.findByGroupId(groupId).stream()
                .map(this::toMemberResponse)
                .toList();
    }

    // ── Messages ──────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PagedResponse<ChatGroupMessageResponse> getMessages(String groupId, String tenantId,
                                                                String userId, String cursor, int limit) {
        findGroupSecure(groupId, tenantId);
        requireMember(groupId, userId);
        limit = Math.min(Math.max(limit, 1), 50);
        Instant before = parseCursor(cursor);

        List<ChatGroupMessage> msgs = before != null
                ? messageRepo.findBeforeCursor(groupId, before, PageRequest.of(0, limit))
                : messageRepo.findByGroupIdOrderByCreatedAtDesc(groupId, PageRequest.of(0, limit));

        String nextCursor = msgs.size() == limit
                ? msgs.get(msgs.size() - 1).getCreatedAt().toString()
                : null;

        return PagedResponse.<ChatGroupMessageResponse>builder()
                .items(msgs.stream().map(this::toMessageResponse).toList())
                .hasNext(nextCursor != null)
                .nextCursor(nextCursor)
                .build();
    }

    @Transactional
    public ChatGroupMessageResponse sendMessage(String groupId, String tenantId,
                                                 String senderId, String senderName,
                                                 String senderRole, SendGroupMessageRequest req) {
        ChatGroup group = findGroupForUpdate(groupId, tenantId);
        requireMember(groupId, senderId);

        // Idempotency check — scoped to (groupId, senderId, clientMessageId)
        if (req.getClientMessageId() != null) {
            var existing = messageRepo.findByGroupIdAndSenderIdAndClientMessageId(
                    groupId, senderId, req.getClientMessageId());
            if (existing.isPresent()) {
                return toMessageResponse(existing.get());
            }
        }

        ChatGroupMessage msg = ChatGroupMessage.builder()
                .id(UUID.randomUUID().toString())
                .groupId(groupId)
                .senderId(senderId)
                .senderName(senderName)
                .senderRole(senderRole)
                .content(req.getContent())
                .clientMessageId(req.getClientMessageId())
                .build();
        msg = messageRepo.save(msg);

        // Update group metadata
        String preview = req.getContent().length() > 197
                ? req.getContent().substring(0, 197) + "..."
                : req.getContent();
        groupRepo.updatePreview(groupId, msg.getCreatedAt(), preview);

        ChatGroupMessageResponse response = toMessageResponse(msg);
        auditClient.logEntity("CHAT_GROUP", groupId, "MESSAGE_SENT",
                senderId, senderRole, null,
                java.util.Map.of("messageId", msg.getId()), null, tenantId, null);
        PostCommitAction.run("Group message WebSocket publication",
                () -> wsController.sendGroupMessage(groupId, response));
        return response;
    }

    @Transactional
    public void softDeleteMessage(String groupId, String messageId, String tenantId, String userId) {
        findGroupForUpdate(groupId, tenantId);
        ChatGroupMessage msg = messageRepo.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));

        if (!msg.getGroupId().equals(groupId)) {
            throw new IllegalArgumentException("Message does not belong to this group");
        }
        if (!msg.getSenderId().equals(userId)) {
            throw new SecurityException("You can only delete your own messages");
        }
        if (msg.getDeletedAt() != null) {
            throw new IllegalStateException("Message already deleted");
        }

        long elapsed = Instant.now().getEpochSecond() - msg.getCreatedAt().getEpochSecond();
        if (elapsed > deleteWindowSeconds) {
            throw new IllegalStateException("5-minute delete window has passed");
        }

        msg.setDeletedAt(Instant.now());
        msg.setContent("[deleted]");
        messageRepo.save(msg);
        auditClient.logEntity("CHAT_GROUP", groupId, "MESSAGE_DELETED",
                userId, "GROUP_MEMBER",
                java.util.Map.of("messageId", messageId, "deleted", false),
                java.util.Map.of("messageId", messageId, "deleted", true),
                null, tenantId, "Sender deleted the message within the allowed window");
        PostCommitAction.run("Group delete WebSocket publication",
                () -> wsController.sendGroupMessageDeleted(groupId, messageId));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private ChatGroup findGroupForUpdate(String groupId, String tenantId) {
        return groupRepo.findForUpdate(groupId, tenantId)
                .orElseThrow(() -> new IllegalArgumentException("Group not found"));
    }

    private ChatGroup findGroupSecure(String groupId, String tenantId) {
        return groupRepo.findByIdAndTenantId(groupId, tenantId)
                .orElseThrow(() -> new IllegalArgumentException("Group not found"));
    }

    private void requireMember(String groupId, String userId) {
        if (!memberRepo.existsByGroupIdAndUserId(groupId, userId)) {
            throw new SecurityException("You are not a member of this group");
        }
    }

    private Instant parseCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) return null;
        try {
            return Instant.parse(cursor);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Invalid message cursor");
        }
    }

    private void requireAdminOrManager(String role) {
        if (!"ADMIN".equals(role) && !"MANAGER".equals(role)) {
            throw new SecurityException("Only admins and managers can perform this action");
        }
    }

    private ChatGroupMember addMemberInternal(String groupId, String userId, String userName, String role) {
        return memberRepo.save(ChatGroupMember.builder()
                .id(UUID.randomUUID().toString())
                .groupId(groupId)
                .userId(userId)
                .userName(userName)
                .role(role)
                .build());
    }

    private ChatGroupResponse toGroupResponse(ChatGroup g, boolean isMember) {
        return ChatGroupResponse.builder()
                .id(g.getId())
                .tenantId(g.getTenantId())
                .name(g.getName())
                .description(g.getDescription())
                .createdBy(g.getCreatedBy())
                .createdByName(g.getCreatedByName())
                .memberCount(g.getMemberCount())
                .lastMessageAt(g.getLastMessageAt())
                .lastMessagePreview(g.getLastMessagePreview())
                .isMember(isMember)
                .createdAt(g.getCreatedAt())
                .build();
    }

    private ChatGroupMemberResponse toMemberResponse(ChatGroupMember m) {
        return ChatGroupMemberResponse.builder()
                .userId(m.getUserId())
                .userName(m.getUserName())
                .role(m.getRole())
                .joinedAt(m.getJoinedAt())
                .build();
    }

    private ChatGroupMessageResponse toMessageResponse(ChatGroupMessage m) {
        return ChatGroupMessageResponse.builder()
                .id(m.getId())
                .groupId(m.getGroupId())
                .senderId(m.getSenderId())
                .senderName(m.getSenderName())
                .senderRole(m.getSenderRole())
                .content(m.getDeletedAt() != null ? "This message was deleted" : m.getContent())
                .clientMessageId(m.getClientMessageId())
                .deleted(m.getDeletedAt() != null)
                .createdAt(m.getCreatedAt())
                .build();
    }
}
