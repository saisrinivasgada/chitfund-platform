package com.chitfund.supportservice.service;

import com.chitfund.supportservice.domain.entity.SupportTicket;
import com.chitfund.supportservice.domain.entity.TicketAssignment;
import com.chitfund.supportservice.domain.entity.TicketMessage;
import com.chitfund.supportservice.domain.enums.SenderType;
import com.chitfund.supportservice.domain.enums.TicketStatus;
import com.chitfund.supportservice.dto.request.AssignTicketRequest;
import com.chitfund.supportservice.dto.request.CreateTicketRequest;
import com.chitfund.supportservice.dto.request.SendMessageRequest;
import com.chitfund.supportservice.dto.request.UpdateStatusRequest;
import com.chitfund.supportservice.dto.response.PagedResponse;
import com.chitfund.supportservice.dto.response.TicketMessageResponse;
import com.chitfund.supportservice.dto.response.TicketResponse;
import com.chitfund.supportservice.domain.entity.TicketNumberSeq;
import com.chitfund.supportservice.repository.SupportTicketRepository;
import com.chitfund.supportservice.repository.TicketAssignmentRepository;
import com.chitfund.supportservice.repository.TicketMessageRepository;
import com.chitfund.supportservice.repository.TicketNumberSeqRepository;
import com.chitfund.supportservice.websocket.TicketWebSocketController;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.Year;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class TicketService {

    private final SupportTicketRepository ticketRepository;
    private final TicketMessageRepository messageRepository;
    private final TicketAssignmentRepository assignmentRepository;
    private final TicketWebSocketController wsController;
    private final TicketNumberSeqRepository seqRepository;

    @Value("${app.message-delete-window-seconds:300}")
    private long deleteWindowSeconds;

    @Transactional
    public TicketResponse createTicket(String userId, String userName, String tenantId,
                                       CreateTicketRequest request) {
        String ticketNumber = generateTicketNumber();
        SupportTicket ticket = SupportTicket.builder()
                .id(UUID.randomUUID().toString())
                .ticketNumber(ticketNumber)
                .type(request.getType())
                .tenantId(tenantId)
                .createdBy(userId)
                .createdByName(userName)
                .subject(request.getSubject())
                .description(request.getDescription())
                .build();

        ticket = ticketRepository.save(ticket);

        wsController.notifyNewTicket(ticket);

        return toResponse(ticket, 0);
    }

    @Transactional(readOnly = true)
    public PagedResponse<TicketResponse> listForOrg(String tenantId, int page, int size) {
        Page<SupportTicket> tickets = ticketRepository.findByTenantIdOrderByCreatedAtDesc(
                tenantId, PageRequest.of(page, size));
        return toPagedResponse(tickets, tenantId);
    }

    @Transactional(readOnly = true)
    public PagedResponse<TicketResponse> listAll(int page, int size, TicketStatus status) {
        Page<SupportTicket> tickets = status != null
                ? ticketRepository.findByStatusOrderByCreatedAtDesc(status, PageRequest.of(page, size))
                : ticketRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(page, size));

        return PagedResponse.<TicketResponse>builder()
                .items(tickets.getContent().stream()
                        .map(t -> toResponse(t, countUnread(t.getId(), true)))
                        .toList())
                .page(tickets.getNumber())
                .size(tickets.getSize())
                .totalElements(tickets.getTotalElements())
                .totalPages(tickets.getTotalPages())
                .hasNext(tickets.hasNext())
                .build();
    }

    @Transactional(readOnly = true)
    public TicketResponse getTicket(String ticketId, String tenantId, boolean isHub) {
        SupportTicket ticket = findTicketSecure(ticketId, tenantId, isHub);
        return toResponse(ticket, countUnread(ticketId, isHub));
    }

    @Transactional(readOnly = true)
    public PagedResponse<TicketMessageResponse> getMessages(String ticketId, String tenantId,
                                                             boolean isHub, String cursor, int limit) {
        findTicketSecure(ticketId, tenantId, isHub);

        limit = Math.min(limit, 50);
        List<TicketMessage> messages;

        if (cursor != null) {
            Instant before = Instant.parse(cursor);
            messages = messageRepository.findByTicketIdAndCreatedAtBeforeOrderByCreatedAtDesc(
                    ticketId, before, PageRequest.of(0, limit));
        } else {
            Page<TicketMessage> page = messageRepository.findByTicketIdOrderByCreatedAtDesc(
                    ticketId, PageRequest.of(0, limit));
            messages = page.getContent();
        }

        String nextCursor = messages.size() == limit
                ? messages.get(messages.size() - 1).getCreatedAt().toString()
                : null;

        return PagedResponse.<TicketMessageResponse>builder()
                .items(messages.stream().map(this::toMessageResponse).toList())
                .hasNext(nextCursor != null)
                .nextCursor(nextCursor)
                .build();
    }

    @Transactional
    public TicketMessageResponse sendMessage(String ticketId, String tenantId, boolean isHub,
                                              String senderId, String senderName,
                                              SenderType senderType, SendMessageRequest request) {
        SupportTicket ticket = findTicketSecure(ticketId, tenantId, isHub);

        if (ticket.getStatus() == TicketStatus.CLOSED || ticket.getStatus() == TicketStatus.RESOLVED) {
            throw new IllegalStateException("Cannot message on a " + ticket.getStatus().name().toLowerCase() + " ticket");
        }

        if (senderType != SenderType.ORG_ADMIN && ticket.getFirstResponseAt() == null) {
            ticket.setFirstResponseAt(Instant.now());
            ticket.setStatus(TicketStatus.IN_PROGRESS);
            ticketRepository.save(ticket);
        }

        TicketMessage message = TicketMessage.builder()
                .id(UUID.randomUUID().toString())
                .ticketId(ticketId)
                .senderId(senderId)
                .senderType(senderType)
                .senderName(senderName)
                .content(request.getContent())
                .build();

        message = messageRepository.save(message);
        TicketMessageResponse response = toMessageResponse(message);
        wsController.sendTicketMessage(ticketId, response);

        return response;
    }

    @Transactional
    public void softDeleteMessage(String ticketId, String messageId, String senderId,
                                   String tenantId, boolean isHub) {
        findTicketSecure(ticketId, tenantId, isHub);

        TicketMessage message = messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));

        if (!message.getTicketId().equals(ticketId)) {
            throw new IllegalArgumentException("Message does not belong to this ticket");
        }

        if (!message.getSenderId().equals(senderId)) {
            throw new SecurityException("You can only delete your own messages");
        }

        if (message.getDeletedAt() != null) {
            throw new IllegalStateException("Message already deleted");
        }

        long secondsSinceSent = Instant.now().getEpochSecond() - message.getCreatedAt().getEpochSecond();
        if (secondsSinceSent > deleteWindowSeconds) {
            throw new IllegalStateException("Message can no longer be deleted — 5-minute window has passed");
        }

        message.setDeletedAt(Instant.now());
        message.setContent("[deleted]");
        messageRepository.save(message);

        wsController.sendMessageDeleted(ticketId, messageId);
    }

    @Transactional
    public void markRead(String ticketId, String tenantId, boolean isHub) {
        findTicketSecure(ticketId, tenantId, isHub);
        if (isHub) {
            messageRepository.markReadByHandler(ticketId);
        } else {
            messageRepository.markReadByCreator(ticketId);
        }
    }

    @Transactional
    public TicketResponse assignTicket(String ticketId, String assignedById, AssignTicketRequest req,
                                        EmployeeService employeeService) {
        SupportTicket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found"));

        com.chitfund.supportservice.domain.entity.Employee assignee =
                employeeService.getById(req.getAssigneeId());

        ticket.setAssignedTo(assignee.getId());
        ticket.setAssignedToName(assignee.getFullName());
        ticket = ticketRepository.save(ticket);

        assignmentRepository.save(TicketAssignment.builder()
                .id(UUID.randomUUID().toString())
                .ticketId(ticketId)
                .assignedTo(assignee.getId())
                .assignedBy(assignedById)
                .note(req.getNote())
                .build());

        wsController.notifyStatusChange(ticketId, ticket.getStatus().name());
        return toResponse(ticket, 0);
    }

    @Transactional
    public TicketResponse updateStatus(String ticketId, UpdateStatusRequest request) {
        SupportTicket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found"));

        validateStatusTransition(ticket.getStatus(), request.getStatus());

        if (request.getStatus() == TicketStatus.RESOLVED) {
            ticket.setResolvedAt(Instant.now());
        }
        ticket.setStatus(request.getStatus());
        ticket = ticketRepository.save(ticket);

        wsController.notifyStatusChange(ticketId, request.getStatus().name());
        return toResponse(ticket, 0);
    }

    private SupportTicket findTicketSecure(String ticketId, String tenantId, boolean isHub) {
        SupportTicket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found"));

        if (!isHub && !ticket.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("Ticket not found");
        }
        return ticket;
    }

    private long countUnread(String ticketId, boolean isHub) {
        if (isHub) {
            return messageRepository.countByTicketIdAndReadByHandlerFalse(ticketId);
        }
        return messageRepository.countByTicketIdAndReadByCreatorFalseAndSenderTypeNot(
                ticketId, SenderType.ORG_ADMIN);
    }

    private void validateStatusTransition(TicketStatus current, TicketStatus next) {
        if (current == TicketStatus.CLOSED) {
            throw new IllegalStateException("Cannot change status of a closed ticket");
        }
        if (current == next) {
            throw new IllegalStateException("Ticket is already " + current.name());
        }
    }

    @Transactional
    protected String generateTicketNumber() {
        int year = Year.now().getValue();
        // Upsert the row for this year if it doesn't exist yet
        seqRepository.findByYearForUpdate(year).orElseGet(() ->
                seqRepository.saveAndFlush(TicketNumberSeq.builder().year(year).lastVal(0).build()));
        // Atomic increment — safe across multiple JVM instances
        seqRepository.incrementByYear(year);
        TicketNumberSeq seq = seqRepository.findByYearForUpdate(year).orElseThrow();
        return String.format("CW-%d-%04d", year, seq.getLastVal());
    }

    private TicketResponse toResponse(SupportTicket t, long unreadCount) {
        return TicketResponse.builder()
                .id(t.getId())
                .ticketNumber(t.getTicketNumber())
                .type(t.getType())
                .tenantId(t.getTenantId())
                .createdBy(t.getCreatedBy())
                .createdByName(t.getCreatedByName())
                .subject(t.getSubject())
                .description(t.getDescription())
                .priority(t.getPriority())
                .status(t.getStatus())
                .assignedTo(t.getAssignedTo())
                .assignedToName(t.getAssignedToName())
                .firstResponseAt(t.getFirstResponseAt())
                .resolvedAt(t.getResolvedAt())
                .createdAt(t.getCreatedAt())
                .updatedAt(t.getUpdatedAt())
                .unreadCount(unreadCount)
                .build();
    }

    private PagedResponse<TicketResponse> toPagedResponse(Page<SupportTicket> page, String tenantId) {
        return PagedResponse.<TicketResponse>builder()
                .items(page.getContent().stream()
                        .map(t -> toResponse(t, countUnread(t.getId(), false)))
                        .toList())
                .page(page.getNumber())
                .size(page.getSize())
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .hasNext(page.hasNext())
                .build();
    }

    private TicketMessageResponse toMessageResponse(TicketMessage m) {
        return TicketMessageResponse.builder()
                .id(m.getId())
                .ticketId(m.getTicketId())
                .senderId(m.getSenderId())
                .senderType(m.getSenderType())
                .senderName(m.getSenderName())
                .content(m.getDeletedAt() != null ? "This message was deleted" : m.getContent())
                .deleted(m.getDeletedAt() != null)
                .readByCreator(m.isReadByCreator())
                .readByHandler(m.isReadByHandler())
                .createdAt(m.getCreatedAt())
                .build();
    }
}
