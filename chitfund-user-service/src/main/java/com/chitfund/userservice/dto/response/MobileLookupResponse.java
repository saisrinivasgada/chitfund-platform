package com.chitfund.userservice.dto.response;

import com.chitfund.userservice.domain.enums.Role;
import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class MobileLookupResponse {

    // true when exactly one account exists — frontend can skip role picker
    private boolean singleAccount;

    // Accounts found for this phone number. Empty list = no account.
    private List<AccountOption> accounts;

    @Data
    @Builder
    public static class AccountOption {
        private Role role;
        private String displayLabel; // "Member account" / "Worker account" etc.
    }
}
