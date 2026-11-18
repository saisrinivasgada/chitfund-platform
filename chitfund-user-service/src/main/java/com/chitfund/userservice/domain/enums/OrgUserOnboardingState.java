package com.chitfund.userservice.domain.enums;

public enum OrgUserOnboardingState {
    /** Active unexpired invite exists; user has not completed setup. */
    PENDING,
    /** No active invite; setup incomplete — invite may have expired. */
    EXPIRED,
    /** User has completed account setup. */
    COMPLETE
}
