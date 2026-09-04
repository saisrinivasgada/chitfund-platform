package com.chitfund.supportservice.service;

import com.chitfund.supportservice.domain.entity.Conversation;
import com.chitfund.supportservice.domain.entity.ConversationMessage;
import com.chitfund.supportservice.dto.request.SendChatMessageRequest;
import com.chitfund.supportservice.dto.request.StartConversationRequest;
import com.chitfund.supportservice.dto.response.ChatMessageResponse;
import com.chitfund.supportservice.dto.response.ConversationResponse;
import com.chitfund.supportservice.dto.response.PagedResponse;
import com.chitfund.supportservice.repository.ConversationMessageRepository;
import com.chitfund.supportservice.repository.ConversationRepository;
import com.chitfund.supportservice.websocket.ConversationWebSocketController;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ConversationService {

    private final ConversationRepository conversationRepo;
    private final ConversationMessageRepository messageRepo;
    private final ConversationWebSocketController wsController;

    @Value("${app.message-delete-window-seconds:300}")
    private long deleteWindowSeconds;

    // ── Conversation management ───────────────────────────────────────────────

    /**
     * Idempotent: returns existing conversation if one already exists for this member+tenant pair.
     * Admin/Manager calls this to open a chat with a specific member.
     */
    @Transactional
    @Caching(evict = {
        @CacheEvict(value = "convList",   key = "#tenantId"),
        @CacheEvict(value = "convUnread", key = "#tenantId + ':admin'")
    })
    public ConversationResponse startOrGetConversation(String tenantId, String userId,
                                                        StartConversationRequest req) {
        Conversation conv = conversationRepo
                .findByTenantIdAndMemberId(tenantId, req.getMemberId())
                .orElseGet(() -> {
                    Conversation c = Conversation.builder()
                            .id(UUID.randomUUID().toString())
                            .tenantId(tenantId)
                            .memberId(req.getMemberId())
                            .memberName(req.getMemberName())
                            .build();
                    return conversationRepo.save(c);
                });
        return toResponse(conv, false);
    }

    /**
     * Member calls this to get or create their own conversation with the org.
     */
    @Transactional
    @CacheEvict(value = "convList", key = "#tenantId")
    public ConversationResponse getOrCreateMemberConversation(String tenantId, String memberId,
                                                               String memberName) {
        Conversation conv = conversationRepo
                .findByTenantIdAndMemberId(tenantId, memberId)
                .orElseGet(() -> conversationRepo.save(Conversation.builder()
                        .id(UUID.randomUUID().toString())
                        .tenantId(tenantId)
                        .memberId(memberId)
                        .memberName(memberName)
                        .build()));
        return toResponse(conv, true);
    }

    /** Admin/Manager: paginated list of all conversations in the org, ordered by most recent. */
    @Transactional(readOnly = true)
    @Cacheable(value = "convList", key = "#tenantId")
    public PagedResponse<ConversationResponse> listConversations(String tenantId, int page, int size) {
        size = Math.min(size, 50);
        List<Conversation> convs = conversationRepo.findByTenantIdOrderByLastMessageAtDesc(
                tenantId, PageRequest.of(page, size));
        return PagedResponse.<ConversationResponse>builder()
                .items(convs.stream().map(c -> toResponse(c, false)).toList())
                .page(page)
                .size(size)
                .hasNext(convs.size() == size)
                .build();
    }

    // ── Unread counts (cached for the sidebar badge) ──────────────────────────

    @Cacheable(value = "convUnread", key = "#tenantId + ':admin'")
    public long getAdminUnreadTotal(String tenantId) {
        return conversationRepo.sumAdminUnreadForTenant(tenantId);
    }

    @Cacheable(value = "convUnread", key = "#tenantId + ':member:' + #memberId")
    public long getMemberUnreadTotal(String tenantId, String memberId) {
        return conversationRepo.getMemberUnread(memberId, tenantId).orElse(0L);
    }

    // ── Messages ──────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PagedResponse<ChatMessageResponse> getMessages(String conversationId, String tenantId,
                                                           String userId, boolean isMember,
                                                           String cursor, int limit) {
        Conversation conv = findConvSecure(conversationId, tenantId, userId, isMember);
        limit = Math.min(limit, 50);

        List<ConversationMessage> msgs = cursor != null
                ? messageRepo.findBeforeCursor(conv.getId(), Instant.parse(cursor),
                        PageRequest.of(0, limit))
                : messageRepo.findByConversationIdOrderByCreatedAtDesc(
                        conv.getId(), PageRequest.of(0, limit));

        String nextCursor = msgs.size() == limit
                ? msgs.get(msgs.size() - 1).getCreatedAt().toString()
                : null;

        return PagedResponse.<ChatMessageResponse>builder()
                .items(msgs.stream().map(this::toMessageResponse).toList())
                .hasNext(nextCursor != null)
                .nextCursor(nextCursor)
                .build();
    }

    /**
     * Idempotent send: if clientMessageId already exists, returns the original message.
     * This makes client retries safe — no duplicates even on network failure.
     */
    @Transactional
    @Caching(evict = {
        @CacheEvict(value = "convList",   key = "#tenantId"),
        @CacheEvict(value = "convUnread", key = "#tenantId + ':admin'"),
        @CacheEvict(value = "convUnread", key = "#tenantId + ':member:' + #senderId")
    })
    public ChatMessageResponse sendMessage(String conversationId, String tenantId,
                                            String senderId, String senderName,
                                            String senderRole, boolean isMember,
                                            SendChatMessageRequest req) {
        Conversation conv = findConvSecure(conversationId, tenantId, senderId, isMember);

        // Idempotency check — scoped to (conversationId, senderId, clientMessageId)
        // so user A's clientMessageId cannot collide with user B's
        if (req.getClientMessageId() != null) {
            var existing = messageRepo.findByConversationIdAndSenderIdAndClientMessageId(
                    conv.getId(), senderId, req.getClientMessageId());
            if (existing.isPresent()) {
                return toMessageResponse(existing.get());
            }
        }

        boolean isAdmin = !isMember;
        ConversationMessage msg = ConversationMessage.builder()
                .id(UUID.randomUUID().toString())
                .conversationId(conv.getId())
                .senderId(senderId)
                .senderName(senderName)
                .senderRole(senderRole)
                .content(req.getContent())
                .clientMessageId(req.getClientMessageId())
                .build();

        msg = messageRepo.save(msg);

        // Update conversation metadata and unread counters atomically
        String preview = req.getContent().length() > 197
                ? req.getContent().substring(0, 197) + "..."
                : req.getContent();
        conv.setLastMessageAt(msg.getCreatedAt());
        conv.setLastMessagePreview(preview);
        conv.setLastMessageIsAdmin(isAdmin);
        conversationRepo.save(conv);

        // Atomic increment avoids lost-update race condition under concurrent sends
        if (isAdmin) {
            conversationRepo.incrementMemberUnread(conv.getId());
        } else {
            conversationRepo.incrementAdminUnread(conv.getId());
        }
        // Re-fetch for accurate counts to broadcast
        conv = conversationRepo.findById(conv.getId()).orElse(conv);

        ChatMessageResponse response = toMessageResponse(msg);
        wsController.sendChatMessage(conv.getId(), response);
        wsController.sendUnreadUpdate(conv.getId(), conv.getAdminUnread(), conv.getMemberUnread());

        return response;
    }

    @Transactional
    @Caching(evict = {
        @CacheEvict(value = "convUnread", key = "#tenantId + ':admin'"),
        @CacheEvict(value = "convUnread", key = "#tenantId + ':member:' + #userId")
    })
    public void softDeleteMessage(String conversationId, String messageId,
                                   String tenantId, String userId, boolean isMember) {
        findConvSecure(conversationId, tenantId, userId, isMember);
        ConversationMessage msg = messageRepo.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));

        if (!msg.getConversationId().equals(conversationId)) {
            throw new IllegalArgumentException("Message not in this conversation");
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
        wsController.sendMessageDeleted(conversationId, messageId);
    }

    @Transactional
    @Caching(evict = {
        @CacheEvict(value = "convUnread", key = "#tenantId + ':admin'"),
        @CacheEvict(value = "convUnread", key = "#tenantId + ':member:' + #userId")
    })
    public void markRead(String conversationId, String tenantId, String userId, boolean isMember) {
        Conversation conv = findConvSecure(conversationId, tenantId, userId, isMember);
        if (isMember) {
            conversationRepo.clearMemberUnread(conv.getId());
        } else {
            conversationRepo.clearAdminUnread(conv.getId());
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Conversation findConvSecure(String convId, String tenantId, String userId, boolean isMember) {
        Conversation conv = conversationRepo.findById(convId)
                .orElseThrow(() -> new IllegalArgumentException("Conversation not found"));
        if (!conv.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("Conversation not found");
        }
        if (isMember && !conv.getMemberId().equals(userId)) {
            throw new IllegalArgumentException("Conversation not found");
        }
        return conv;
    }

    private ConversationResponse toResponse(Conversation c, boolean isMember) {
        return ConversationResponse.builder()
                .id(c.getId())
                .tenantId(c.getTenantId())
                .memberId(c.getMemberId())
                .memberName(c.getMemberName())
                .lastMessageAt(c.getLastMessageAt())
                .lastMessagePreview(c.getLastMessagePreview())
                .lastMessageIsAdmin(c.isLastMessageIsAdmin())
                .adminUnread(c.getAdminUnread())
                .memberUnread(c.getMemberUnread())
                .myUnread(isMember ? c.getMemberUnread() : c.getAdminUnread())
                .createdAt(c.getCreatedAt())
                .build();
    }

    private ChatMessageResponse toMessageResponse(ConversationMessage m) {
        return ChatMessageResponse.builder()
                .id(m.getId())
                .conversationId(m.getConversationId())
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
