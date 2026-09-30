package com.chitfund.supportservice.service;

import com.chitfund.supportservice.client.TenantSupportClient;
import com.chitfund.supportservice.client.AuditClient;
import com.chitfund.supportservice.domain.entity.SupportTicket;
import com.chitfund.supportservice.domain.entity.TicketNumberSeq;
import com.chitfund.supportservice.domain.entity.Employee;
import com.chitfund.supportservice.domain.enums.*;
import com.chitfund.supportservice.dto.request.AssignTicketRequest;
import com.chitfund.supportservice.dto.request.CreatePublicInquiryRequest;
import com.chitfund.supportservice.dto.request.CreateTicketRequest;
import com.chitfund.supportservice.dto.request.SendMessageRequest;
import com.chitfund.supportservice.dto.request.UpdateStatusRequest;
import com.chitfund.supportservice.repository.*;
import com.chitfund.supportservice.websocket.TicketWebSocketController;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Year;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.ArgumentMatchers.eq;

@ExtendWith(MockitoExtension.class)
class TicketServiceTest {
    @Mock SupportTicketRepository ticketRepository;
    @Mock TicketMessageRepository messageRepository;
    @Mock TicketAssignmentRepository assignmentRepository;
    @Mock TicketWebSocketController wsController;
    @Mock TicketNumberSeqRepository seqRepository;
    @Mock TenantSupportClient tenantSupportClient;
    @Mock IdentityCaseService identityCaseService;
    @Mock AuditClient auditClient;
    @InjectMocks TicketService ticketService;

    @BeforeEach
    void wireSelf() {
        ReflectionTestUtils.setField(ticketService, "self", ticketService);
    }

