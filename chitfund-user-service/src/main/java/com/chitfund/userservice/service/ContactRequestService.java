package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.ContactRequest;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.dto.request.SubmitProspectContactRequest;
import com.chitfund.userservice.dto.request.SubmitSupportTicketRequest;
import com.chitfund.userservice.dto.response.ContactRequestResponse;
import com.chitfund.userservice.repository.ContactRequestRepository;
import com.chitfund.userservice.repository.TenantRepository;
import lombok.RequiredArgsConstructor;
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

    private final ContactRequestRepository contactRequestRepository;
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

    public long countNew() {
        return contactRequestRepository.countByStatus("NEW");
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
}
