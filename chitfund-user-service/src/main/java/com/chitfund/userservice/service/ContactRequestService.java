package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.ContactRequest;
import com.chitfund.userservice.domain.entity.ContactRequestMessage;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.dto.request.SubmitProspectContactRequest;
import com.chitfund.userservice.dto.request.SubmitSupportTicketRequest;
import com.chitfund.userservice.dto.response.ContactRequestMessageResponse;
import com.chitfund.userservice.dto.response.ContactRequestResponse;
import com.chitfund.userservice.repository.ContactRequestMessageRepository;
import com.chitfund.userservice.repository.ContactRequestRepository;
import com.chitfund.userservice.repository.TenantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ContactRequestService {

    private static final List<String> VALID_STATUSES =
            List.of("NEW", "OPEN", "ON_HOLD", "RESOLVED", "CLOSED");
    private static final List<String> VALID_MODES =
            List.of("EMAIL", "SMS", "BOTH");
    private static final List<String> VALID_TYPES =
            List.of("PROSPECT", "ORG_SUPPORT");

    private final ContactRequestRepository contactRequestRepository;
    private final ContactRequestMessageRepository contactRequestMessageRepository;
    private final TenantRepository tenantRepository;

    @Transactional
    public void submitProspect(SubmitProspectContactRequest req) {
        ContactRequest cr = ContactRequest.builder()
                .type("PROSPECT")
                .name(req.getName())
                .email(req.getEmail())
                .phone(req.getPhone())
                .message(req.getMessage())
                .preferredContact(sanitizeMode(req.getPreferredContact()))
                .build();
        contactRequestRepository.save(cr);
    }

    @Transactional
    public void submitSupportTicket(SubmitSupportTicketRequest req, User user) {
        String tenantName = null;
        UUID tenantUuid = null;
        if (user.getTenantId() != null) {
            try {
                tenantUuid = UUID.fromString(user.getTenantId());
                tenantName = tenantRepository.findById(tenantUuid)
                        .map(Tenant::getName)
                        .orElse(null);
            } catch (IllegalArgumentException ignored) {}
        }
        ContactRequest cr = ContactRequest.builder()
                .type("ORG_SUPPORT")
                .name(user.getFullName() != null ? user.getFullName() : user.getUsername())
                .email(user.getEmail())
                .phone(user.getPhone())
                .subject(req.getSubject())
                .message(req.getMessage())
                .tenantId(tenantUuid)
                .tenantName(tenantName)
                .preferredContact(sanitizeMode(req.getPreferredContact()))
                .build();
        contactRequestRepository.save(cr);
    }

    public List<ContactRequestResponse> listAll() {
        return contactRequestRepository.findAllByOrderByCreatedAtDesc()
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public Page<ContactRequestResponse> search(String type, String status,
                                                LocalDateTime from, LocalDateTime to,
                                                Pageable pageable) {
        if (type != null && !VALID_TYPES.contains(type)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Invalid type: " + type);
        }
        if (status != null && !VALID_STATUSES.contains(status)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Invalid status: " + status);
        }
        return contactRequestRepository.search(type, status, from, to, pageable)
                .map(this::toResponse);
    }

    public ContactRequestResponse getOne(UUID id) {
        return toResponse(contactRequestRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Contact request not found")));
    }

    public long countNew() {
        return contactRequestRepository.countByStatus("NEW");
    }

    public List<ContactRequestMessageResponse> listMessages(UUID contactRequestId) {
        contactRequestRepository.findById(contactRequestId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Contact request not found"));
        return contactRequestMessageRepository.findByContactRequestIdOrderByCreatedAtAsc(contactRequestId)
                .stream()
                .map(this::toMessageResponse)
                .toList();
    }

    @Transactional
    public ContactRequestMessageResponse addMessage(UUID contactRequestId, String senderName, String content) {
        contactRequestRepository.findById(contactRequestId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Contact request not found"));
        if (content == null || content.isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Message content is required");
        }
        ContactRequestMessage msg = ContactRequestMessage.builder()
                .contactRequestId(contactRequestId)
                .senderType("SUPER_ADMIN")
                .senderName(senderName)
                .content(content.trim())
                .build();
        return toMessageResponse(contactRequestMessageRepository.save(msg));
    }

    @Transactional
    public ContactRequestResponse updateStatus(UUID id, String status, LocalDateTime holdUntil) {
        if (!VALID_STATUSES.contains(status)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Invalid status: " + status);
        }
        if ("ON_HOLD".equals(status) && holdUntil == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "holdUntil is required when status is ON_HOLD");
        }
        ContactRequest cr = contactRequestRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Contact request not found"));
        cr.setStatus(status);
        cr.setHoldUntil("ON_HOLD".equals(status) ? holdUntil : null);
        return toResponse(contactRequestRepository.save(cr));
    }

    @Transactional
    public ContactRequestResponse updateContactMode(UUID id, String preferredContact) {
        if (!VALID_MODES.contains(preferredContact)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Invalid contact mode: " + preferredContact);
        }
        ContactRequest cr = contactRequestRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Contact request not found"));
        cr.setPreferredContact(preferredContact);
        return toResponse(contactRequestRepository.save(cr));
    }

    private String sanitizeMode(String mode) {
        return (mode != null && VALID_MODES.contains(mode)) ? mode : "EMAIL";
    }

    private ContactRequestResponse toResponse(ContactRequest cr) {
        return ContactRequestResponse.builder()
                .id(cr.getId())
                .type(cr.getType())
                .name(cr.getName())
                .email(cr.getEmail())
                .phone(cr.getPhone())
                .subject(cr.getSubject())
                .message(cr.getMessage())
                .tenantId(cr.getTenantId())
                .tenantName(cr.getTenantName())
                .status(cr.getStatus())
                .preferredContact(cr.getPreferredContact())
                .holdUntil(cr.getHoldUntil())
                .createdAt(cr.getCreatedAt())
                .build();
    }

    private ContactRequestMessageResponse toMessageResponse(ContactRequestMessage m) {
        return ContactRequestMessageResponse.builder()
                .id(m.getId())
                .contactRequestId(m.getContactRequestId())
                .senderType(m.getSenderType())
                .senderName(m.getSenderName())
                .content(m.getContent())
                .createdAt(m.getCreatedAt())
                .build();
    }
}
