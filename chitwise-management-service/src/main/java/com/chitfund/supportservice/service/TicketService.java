package com.chitfund.supportservice.service;

import com.chitfund.supportservice.domain.entity.SupportTicket;
import com.chitfund.supportservice.domain.entity.TicketAssignment;
import com.chitfund.supportservice.domain.entity.TicketMessage;
import com.chitfund.supportservice.domain.enums.SenderType;
import com.chitfund.supportservice.domain.enums.TicketStatus;
import com.chitfund.supportservice.domain.enums.TicketPriority;
import com.chitfund.supportservice.domain.enums.TicketSource;
import com.chitfund.supportservice.domain.enums.TicketType;
import com.chitfund.supportservice.dto.request.CreatePublicInquiryRequest;
import com.chitfund.supportservice.dto.request.AssignTicketRequest;
import com.chitfund.supportservice.dto.request.CreateHubTicketRequest;
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
import com.chitfund.supportservice.client.TenantSupportClient;
import com.chitfund.supportservice.client.AuditClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.time.Year;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class TicketService {

    private static final String PLATFORM_AUDIT_TENANT = "PLATFORM";
    private static final Map<TicketStatus, Set<TicketStatus>> ALLOWED_STATUS_TRANSITIONS = Map.of(
            TicketStatus.OPEN, EnumSet.of(TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD,
                    TicketStatus.RESOLVED, TicketStatus.CLOSED),
            TicketStatus.IN_PROGRESS, EnumSet.of(TicketStatus.ON_HOLD,
                    TicketStatus.RESOLVED, TicketStatus.CLOSED),
            TicketStatus.ON_HOLD, EnumSet.of(TicketStatus.IN_PROGRESS,
                    TicketStatus.RESOLVED, TicketStatus.CLOSED),
            TicketStatus.RESOLVED, EnumSet.of(TicketStatus.IN_PROGRESS, TicketStatus.CLOSED),
            TicketStatus.CLOSED, EnumSet.of(TicketStatus.IN_PROGRESS));

    private final SupportTicketRepository ticketRepository;
    private final TicketMessageRepository messageRepository;
    private final TicketAssignmentRepository assignmentRepository;
    private final TicketWebSocketController wsController;
    private final TicketNumberSeqRepository seqRepository;
    private final TenantSupportClient tenantSupportClient;
    private final IdentityCaseService identityCaseService;
    private final AuditClient auditClient;

    // Self-reference through the proxy so @Transactional on createTicketTransactional is applied
    // when called from the non-transactional createTicket (which performs the HTTP call first).
    @Lazy @Autowired private TicketService self;

    @Value("${app.message-delete-window-seconds:300}")
    private long deleteWindowSeconds;

    public TicketResponse createTicket(String userId, String userName, String tenantId,
                                       CreateTicketRequest request) {
        return createTicket(userId, userName, "ORG_USER", tenantId, request);
    }

    public TicketResponse createTicket(String userId, String userName, String actorRole,
                                       String tenantId, CreateTicketRequest request) {
        if (request.getType() == TicketType.ACCOUNT && request.getAccountCaseSubtype() == null) {
            throw new IllegalArgumentException("Account case subtype is required for Account tickets");
        }
        if (request.getType() != TicketType.ACCOUNT && request.getAccountCaseSubtype() != null) {
            throw new IllegalArgumentException("Account case subtype is valid only for Account tickets");
        }
        TenantSupportClient.SupportContext support = tenantSupportClient.getSupportContext(tenantId);
        return self.createTicketTransactional(userId, userName, actorRole, tenantId, request, support);
    }

    @Transactional
    public TicketResponse createTicketTransactional(String userId, String userName, String actorRole,
                                                       String tenantId,
                                                       CreateTicketRequest request,
                                                       TenantSupportClient.SupportContext support) {
        String ticketNumber = generateTicketNumber();
        SupportTicket ticket = SupportTicket.builder()
                .id(UUID.randomUUID().toString())
                .ticketNumber(ticketNumber)
                .type(request.getType())
                .accountCaseSubtype(request.getAccountCaseSubtype())
                .subjectMemberId(blankToNull(request.getMemberId()))
                .subjectUserId(blankToNull(request.getUserId()))
                .source(TicketSource.ORGANIZATION)
                .tenantId(tenantId)
                .tenantName(support.tenantName())
                .createdBy(userId)
                .createdByName(userName)
                .preferredContact(request.getPreferredContact())
                .priority(support.prioritySupport() ? TicketPriority.HIGH : TicketPriority.NORMAL)
                .subject(request.getSubject())
                .description(request.getDescription())
                .build();

        ticket = ticketRepository.save(ticket);

        if (ticket.getType() == TicketType.ACCOUNT) {
            identityCaseService.openForTicket(ticket);
        }

        auditClient.log(ticket.getId(), "CREATED", userId, actorRole,
                null, java.util.Map.of(
                        "status", ticket.getStatus().name(),
                        "type", ticket.getType().name(),
                        "priority", ticket.getPriority().name(),
                        "source", ticket.getSource().name()),
                java.util.Map.of("ticketNumber", ticket.getTicketNumber()), tenantId, null);

        notifyNewTicketAfterCommit(ticket);

        return toResponse(ticket, 0);
    }

    @Transactional
    public TicketResponse createTicketByHub(String employeeId, String employeeName,
                                            CreateHubTicketRequest request) {
        return createTicketByHub(employeeId, employeeName, "HUB_EMPLOYEE", request);
    }

    @Transactional
    public TicketResponse createTicketByHub(String employeeId, String employeeName,
                                            String actorRole, CreateHubTicketRequest request) {
        String desc = request.getDescription() != null ? request.getDescription().trim() : "";
        if (request.getCallerName() != null && !request.getCallerName().isBlank()) {
            String callerLine = "Caller: " + request.getCallerName().trim();
            desc = desc.isEmpty() ? callerLine : callerLine + "\n\n" + desc;
        }
        SupportTicket ticket = SupportTicket.builder()
                .id(UUID.randomUUID().toString())
                .ticketNumber(generateTicketNumber())
                .type(request.getType())
                .source(TicketSource.HUB_CREATED)
                .tenantId(request.getTenantId().trim())
                .tenantName(request.getTenantName().trim())
                .createdBy(employeeId)
                .createdByName(employeeName)
                .requesterEmail(blankToNull(request.getCallerEmail()))
                .requesterPhone(blankToNull(request.getCallerPhone()))
                .priority(request.getPriority())
                .subject(request.getSubject().trim())
                .description(desc.isEmpty() ? null : desc)
                .build();
        ticket = ticketRepository.save(ticket);
        auditClient.log(ticket.getId(), "CREATED", employeeId, actorRole,
                null, java.util.Map.of(
                        "status", ticket.getStatus().name(),
                        "type", ticket.getType().name(),
                        "priority", ticket.getPriority().name(),
                        "source", ticket.getSource().name()),
                java.util.Map.of("ticketNumber", ticket.getTicketNumber()),
                ticket.getTenantId(), null);
        notifyNewTicketAfterCommit(ticket);
        return toResponse(ticket, 0);
    }

    @Transactional
    public TicketResponse createPublicInquiry(CreatePublicInquiryRequest request) {
        SupportTicket ticket = SupportTicket.builder()
                .id(UUID.randomUUID().toString())
                .ticketNumber(generateTicketNumber())
                .type(TicketType.INQUIRY)
                .source(TicketSource.PUBLIC)
                .createdByName(request.getName().trim())
                .requesterEmail(request.getEmail().trim())
                .requesterPhone(blankToNull(request.getPhone()))
                .preferredContact(request.getPreferredContact() != null
                        ? request.getPreferredContact() : "EMAIL")
                .subject("Public inquiry from " + request.getName().trim())
                .description(request.getMessage().trim())
                .priority(TicketPriority.NORMAL)
                .build();
        ticket = ticketRepository.save(ticket);
        auditClient.log(ticket.getId(), "CREATED", null, "PUBLIC",
                null, java.util.Map.of(
                        "status", ticket.getStatus().name(),
                        "type", ticket.getType().name(),
                        "priority", ticket.getPriority().name(),
                        "source", ticket.getSource().name()),
                java.util.Map.of("ticketNumber", ticket.getTicketNumber()),
                PLATFORM_AUDIT_TENANT, null);
        notifyNewTicketAfterCommit(ticket);
        return toResponse(ticket, 0);
    }

    @Transactional(readOnly = true)
    public PagedResponse<TicketResponse> listForOrg(String tenantId, int page, int size) {
        Page<SupportTicket> tickets = ticketRepository.findByTenantIdOrderByCreatedAtDesc(
                tenantId, PageRequest.of(page, size));
        return toPagedResponse(tickets, tenantId);
    }

    @Transactional(readOnly = true)
    public PagedResponse<TicketResponse> listForMember(String tenantId, String userId, int page, int size) {
        Page<SupportTicket> tickets = ticketRepository.findByTenantIdAndCreatedByOrderByCreatedAtDesc(
                tenantId, userId, PageRequest.of(page, size));
        return toPagedResponse(tickets, tenantId);
    }

    @Transactional(readOnly = true)
    public PagedResponse<TicketResponse> listAll(int page, int size, TicketStatus status,
                                                 TicketType type, TicketPriority priority,
                                                 Instant from, Instant toExclusive, String query,
                                                 java.util.Set<TicketType> allowedTypes) {
        page = Math.max(0, page);
        java.util.Set<TicketType> effectiveTypes = allowedTypes == null
                ? java.util.EnumSet.allOf(TicketType.class) : allowedTypes;
        if (effectiveTypes.isEmpty()) {
            return PagedResponse.<TicketResponse>builder()
                    .items(List.of()).page(page).size(Math.min(Math.max(size, 1), 100))
                    .totalElements(0).totalPages(0).hasNext(false).build();
        }
        boolean allTypes = effectiveTypes.size() == TicketType.values().length;
        Page<SupportTicket> tickets = ticketRepository.searchForHub(
                status, type, allTypes, effectiveTypes, priority, from, toExclusive,
                escapeLikeParam(blankToNull(query)),
                PageRequest.of(page, Math.min(Math.max(size, 1), 100)));

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
    public TicketResponse getTicket(String ticketId, String tenantId, boolean isHub,
                                    String requesterId, boolean restrictToCreator) {
        SupportTicket ticket = findTicketSecure(
                ticketId, tenantId, isHub, requesterId, restrictToCreator);
        return toResponse(ticket, countUnread(ticketId, isHub));
    }

    @Transactional(readOnly = true)
    public PagedResponse<TicketMessageResponse> getMessages(String ticketId, String tenantId,
                                                             boolean isHub, String requesterId,
                                                             boolean restrictToCreator,
                                                             String cursor, int limit) {
        findTicketSecure(ticketId, tenantId, isHub, requesterId, restrictToCreator);

        limit = Math.min(Math.max(limit, 1), 50);
        List<TicketMessage> messages;

        if (cursor != null) {
            Instant before;
            try {
                before = Instant.parse(cursor);
            } catch (DateTimeParseException exception) {
                throw new IllegalArgumentException("Invalid message cursor");
            }
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
        boolean restrictToCreator = !isHub && senderType == SenderType.ORG_MEMBER;
        SupportTicket ticket = findTicketSecure(
                ticketId, tenantId, isHub, senderId, restrictToCreator);

        if (ticket.getStatus() == TicketStatus.CLOSED || ticket.getStatus() == TicketStatus.RESOLVED) {
            throw new IllegalStateException("Cannot message on a " + ticket.getStatus().name().toLowerCase() + " ticket");
        }

        boolean isHubResponse = senderType == SenderType.SUPER_ADMIN
                || senderType == SenderType.SUPPORT_AGENT;
        if (isHubResponse && ticket.getFirstResponseAt() == null) {
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
        auditClient.log(ticketId, "MESSAGE_SENT", senderId, senderType.name(),
                null, java.util.Map.of("messageId", message.getId()),
                java.util.Map.of("senderType", senderType.name()), ticket.getTenantId(), null);
        TicketMessageResponse response = toMessageResponse(message);
        afterCommit(() -> wsController.sendTicketMessage(ticketId, response));

        return response;
    }

    @Transactional
    public void softDeleteMessage(String ticketId, String messageId, String senderId,
                                  String actorRole, String tenantId, boolean isHub) {
        boolean restrictToCreator = !isHub && "MEMBER".equals(actorRole);
        SupportTicket ticket = findTicketSecure(
                ticketId, tenantId, isHub, senderId, restrictToCreator);

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

        auditClient.log(ticketId, "MESSAGE_DELETED", senderId, actorRole,
                java.util.Map.of("messageId", messageId, "deleted", false),
                java.util.Map.of("messageId", messageId, "deleted", true),
                null, ticket.getTenantId(), "Sender removed the message within the allowed window");

        afterCommit(() -> wsController.sendMessageDeleted(ticketId, messageId));
    }

    @Transactional
    public void markRead(String ticketId, String tenantId, boolean isHub,
                         String requesterId, boolean restrictToCreator) {
        findTicketSecure(ticketId, tenantId, isHub, requesterId, restrictToCreator);
        if (isHub) {
            messageRepository.markReadByHandler(ticketId);
        } else {
            messageRepository.markReadByCreator(ticketId);
        }
    }

    @Transactional
    public TicketResponse assignTicket(String ticketId, String assignedById, String assignedByRole,
                                        AssignTicketRequest req,
                                        EmployeeService employeeService) {
        if (blankToNull(req.getNote()) == null) {
            throw new IllegalArgumentException("Assignment reason is required");
        }
        SupportTicket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found"));

        com.chitfund.supportservice.domain.entity.Employee assignee =
                employeeService.getById(req.getAssigneeId());

        String previousAssignee = ticket.getAssignedTo();
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

        auditClient.log(ticketId, "ASSIGNED", assignedById, assignedByRole,
                java.util.Map.of("assignedTo", previousAssignee != null ? previousAssignee : "UNASSIGNED"),
                java.util.Map.of("assignedTo", assignee.getId()),
                req.getNote() != null && !req.getNote().isBlank()
                        ? java.util.Map.of("assignmentNotePresent", true) : null,
                ticket.getTenantId(), req.getNote());

        notifyStatusAfterCommit(ticketId, ticket.getStatus());
        return toResponse(ticket, 0);
    }

    @Transactional
    public TicketResponse updateStatus(String ticketId, UpdateStatusRequest request) {
        return updateStatus(ticketId, request, null, "HUB_EMPLOYEE");
    }

    @Transactional
    public TicketResponse updateStatus(String ticketId, UpdateStatusRequest request,
                                       String actorId, String actorRole) {
        if (blankToNull(request.getNote()) == null) {
            throw new IllegalArgumentException("Status change reason is required");
        }
        SupportTicket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found"));

        validateStatusTransition(ticket.getStatus(), request.getStatus());

        TicketStatus previousStatus = ticket.getStatus();
        if (request.getStatus() == TicketStatus.RESOLVED) {
            ticket.setResolvedAt(Instant.now());
        }
        ticket.setStatus(request.getStatus());
        ticket = ticketRepository.save(ticket);

        auditClient.log(ticketId, "STATUS_CHANGED", actorId, actorRole,
                java.util.Map.of("status", previousStatus.name()),
                java.util.Map.of("status", request.getStatus().name()),
                null, ticket.getTenantId(), blankToNull(request.getNote()));

        notifyStatusAfterCommit(ticketId, request.getStatus());
        return toResponse(ticket, 0);
    }

    private SupportTicket findTicketSecure(String ticketId, String tenantId, boolean isHub,
                                           String requesterId, boolean restrictToCreator) {
        SupportTicket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found"));

        if (!isHub && !java.util.Objects.equals(ticket.getTenantId(), tenantId)) {
            throw new IllegalArgumentException("Ticket not found");
        }
        if (!isHub && restrictToCreator
                && !java.util.Objects.equals(ticket.getCreatedBy(), requesterId)) {
            // Deliberately indistinguishable from an unknown ticket to avoid identifier probing.
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
        if (current == next) {
            throw new IllegalStateException("Ticket is already " + current.name());
        }
        if (!ALLOWED_STATUS_TRANSITIONS.getOrDefault(current, Set.of()).contains(next)) {
            throw new IllegalStateException(
                    "Cannot change ticket status from " + current.name() + " to " + next.name());
        }
    }

    private void notifyNewTicketAfterCommit(SupportTicket ticket) {
        afterCommit(() -> wsController.notifyNewTicket(ticket));
    }

    private void notifyStatusAfterCommit(String ticketId, TicketStatus status) {
        afterCommit(() -> wsController.notifyStatusChange(ticketId, status.name()));
    }

    private void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    action.run();
                } catch (RuntimeException exception) {
                    // WebSocket delivery is a live-view optimization. Database state and
                    // polling remain authoritative, so a post-commit socket failure must
                    // not make the already-committed API operation appear to have failed.
                    log.warn("Ticket WebSocket publication failed after commit: {}",
                            exception.getMessage());
                }
            }
        });
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
                .accountCaseSubtype(t.getAccountCaseSubtype())
                .subjectMemberId(t.getSubjectMemberId())
                .subjectUserId(t.getSubjectUserId())
                .source(t.getSource())
                .tenantId(t.getTenantId())
                .tenantName(t.getTenantName())
                .createdBy(t.getCreatedBy())
                .createdByName(t.getCreatedByName())
                .requesterEmail(t.getRequesterEmail())
                .requesterPhone(t.getRequesterPhone())
                .preferredContact(t.getPreferredContact())
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

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String escapeLikeParam(String raw) {
        if (raw == null) return null;
        return raw.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
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
