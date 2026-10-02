package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class CapabilityGateResponse {
    private String capabilityKey;
    private String name;
    private String description;
    private String importance;
    private List<PlanResponse> upgradePlans;
}
