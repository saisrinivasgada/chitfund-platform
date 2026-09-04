package com.chitfund.supportservice.service;

import com.chitfund.supportservice.domain.entity.*;
import com.chitfund.supportservice.dto.request.CreateHubGroupRequest;
import com.chitfund.supportservice.dto.request.SendHubMessageRequest;
import com.chitfund.supportservice.dto.request.StartHubDmRequest;
import com.chitfund.supportservice.dto.response.*;
import com.chitfund.supportservice.repository.*;
import com.chitfund.supportservice.websocket.HubChatWebSocketController;
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
public class HubChatService {

    private final HubConversationRepository dmRepo;
    private final HubConversationMessageRepository dmMsgRepo;
    private final HubGroupRepository groupRepo;
    private final HubGroupMemberRepository groupMemberRepo;
    private final HubGroupMessageRepository groupMsgRepo;
    private final EmployeeRepository employeeRepo;
    private final HubChatWebSocketController wsController;

    @Value("${app.message-delete-window-seconds:300}")
    private long deleteWindowSeconds;

    // ── DM ────────────────────────────────────────────────────────────────────

    @Transactional
    public HubConversationResponse startOrGetDm(String callerId, StartHubDmRequest req) {
        String otherId = req.getOtherEmployeeId();
        if (callerId.equals(otherId)) {
            throw new IllegalArgumentException("Cannot start a conversation with yourself");
        }
        Employee other = employeeRepo.findById(otherId)
                .orElseThrow(() -> new IllegalArgumentException("Employee not found"));

        // Normalize ordering so (A,B) and (B,A) always resolve to the same row
        String e1 = callerId.compareTo(otherId) < 0 ? callerId : otherId;
        String e2 = callerId.compareTo(otherId) < 0 ? otherId : callerId;
        HubConversation conv = dmRepo.findBetween(callerId, otherId)
                .orElseGet(() -> {
                    HubConversation c = HubConversation.builder()
                            .id(UUID.randomUUID().toString())
                            .employee1Id(e1)
                            .employee2Id(e2)
                            .build();
                    return dmRepo.save(c);
                });

        return toDmResponse(conv, callerId, other.getFullName());
    }