    @AfterEach
    void clearTransactionSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    void organizationPriorityIsSnapshottedFromTrustedPlanEntitlement() {
        stubSequence();
        when(tenantSupportClient.getSupportContext("tenant-1"))
                .thenReturn(new TenantSupportClient.SupportContext("Acme Chits", true));
        when(ticketRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        CreateTicketRequest request = new CreateTicketRequest();
        request.setType(TicketType.PAYMENT);
        request.setSubject("Payment allocation is incorrect");
        request.setDescription("Please investigate this allocation.");
        request.setPreferredContact("EMAIL");

        var result = ticketService.createTicket("user-1", "Org Admin", "tenant-1", request);

        assertThat(result.getPriority()).isEqualTo(TicketPriority.HIGH);
        assertThat(result.getSource()).isEqualTo(TicketSource.ORGANIZATION);
        assertThat(result.getTenantName()).isEqualTo("Acme Chits");
        assertThat(result.getPreferredContact()).isEqualTo("EMAIL");
        verify(auditClient).log(eq(result.getId()), eq("CREATED"), eq("user-1"),
                eq("ORG_USER"), org.mockito.ArgumentMatchers.isNull(), any(), any(),
                eq("tenant-1"), org.mockito.ArgumentMatchers.isNull());
    }

    @Test
    void publicInquiryCanNeverBecomePriority() {
        stubSequence();
        when(ticketRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        CreatePublicInquiryRequest request = new CreatePublicInquiryRequest();
        request.setName("Prospect User");
        request.setEmail("prospect@example.com");
        request.setPhone("9999999999");
        request.setMessage("I would like a product demonstration.");
        request.setPreferredContact("EMAIL");

        var result = ticketService.createPublicInquiry(request);

        assertThat(result.getType()).isEqualTo(TicketType.INQUIRY);
        assertThat(result.getSource()).isEqualTo(TicketSource.PUBLIC);
        assertThat(result.getPriority()).isEqualTo(TicketPriority.NORMAL);
        assertThat(result.getTenantId()).isNull();
        assertThat(result.getRequesterEmail()).isEqualTo("prospect@example.com");
        verify(auditClient).log(eq(result.getId()), eq("CREATED"),
                org.mockito.ArgumentMatchers.isNull(), eq("PUBLIC"),
                org.mockito.ArgumentMatchers.isNull(), any(), any(), eq("PLATFORM"),
                org.mockito.ArgumentMatchers.isNull());
    }

    @Test
    void memberMessageDoesNotMasqueradeAsFirstSupportResponse() {
        SupportTicket ticket = SupportTicket.builder()
                .id("ticket-1")
                .ticketNumber("CW-2026-0001")
                .type(TicketType.ACCOUNT)
                .source(TicketSource.ORGANIZATION)
                .tenantId("tenant-1")
                .createdBy("member-1")
                .createdByName("Member")
                .subject("Account access")
                .priority(TicketPriority.NORMAL)
                .status(TicketStatus.OPEN)
                .build();
        when(ticketRepository.findById("ticket-1")).thenReturn(Optional.of(ticket));
        when(messageRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        SendMessageRequest request = new SendMessageRequest();
        request.setContent("I have more information.");

        ticketService.sendMessage("ticket-1", "tenant-1", false,
                "member-1", "Member", SenderType.ORG_MEMBER, request);

        assertThat(ticket.getFirstResponseAt()).isNull();
        assertThat(ticket.getStatus()).isEqualTo(TicketStatus.OPEN);
        verify(ticketRepository, never()).save(ticket);
        verify(auditClient).log(eq("ticket-1"), eq("MESSAGE_SENT"), eq("member-1"),
                eq("ORG_MEMBER"), org.mockito.ArgumentMatchers.isNull(), any(), any(),
                eq("tenant-1"), org.mockito.ArgumentMatchers.isNull());
    }

    @Test
    void memberCannotReadAnotherUsersTicketInTheSameTenant() {
        SupportTicket ticket = ticket("ticket-1", "tenant-1", "member-2");
        when(ticketRepository.findById("ticket-1")).thenReturn(Optional.of(ticket));

        assertThatThrownBy(() -> ticketService.getTicket(
                "ticket-1", "tenant-1", false, "member-1", true))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Ticket not found");
    }

    @Test
    void memberCannotPostToAnotherUsersTicketInTheSameTenant() {
        SupportTicket ticket = ticket("ticket-1", "tenant-1", "member-2");
        when(ticketRepository.findById("ticket-1")).thenReturn(Optional.of(ticket));
        SendMessageRequest request = new SendMessageRequest();
        request.setContent("This must not be accepted.");

        assertThatThrownBy(() -> ticketService.sendMessage(
                "ticket-1", "tenant-1", false,
                "member-1", "Member One", SenderType.ORG_MEMBER, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Ticket not found");
        verify(messageRepository, never()).save(any());
    }

    @Test
    void organizationAdminCanReadAnyTicketWithinTheirTenant() {
        SupportTicket ticket = ticket("ticket-1", "tenant-1", "member-2");
        when(ticketRepository.findById("ticket-1")).thenReturn(Optional.of(ticket));

        var result = ticketService.getTicket(
                "ticket-1", "tenant-1", false, "admin-1", false);

        assertThat(result.getId()).isEqualTo("ticket-1");
    }

    @Test
    void assignmentAuditRecordsTheRealSupportAgentRole() {
        SupportTicket ticket = ticket("ticket-1", "tenant-1", "member-2");
        EmployeeService employeeService = org.mockito.Mockito.mock(EmployeeService.class);
        Employee assignee = Employee.builder().id("agent-2").fullName("Agent Two")
                .email("agent2@example.com").username("agent-two")
                .role("SUPPORT_AGENT").active(true).build();
        AssignTicketRequest request = new AssignTicketRequest();
        request.setAssigneeId("agent-2");
        request.setNote("Payment specialist");
        when(ticketRepository.findById("ticket-1")).thenReturn(Optional.of(ticket));
        when(employeeService.getById("agent-2")).thenReturn(assignee);
        when(ticketRepository.save(ticket)).thenReturn(ticket);
        when(assignmentRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ticketService.assignTicket(
                "ticket-1", "agent-1", "SUPPORT_AGENT", request, employeeService);

        verify(auditClient).log(eq("ticket-1"), eq("ASSIGNED"), eq("agent-1"),
                eq("SUPPORT_AGENT"), any(), any(), any(), eq("tenant-1"),
                eq("Payment specialist"));
    }

    @Test
    void modifiedClientCannotMoveInProgressTicketBackToOpen() {
        SupportTicket ticket = ticket("ticket-1", "tenant-1", "member-2");
        ticket.setStatus(TicketStatus.IN_PROGRESS);
        UpdateStatusRequest request = new UpdateStatusRequest();
        request.setStatus(TicketStatus.OPEN);
        when(ticketRepository.findById("ticket-1")).thenReturn(Optional.of(ticket));

        assertThatThrownBy(() -> ticketService.updateStatus(
                "ticket-1", request, "agent-1", "SUPPORT_AGENT"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("IN_PROGRESS to OPEN");

        verify(ticketRepository, never()).save(ticket);
        verify(auditClient, never()).log(eq("ticket-1"), eq("STATUS_CHANGED"),
                any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void authorizedReopenPathCanMoveResolvedTicketToInProgress() {
        SupportTicket ticket = ticket("ticket-1", "tenant-1", "member-2");
        ticket.setStatus(TicketStatus.RESOLVED);
        UpdateStatusRequest request = new UpdateStatusRequest();
        request.setStatus(TicketStatus.IN_PROGRESS);
        request.setNote("Customer supplied new evidence");
        when(ticketRepository.findById("ticket-1")).thenReturn(Optional.of(ticket));
        when(ticketRepository.save(ticket)).thenReturn(ticket);

        var response = ticketService.updateStatus(
                "ticket-1", request, "agent-1", "SUPPORT_AGENT");

        assertThat(response.getStatus()).isEqualTo(TicketStatus.IN_PROGRESS);
        verify(auditClient).log(eq("ticket-1"), eq("STATUS_CHANGED"), eq("agent-1"),
                eq("SUPPORT_AGENT"), any(), any(), any(), eq("tenant-1"),
                eq("Customer supplied new evidence"));
    }

    @Test
    void committedStatusChangePublishesWebSocketExactlyOnceAfterCommit() {
        SupportTicket ticket = ticket("ticket-1", "tenant-1", "member-2");
        UpdateStatusRequest request = new UpdateStatusRequest();
        request.setStatus(TicketStatus.IN_PROGRESS);
        when(ticketRepository.findById("ticket-1")).thenReturn(Optional.of(ticket));
        when(ticketRepository.save(ticket)).thenReturn(ticket);
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);

        ticketService.updateStatus("ticket-1", request, "agent-1", "SUPPORT_AGENT");

        verify(wsController, never()).notifyStatusChange(any(), any());
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(synchronization -> synchronization.afterCommit());
        verify(wsController).notifyStatusChange("ticket-1", "IN_PROGRESS");
    }

    @Test
    void rolledBackStatusChangePublishesNoWebSocketEvent() {
        SupportTicket ticket = ticket("ticket-1", "tenant-1", "member-2");
        UpdateStatusRequest request = new UpdateStatusRequest();
        request.setStatus(TicketStatus.IN_PROGRESS);
        when(ticketRepository.findById("ticket-1")).thenReturn(Optional.of(ticket));
        when(ticketRepository.save(ticket)).thenReturn(ticket);
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);

        ticketService.updateStatus("ticket-1", request, "agent-1", "SUPPORT_AGENT");

        // A rollback never invokes the registered afterCommit callback.
        verify(wsController, never()).notifyStatusChange(any(), any());
    }

    private SupportTicket ticket(String id, String tenantId, String createdBy) {
        return SupportTicket.builder()
                .id(id)
                .ticketNumber("CW-2026-0001")
                .type(TicketType.ACCOUNT)
                .source(TicketSource.ORGANIZATION)
                .tenantId(tenantId)
                .createdBy(createdBy)
                .createdByName("Member")
                .subject("Account access")
                .priority(TicketPriority.NORMAL)
                .status(TicketStatus.OPEN)
                .build();
    }

    private void stubSequence() {
        TicketNumberSeq sequence = TicketNumberSeq.builder()
                .year(Year.now().getValue()).lastVal(1).build();
        when(seqRepository.findByYearForUpdate(Year.now().getValue()))
                .thenReturn(Optional.of(sequence));
    }
}
