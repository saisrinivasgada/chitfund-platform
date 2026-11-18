package com.chitfund.userservice.domain.enums;

public enum SetupTokenPurpose {
    /** Token linked to a ChitfundAccessRequest — uses ChitfundRequestService.completeSetup(). */
    CHITFUND_REQUEST,
    /** Token for a SUPER_ADMIN-created org user — uses OrgUserSetupService.complete(). */
    ORG_USER_INVITE,
}
