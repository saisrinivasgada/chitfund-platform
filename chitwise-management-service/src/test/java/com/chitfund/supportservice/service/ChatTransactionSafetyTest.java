package com.chitfund.supportservice.service;

import com.chitfund.supportservice.domain.entity.ChatGroup;
import com.chitfund.supportservice.domain.entity.ChatGroupMessage;
import com.chitfund.supportservice.domain.entity.Conversation;
import com.chitfund.supportservice.domain.entity.ConversationMessage;
import com.chitfund.supportservice.domain.entity.HubConversation;
import com.chitfund.supportservice.domain.entity.HubConversationMessage;
import com.chitfund.supportservice.dto.request.SendChatMessageRequest;
import com.chitfund.supportservice.dto.request.SendGroupMessageRequest;
import com.chitfund.supportservice.dto.request.SendHubMessageRequest;
import com.chitfund.supportservice.repository.ChatGroupMemberRepository;
import com.chitfund.supportservice.repository.ChatGroupMessageRepository;
import com.chitfund.supportservice.repository.ChatGroupRepository;
import com.chitfund.supportservice.repository.ConversationMessageRepository;
import com.chitfund.supportservice.repository.ConversationRepository;
import com.chitfund.supportservice.repository.EmployeeRepository;
import com.chitfund.supportservice.repository.HubConversationMessageRepository;
import com.chitfund.supportservice.repository.HubConversationRepository;
import com.chitfund.supportservice.repository.HubGroupMemberRepository;
import com.chitfund.supportservice.repository.HubGroupMessageRepository;
import com.chitfund.supportservice.repository.HubGroupRepository;
import com.chitfund.supportservice.websocket.ConversationWebSocketController;
import com.chitfund.supportservice.websocket.GroupChatWebSocketController;
import com.chitfund.supportservice.websocket.HubChatWebSocketController;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatTransactionSafetyTest {

    @Mock ConversationRepository conversationRepository;
    @Mock ConversationMessageRepository conversationMessageRepository;
    @Mock ConversationWebSocketController conversationWebSocketController;
    @InjectMocks ConversationService conversationService;

    @Mock ChatGroupRepository chatGroupRepository;
    @Mock ChatGroupMemberRepository chatGroupMemberRepository;
    @Mock ChatGroupMessageRepository chatGroupMessageRepository;
    @Mock GroupChatWebSocketController groupChatWebSocketController;
    @InjectMocks GroupChatService groupChatService;

    @Mock HubConversationRepository hubConversationRepository;
    @Mock HubConversationMessageRepository hubConversationMessageRepository;
    @Mock HubGroupRepository hubGroupRepository;
    @Mock HubGroupMemberRepository hubGroupMemberRepository;
    @Mock HubGroupMessageRepository hubGroupMessageRepository;
    @Mock EmployeeRepository employeeRepository;
    @Mock HubChatWebSocketController hubChatWebSocketController;
    @InjectMocks HubChatService hubChatService;

    @AfterEach
    void clearTransactionSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    void organizationConversationPublishesOnlyAfterCommit() {
        stubConversationSend();
        beginTransactionSynchronization();

        conversationService.sendMessage("conversation-1", "tenant-1", "admin-1",
                "Admin", "ADMIN", false, chatRequest());

        verify(conversationWebSocketController, never()).sendChatMessage(any(), any());
        commitCallbacks();
        verify(conversationWebSocketController).sendChatMessage(eq("conversation-1"), any());
        verify(conversationWebSocketController).sendUnreadUpdate("conversation-1", 0, 0);
    }

    @Test
    void organizationConversationPublishesNothingAfterRollback() {
        stubConversationSend();
        beginTransactionSynchronization();

        conversationService.sendMessage("conversation-1", "tenant-1", "admin-1",
                "Admin", "ADMIN", false, chatRequest());

        verify(conversationWebSocketController, never()).sendChatMessage(any(), any());
        verify(conversationWebSocketController, never()).sendUnreadUpdate(any(), anyInt(), anyInt());
    }

    @Test
    void organizationGroupPublishesOnlyAfterCommit() {
        stubGroupSend();
        beginTransactionSynchronization();

        groupChatService.sendMessage("group-1", "tenant-1", "admin-1",
                "Admin", "ADMIN", groupRequest());

        verify(groupChatWebSocketController, never()).sendGroupMessage(any(), any());
        commitCallbacks();
        verify(groupChatWebSocketController).sendGroupMessage(eq("group-1"), any());
    }

    @Test
    void organizationGroupPublishesNothingAfterRollback() {
        stubGroupSend();
        beginTransactionSynchronization();

        groupChatService.sendMessage("group-1", "tenant-1", "admin-1",
                "Admin", "ADMIN", groupRequest());

        verify(groupChatWebSocketController, never()).sendGroupMessage(any(), any());
    }

    @Test
    void hubDmPublishesOnlyAfterCommit() {
        stubHubDmSend();
        beginTransactionSynchronization();

        hubChatService.sendDmMessage("hub-conversation-1", "employee-1", "Employee",
                hubRequest());

        verify(hubChatWebSocketController, never()).sendDmMessage(any(), any());
        commitCallbacks();
        verify(hubChatWebSocketController).sendDmMessage(eq("hub-conversation-1"), any());
    }

    @Test
    void hubDmPublishesNothingAfterRollback() {
        stubHubDmSend();
        beginTransactionSynchronization();

        hubChatService.sendDmMessage("hub-conversation-1", "employee-1", "Employee",
                hubRequest());

        verify(hubChatWebSocketController, never()).sendDmMessage(any(), any());
    }

    @Test
    void malformedCursorsAreRejectedAsClientErrors() {
        Conversation conversation = conversation();
        when(conversationRepository.findById("conversation-1")).thenReturn(Optional.of(conversation));

        assertThatThrownBy(() -> conversationService.getMessages(
                "conversation-1", "tenant-1", "admin-1", false, "not-an-instant", 50))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Invalid message cursor");
    }

    private void stubConversationSend() {
        Conversation conversation = conversation();
        when(conversationRepository.findById("conversation-1")).thenReturn(Optional.of(conversation));
        when(conversationMessageRepository.save(any())).thenAnswer(invocation -> {
            ConversationMessage message = invocation.getArgument(0);
            message.setCreatedAt(Instant.parse("2026-09-30T12:00:00Z"));
            return message;
        });
        when(conversationRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private Conversation conversation() {
        return Conversation.builder().id("conversation-1").tenantId("tenant-1")
                .memberId("member-1").memberName("Member One").build();
    }

    private SendChatMessageRequest chatRequest() {
        SendChatMessageRequest request = new SendChatMessageRequest();
        request.setContent("Committed message");
        return request;
    }

    private void stubGroupSend() {
        ChatGroup group = ChatGroup.builder().id("group-1").tenantId("tenant-1")
                .name("Operations").createdBy("admin-1").createdByName("Admin").build();
        when(chatGroupRepository.findByIdAndTenantId("group-1", "tenant-1"))
                .thenReturn(Optional.of(group));
        when(chatGroupMemberRepository.existsByGroupIdAndUserId("group-1", "admin-1"))
                .thenReturn(true);
        when(chatGroupMessageRepository.save(any())).thenAnswer(invocation -> {
            ChatGroupMessage message = invocation.getArgument(0);
            message.setCreatedAt(Instant.parse("2026-09-30T12:00:00Z"));
            return message;
        });
        when(chatGroupRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private SendGroupMessageRequest groupRequest() {
        SendGroupMessageRequest request = new SendGroupMessageRequest();
        request.setContent("Committed group message");
        return request;
    }

    private void stubHubDmSend() {
        HubConversation conversation = HubConversation.builder().id("hub-conversation-1")
                .employee1Id("employee-1").employee2Id("employee-2").build();
        when(hubConversationRepository.findById("hub-conversation-1"))
                .thenReturn(Optional.of(conversation));
        when(hubConversationMessageRepository.save(any())).thenAnswer(invocation -> {
            HubConversationMessage message = invocation.getArgument(0);
            message.setCreatedAt(Instant.parse("2026-09-30T12:00:00Z"));
            return message;
        });
    }

    private SendHubMessageRequest hubRequest() {
        SendHubMessageRequest request = new SendHubMessageRequest();
        request.setContent("Committed Hub message");
        return request;
    }

    private void beginTransactionSynchronization() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
    }

    private void commitCallbacks() {
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(synchronization -> synchronization.afterCommit());
    }
}
