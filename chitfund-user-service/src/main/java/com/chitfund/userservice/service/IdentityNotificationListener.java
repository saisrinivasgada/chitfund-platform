package com.chitfund.userservice.service;

import com.chitfund.userservice.client.MemberServiceClient;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.event.NotificationEventPublisher;
import com.chitfund.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class IdentityNotificationListener {
    private final NotificationEventPublisher eventPublisher;
    private final MemberServiceClient memberServiceClient;
    private final UserRepository userRepository;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onIdentityNotification(IdentityNotificationEvent event) {
        try {
            deliver(event);
        } catch (RuntimeException ex) {
            log.error("Post-commit identity notification failed for type {}: {}",
                    event.type(), ex.getClass().getSimpleName());
        }
    }

    private void deliver(IdentityNotificationEvent event) {
        switch (event.type()) {
            case CHITFUND_REQUEST_CREATED -> {
                String org = event.organizationName() == null ? "An organization" : event.organizationName();
                eventPublisher.publishInApp(event.recipientUserId(), "New Chitfund Request",
                        org + " asked to connect a member profile to your ChitWise account.",
                        "CHITFUND_REQUEST", null, "/member/chitfund-requests");
                eventPublisher.publishPush(event.recipientUserId(), "New Chitfund Request",
                        org + " sent an app-access request.",
                        Map.of("type", "CHITFUND_REQUEST", "requestId", event.requestId().toString()));
            }
            case CHITFUND_ACCESS_ACTIVATED -> {
                if (event.activationTenantId() != null && event.activationMemberId() != null) {
                    try {
                        memberServiceClient.activateAppAccess(
                                event.activationTenantId(), event.activationMemberId(),
                                event.recipientUserId(), event.requestId());
                    } catch (RuntimeException ex) {
                        log.error("member-service activateAppAccess failed post-commit for request {}: {}",
                                event.requestId(), ex.getMessage());
                    }
                }
                eventPublisher.publishInApp(
                        event.recipientUserId(), "Chitfund Access Active",
                        "Your verified member profile is now active for " + event.organizationName() + ".",
                        "CHITFUND_REQUEST", null, "/member/chitfund-requests");
            }
            case PHONE_IDENTITY_REASSIGNED -> {
                eventPublisher.publishInApp(event.recipientUserId(), "Account identity updated",
                        "A support-approved phone identity change was completed. Your historical organization and financial records were not transferred or deleted.",
                        "ACCOUNT_ACCESS", null, "/member/support");
                for (var tenantId : event.affectedTenantIds() == null ? List.<java.util.UUID>of() : event.affectedTenantIds()) {
                    userRepository.findByTenantIdAndRoleInAndDeletedAtIsNull(
                                    tenantId.toString(), List.of(Role.ADMIN))
                            .forEach(admin -> eventPublisher.publishInApp(admin.getId(),
                                    "Member identity access updated",
                                    "ChitWise Support completed an approved identity-access change affecting a member profile in your organization. Financial history was not changed.",
                                    "ACCOUNT_ACCESS", null, "/support"));
                }
            }
        }
    }
}