    @Transactional(readOnly = true)
    public List<HubConversationResponse> listDms(String employeeId) {
        List<HubConversation> convs = dmRepo.findByEmployee(employeeId);
        return convs.stream()
                .map(c -> {
                    String otherId = c.getEmployee1Id().equals(employeeId)
                            ? c.getEmployee2Id() : c.getEmployee1Id();
                    String otherName = employeeRepo.findById(otherId)
                            .map(Employee::getFullName).orElse("Unknown");
                    return toDmResponse(c, employeeId, otherName);
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public PagedResponse<HubMessageResponse> getDmMessages(String convId, String employeeId,
                                                            String cursor, int limit) {
        HubConversation conv = findDmSecure(convId, employeeId);
        limit = Math.min(limit, 50);

        List<HubConversationMessage> msgs = cursor != null
                ? dmMsgRepo.findBeforeCursor(convId, Instant.parse(cursor), PageRequest.of(0, limit))
                : dmMsgRepo.findByConversationIdOrderByCreatedAtDesc(convId, PageRequest.of(0, limit));

        String nextCursor = msgs.size() == limit
                ? msgs.get(msgs.size() - 1).getCreatedAt().toString()
                : null;

        return PagedResponse.<HubMessageResponse>builder()
                .items(msgs.stream().map(this::toDmMessageResponse).toList())
                .hasNext(nextCursor != null)
                .nextCursor(nextCursor)
                .build();
    }

    @Transactional
    public HubMessageResponse sendDmMessage(String convId, String senderId, String senderName,
                                             SendHubMessageRequest req) {
        HubConversation conv = findDmSecure(convId, senderId);

        if (req.getClientMessageId() != null) {
            var existing = dmMsgRepo.findByConversationIdAndSenderIdAndClientMessageId(
                    convId, senderId, req.getClientMessageId());
            if (existing.isPresent()) return toDmMessageResponse(existing.get());
        }

        HubConversationMessage msg = HubConversationMessage.builder()
                .id(UUID.randomUUID().toString())
                .conversationId(convId)
                .senderId(senderId)
                .senderName(senderName)
                .content(req.getContent())
                .clientMessageId(req.getClientMessageId())
                .build();
        msg = dmMsgRepo.save(msg);

        // Atomic unread increment for the other party
        boolean callerIsEmp1 = conv.getEmployee1Id().equals(senderId);
        if (callerIsEmp1) {
            dmRepo.incrementEmployee2Unread(convId);
        } else {
            dmRepo.incrementEmployee1Unread(convId);
        }

        // Update only preview fields — do NOT call save(conv) which would overwrite the atomic unread increment
        String preview = req.getContent().length() > 197
                ? req.getContent().substring(0, 197) + "..." : req.getContent();
        dmRepo.updatePreview(convId, msg.getCreatedAt(), preview);

        HubMessageResponse response = toDmMessageResponse(msg);
        wsController.sendDmMessage(convId, response);
        return response;
    }

    @Transactional
    public void deleteDmMessage(String convId, String msgId, String callerId) {
        findDmSecure(convId, callerId);
        HubConversationMessage msg = dmMsgRepo.findById(msgId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));
        if (!msg.getConversationId().equals(convId)) {
            throw new IllegalArgumentException("Message not in this conversation");
        }
        if (!msg.getSenderId().equals(callerId)) {
            throw new SecurityException("You can only delete your own messages");
        }
        if (msg.getDeletedAt() != null) throw new IllegalStateException("Already deleted");

        long elapsed = Instant.now().getEpochSecond() - msg.getCreatedAt().getEpochSecond();
        if (elapsed > deleteWindowSeconds) throw new IllegalStateException("Delete window has passed");

        msg.setDeletedAt(Instant.now());
        msg.setContent("[deleted]");
        dmMsgRepo.save(msg);
        wsController.sendDmMessageDeleted(convId, msgId);
    }

    @Transactional
    public void markDmRead(String convId, String employeeId) {
        HubConversation conv = findDmSecure(convId, employeeId);
        if (conv.getEmployee1Id().equals(employeeId)) {
            dmRepo.clearEmployee1Unread(convId);
        } else {
            dmRepo.clearEmployee2Unread(convId);
        }
    }

    // ── Group ─────────────────────────────────────────────────────────────────

    @Transactional
    public HubGroupResponse createHubGroup(String creatorId, String creatorName,
                                            CreateHubGroupRequest req) {
        HubGroup group = HubGroup.builder()
                .id(UUID.randomUUID().toString())
                .name(req.getName())
                .description(req.getDescription())
                .createdBy(creatorId)
                .createdByName(creatorName)
                .memberCount(0)
                .build();
        group = groupRepo.save(group);

        // Auto-add creator
        addGroupMemberInternal(group.getId(), creatorId, creatorName);

        if (req.getMemberIds() != null) {
            for (String memberId : req.getMemberIds()) {
                if (!memberId.equals(creatorId)
                        && !groupMemberRepo.existsByGroupIdAndEmployeeId(group.getId(), memberId)) {
                    String name = employeeRepo.findById(memberId)
                            .orElseThrow(() -> new IllegalArgumentException("Employee not found: " + memberId))
                            .getFullName();
                    addGroupMemberInternal(group.getId(), memberId, name);
                }
            }
        }

        long count = groupMemberRepo.countByGroupId(group.getId());
        group.setMemberCount((int) count);
        group = groupRepo.save(group);
        return toGroupResponse(group);
    }

    @Transactional(readOnly = true)
    public List<HubGroupResponse> listHubGroups(String employeeId) {
        return groupRepo.findByMember(employeeId).stream()
                .map(this::toGroupResponse)
                .toList();
    }

    @Transactional
    public void addHubGroupMember(String groupId, String callerId, String callerRole, String employeeId) {
        groupRepo.findById(groupId)
                .orElseThrow(() -> new IllegalArgumentException("Group not found"));
        // Only group members or SUPER_ADMINs can add new members
        if (!"SUPER_ADMIN".equals(callerRole) && !groupMemberRepo.existsByGroupIdAndEmployeeId(groupId, callerId)) {
            throw new SecurityException("You must be a group member or SUPER_ADMIN to add members");
        }
        if (groupMemberRepo.existsByGroupIdAndEmployeeId(groupId, employeeId)) {
            throw new IllegalStateException("Already a member");
        }
        String name = employeeRepo.findById(employeeId)
                .orElseThrow(() -> new IllegalArgumentException("Employee not found"))
                .getFullName();
        addGroupMemberInternal(groupId, employeeId, name);
        groupRepo.incrementMemberCount(groupId);
    }

    @Transactional
    public void removeHubGroupMember(String groupId, String employeeId, String callerId, String callerRole) {
        groupRepo.findById(groupId)
                .orElseThrow(() -> new IllegalArgumentException("Group not found"));
        if (employeeId.equals(callerId)) {
            throw new IllegalStateException("Cannot remove yourself");
        }
        // Only group members or SUPER_ADMINs can remove members
        if (!"SUPER_ADMIN".equals(callerRole) && !groupMemberRepo.existsByGroupIdAndEmployeeId(groupId, callerId)) {
            throw new SecurityException("You must be a group member or SUPER_ADMIN to remove members");
        }
        HubGroupMember member = groupMemberRepo.findByGroupIdAndEmployeeId(groupId, employeeId)
                .orElseThrow(() -> new IllegalArgumentException("Not a member"));
        groupMemberRepo.delete(member);
        groupRepo.decrementMemberCount(groupId);
    }

    @Transactional(readOnly = true)
    public PagedResponse<HubMessageResponse> getHubGroupMessages(String groupId, String employeeId,
                                                                   String cursor, int limit) {
        requireHubGroupMember(groupId, employeeId);
        limit = Math.min(limit, 50);

        List<HubGroupMessage> msgs = cursor != null
                ? groupMsgRepo.findBeforeCursor(groupId, Instant.parse(cursor), PageRequest.of(0, limit))
                : groupMsgRepo.findByGroupIdOrderByCreatedAtDesc(groupId, PageRequest.of(0, limit));

        String nextCursor = msgs.size() == limit
                ? msgs.get(msgs.size() - 1).getCreatedAt().toString()
                : null;

        return PagedResponse.<HubMessageResponse>builder()
                .items(msgs.stream().map(this::toGroupMessageResponse).toList())
                .hasNext(nextCursor != null)
                .nextCursor(nextCursor)
                .build();
    }

    @Transactional
    public HubMessageResponse sendHubGroupMessage(String groupId, String senderId, String senderName,
                                                    SendHubMessageRequest req) {
        HubGroup group = groupRepo.findById(groupId)
                .orElseThrow(() -> new IllegalArgumentException("Group not found"));
        requireHubGroupMember(groupId, senderId);

        if (req.getClientMessageId() != null) {
            var existing = groupMsgRepo.findByGroupIdAndSenderIdAndClientMessageId(
                    groupId, senderId, req.getClientMessageId());
            if (existing.isPresent()) return toGroupMessageResponse(existing.get());
        }

        HubGroupMessage msg = HubGroupMessage.builder()
                .id(UUID.randomUUID().toString())
                .groupId(groupId)
                .senderId(senderId)
                .senderName(senderName)
                .content(req.getContent())
                .clientMessageId(req.getClientMessageId())
                .build();
        msg = groupMsgRepo.save(msg);

        String preview = req.getContent().length() > 197
                ? req.getContent().substring(0, 197) + "..." : req.getContent();
        group.setLastMessageAt(msg.getCreatedAt());
        group.setLastMessagePreview(preview);
        groupRepo.save(group);

        HubMessageResponse response = toGroupMessageResponse(msg);
        wsController.sendGroupMessage(groupId, response);
        return response;
    }

    @Transactional
    public void deleteHubGroupMessage(String groupId, String msgId, String callerId) {
        requireHubGroupMember(groupId, callerId);
        HubGroupMessage msg = groupMsgRepo.findById(msgId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));
        if (!msg.getGroupId().equals(groupId)) {
            throw new IllegalArgumentException("Message not in this group");
        }
        if (!msg.getSenderId().equals(callerId)) {
            throw new SecurityException("You can only delete your own messages");
        }
        if (msg.getDeletedAt() != null) throw new IllegalStateException("Already deleted");

        long elapsed = Instant.now().getEpochSecond() - msg.getCreatedAt().getEpochSecond();
        if (elapsed > deleteWindowSeconds) throw new IllegalStateException("Delete window has passed");

        msg.setDeletedAt(Instant.now());
        msg.setContent("[deleted]");
        groupMsgRepo.save(msg);
        wsController.sendGroupMessageDeleted(groupId, msgId);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private HubConversation findDmSecure(String convId, String employeeId) {
        HubConversation conv = dmRepo.findById(convId)
                .orElseThrow(() -> new IllegalArgumentException("Conversation not found"));
        if (!conv.getEmployee1Id().equals(employeeId) && !conv.getEmployee2Id().equals(employeeId)) {
            throw new SecurityException("Access denied to this conversation");
        }
        return conv;
    }

    private void requireHubGroupMember(String groupId, String employeeId) {
        if (!groupMemberRepo.existsByGroupIdAndEmployeeId(groupId, employeeId)) {
            throw new SecurityException("You are not a member of this group");
        }
    }

    private void addGroupMemberInternal(String groupId, String employeeId, String employeeName) {
        groupMemberRepo.save(HubGroupMember.builder()
                .id(UUID.randomUUID().toString())
                .groupId(groupId)
                .employeeId(employeeId)
                .employeeName(employeeName)
                .build());
    }

    private HubConversationResponse toDmResponse(HubConversation c, String callerId, String otherName) {
        String otherId = c.getEmployee1Id().equals(callerId)
                ? c.getEmployee2Id() : c.getEmployee1Id();
        int unread = c.getEmployee1Id().equals(callerId)
                ? c.getEmployee1Unread() : c.getEmployee2Unread();
        return HubConversationResponse.builder()
                .id(c.getId())
                .otherEmployeeId(otherId)
                .otherEmployeeName(otherName)
                .lastMessageAt(c.getLastMessageAt())
                .lastMessagePreview(c.getLastMessagePreview())
                .unreadCount(unread)
                .build();
    }

    private HubGroupResponse toGroupResponse(HubGroup g) {
        return HubGroupResponse.builder()
                .id(g.getId())
                .name(g.getName())
                .description(g.getDescription())
                .memberCount(g.getMemberCount())
                .createdBy(g.getCreatedBy())
                .createdByName(g.getCreatedByName())
                .lastMessageAt(g.getLastMessageAt())
                .lastMessagePreview(g.getLastMessagePreview())
                .createdAt(g.getCreatedAt())
                .build();
    }

    private HubMessageResponse toDmMessageResponse(HubConversationMessage m) {
        return HubMessageResponse.builder()
                .id(m.getId())
                .conversationId(m.getConversationId())
                .senderId(m.getSenderId())
                .senderName(m.getSenderName())
                .content(m.getDeletedAt() != null ? "This message was deleted" : m.getContent())
                .clientMessageId(m.getClientMessageId())
                .deleted(m.getDeletedAt() != null)
                .createdAt(m.getCreatedAt())
                .build();
    }

    private HubMessageResponse toGroupMessageResponse(HubGroupMessage m) {
        return HubMessageResponse.builder()
                .id(m.getId())
                .groupId(m.getGroupId())
                .senderId(m.getSenderId())
                .senderName(m.getSenderName())
                .content(m.getDeletedAt() != null ? "This message was deleted" : m.getContent())
                .clientMessageId(m.getClientMessageId())
                .deleted(m.getDeletedAt() != null)
                .createdAt(m.getCreatedAt())
                .build();
    }
}
