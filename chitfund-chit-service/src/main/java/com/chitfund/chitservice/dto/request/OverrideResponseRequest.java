package com.chitfund.chitservice.dto.request;

import lombok.Data;

import java.util.List;

@Data
public class OverrideResponseRequest {

    private Integer approvedSpots;

    private List<Integer> approvedDrawNumbers;
}
