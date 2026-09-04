package com.chitfund.supportservice.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class EmployeeLoginResponse {
    private String token;
    private String employeeId;
    private String fullName;
    private String email;
    private String role;
}
