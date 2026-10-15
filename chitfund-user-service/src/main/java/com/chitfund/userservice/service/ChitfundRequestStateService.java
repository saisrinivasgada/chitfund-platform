package com.chitfund.userservice.service;

import com.chitfund.userservice.domain.enums.ChitfundRequestStatus;
import com.chitfund.userservice.domain.entity.ChitfundRequestAudit;
import com.chitfund.userservice.repository.ChitfundAccessRequestRepository;
import com.chitfund.userservice.repository.ChitfundRequestAuditRepository;
import com.chitfund.userservice.outbox.SetupEmailOutbox;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Persists terminal request-state transitions independently from an API
 * transaction which may subsequently return an error to the caller.
 */
@Service
@RequiredArgsConstructor
public class ChitfundRequestStateService {
    private static final List<ChitfundRequestStatus> OPEN = List.of(
            ChitfundRequestStatus.PENDING_MEMBER,
            ChitfundRequestStatus.MEMBER_VERIFIED,
            ChitfundRequestStatus.AWAITING_ADMIN);

    private final ChitfundAccessRequestRepository requestRepository;
    private final ChitfundRequestAuditRepository auditRepository;
    private final SetupEmailOutbox setupEmailOutbox;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean expireIfDue(UUID requestId, LocalDateTime now) {
        var snapshot = requestRepository.findById(requestId).orElse(null);
        if (snapshot == null) return false;
        if (snapshot.getStatus() == ChitfundRequestStatus.EXPIRED) return true;
        if (!OPEN.contains(snapshot.getStatus()) || snapshot.getExpiresAt() == null
                || !snapshot.getExpiresAt().isBefore(now)) {
            return false;
        }
        boolean expired = requestRepository.expireByIdIfDue(
                requestId, OPEN, ChitfundRequestStatus.EXPIRED, now) > 0;
        if (expired) {
            // A queued setup email must not be delivered after the request expires.
            // An already in-flight provider call cannot be recalled, but its link is
            // rejected by completeSetup because the request is no longer open.
            setupEmailOutbox.supersede(requestId);
            auditRepository.save(ChitfundRequestAudit.builder()
                    .requestId(requestId)
                    .action("REQUEST_EXPIRED")
                    .toStatus(ChitfundRequestStatus.EXPIRED)
                    .actorType("SYSTEM")
                    .details("Request expiry enforced")
                    .build());
        }
        // Another transaction can win the same expiry update. The observable
        // result is still expired, and callers must reject the action.
        return expired || requestRepository.findById(requestId)
                .map(r -> r.getStatus() == ChitfundRequestStatus.EXPIRED)
                .orElse(false);
    }
}
