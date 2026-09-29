package com.chitfund.supportservice.security;

import com.chitfund.supportservice.domain.entity.SupportTicket;
import com.chitfund.supportservice.repository.ChatGroupMemberRepository;
import com.chitfund.supportservice.repository.ChatGroupRepository;
import com.chitfund.supportservice.repository.ConversationRepository;
import com.chitfund.supportservice.repository.HubConversationRepository;
import com.chitfund.supportservice.repository.HubGroupMemberRepository;
import com.chitfund.supportservice.repository.SupportTicketRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WsAuthorizationServiceTest {
    @Mock ConversationRepository conversationRepo;
    @Mock SupportTicketRepository ticketRepo;
    @Mock ChatGroupRepository groupRepo;
    @Mock ChatGroupMemberRepository groupMemberRepo;
    @Mock HubConversationRepository hubConvRepo;
    @Mock HubGroupMemberRepository hubGroupMemberRepo;
    @InjectMocks WsAuthorizationService service;

    @Test
    void memberCannotSubscribeToAnotherMembersTicketInSameTenant() {
        when(ticketRepo.findById("ticket-1")).thenReturn(Optional.of(ticket("member-2")));

        assertThat(service.canSubscribeToTicket(
                "ticket-1", "tenant-1", "member-1", "MEMBER", false)).isFalse();
    }

    @Test
    void memberCanSubscribeToOwnTicket() {
        when(ticketRepo.findById("ticket-1")).thenReturn(Optional.of(ticket("member-1")));

        assertThat(service.canSubscribeToTicket(
                "ticket-1", "tenant-1", "member-1", "MEMBER", false)).isTrue();
    }

    @Test
    void missingTenantDoesNotGrantHubAccess() {
        assertThat(service.canSubscribeToPool(false)).isFalse();
        assertThat(service.canSubscribeToTicket(
                "ticket-1", null, "user-1", "ADMIN", false)).isFalse();
    }

    private SupportTicket ticket(String createdBy) {
        return SupportTicket.builder()
                .id("ticket-1")
                .tenantId("tenant-1")
                .createdBy(createdBy)
                .build();
    }
}
