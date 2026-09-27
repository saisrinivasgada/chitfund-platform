package com.chitfund.supportservice.controller;

import com.chitfund.supportservice.client.TenantSupportClient;
import com.chitfund.supportservice.dto.request.AddGroupMemberRequest;
import com.chitfund.supportservice.dto.request.CreateGroupRequest;
import com.chitfund.supportservice.dto.request.SendChatMessageRequest;
import com.chitfund.supportservice.dto.request.SendGroupMessageRequest;
import com.chitfund.supportservice.dto.request.StartConversationRequest;
import com.chitfund.supportservice.service.ConversationService;
import com.chitfund.supportservice.service.GroupChatService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ChatCapabilityEnforcementTest {

    @Test
    void unverifiedCapabilityBlocksEveryGroupChatMutation() {
        GroupChatService service = mock(GroupChatService.class);
        TenantSupportClient client = mock(TenantSupportClient.class);
        GroupChatController controller = new GroupChatController(service, client);
        HttpServletRequest admin = request("ADMIN");
        when(client.getCapabilities("tenant-a")).thenReturn(null);

        assertEquals(HttpStatus.FORBIDDEN, controller.createGroup(admin, new CreateGroupRequest()).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, controller.addMember(admin, "group-1", new AddGroupMemberRequest()).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, controller.removeMember(admin, "group-1", "member-1").getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, controller.sendMessage(admin, "group-1", new SendGroupMessageRequest()).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, controller.deleteMessage(admin, "group-1", "message-1").getStatusCode());
        verifyNoInteractions(service);
    }

    @Test
    void unverifiedCapabilityBlocksEveryConversationCreationOrContentMutation() {
        ConversationService service = mock(ConversationService.class);
        TenantSupportClient client = mock(TenantSupportClient.class);
        OrgConversationController controller = new OrgConversationController(service, client);
        HttpServletRequest admin = request("ADMIN");
        HttpServletRequest member = request("MEMBER");
        when(client.getCapabilities("tenant-a")).thenReturn(null);

        assertEquals(HttpStatus.FORBIDDEN, controller.startConversation(admin, new StartConversationRequest()).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, controller.myConversation(member).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, controller.sendMessage(member, "conversation-1", new SendChatMessageRequest()).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, controller.deleteMessage(member, "conversation-1", "message-1").getStatusCode());
        verifyNoInteractions(service);
    }

    private HttpServletRequest request(String role) {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getHeader("X-User-Id")).thenReturn("user-1");
        when(request.getHeader("X-User-Role")).thenReturn(role);
        when(request.getHeader("X-Tenant-Id")).thenReturn("tenant-a");
        when(request.getHeader("X-User-Name")).thenReturn("Test User");
        return request;
    }
}
