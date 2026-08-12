package com.chitfund.chitservice.controller;

import com.chitfund.chitservice.repository.ChitRepository;
import com.chitfund.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/super-admin/chits")
@PreAuthorize("hasAuthority('SUPER_ADMIN')")
@RequiredArgsConstructor
public class SuperAdminChitController {

    private final ChitRepository chitRepository;

    @GetMapping("/usage-summary")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> usageSummary() {
        return ResponseEntity.ok(ApiResponse.success(chitRepository.countActiveChitsByTenant()));
    }
}
