package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class CapabilityDefResponse {
    private String key;
    private String label;
    private int sortOrder;
}
