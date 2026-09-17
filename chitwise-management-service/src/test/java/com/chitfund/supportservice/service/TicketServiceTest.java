package com.chitfund.supportservice.service;

import com.chitfund.supportservice.client.TenantSupportClient;
import com.chitfund.supportservice.domain.entity.SupportTicket;
import com.chitfund.supportservice.domain.entity.TicketNumberSeq;
import com.chitfund.supportservice.domain.enums.*;
import com.chitfund.supportservice.dto.request.CreatePublicInquiryRequest;
import com.chitfund.supportservice.dto.request.CreateTicketRequest;
import com.chitfund.supportservice.repository.*;
import com.chitfund.supportservice.websocket.TicketWebSocketController;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Year;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TicketServiceTest {
    @Mock SupportTicketRepository ticketRepository;
    @Mock TicketMessageRepository messageRepository;
    @Mock TicketAssignmentRepository assignmentRepository;
    @Mock TicketWebSocketController wsController;
    @Mock TicketNumberSeqRepository seqRepository;
    @Mock TenantSupportClient tenantSupportClient;
    @InjectMocks TicketService ticketService;

    @BeforeEach
    void wireSelf() {
        ReflectionTestUtils.setField(ticketService, "self", ticketService);
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
    }

    private void stubSequence() {
        TicketNumberSeq sequence = TicketNumberSeq.builder()
                .year(Year.now().getValue()).lastVal(1).build();
        when(seqRepository.findByYearForUpdate(Year.now().getValue()))
                .thenReturn(Optional.of(sequence));
    }
}
