package com.chitfund.memberservice.domain.enums;

public enum MemberStatus {
    ACTIVE,      // in good standing, can be enrolled in new chits
    INACTIVE,    // temporarily paused — not a defaulter, just not participating currently
    BLACKLISTED  // defaulted or banned — admin must approve any future enrollment
}
