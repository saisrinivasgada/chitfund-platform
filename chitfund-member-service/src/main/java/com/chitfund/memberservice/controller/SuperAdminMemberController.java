package com.chitfund.memberservice.controller;

import com.chitfund.memberservice.repository.MemberRepository;
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
@RequestMapping("/api/super-admin/members")
@PreAuthorize("hasAuthority('SUPER_ADMIN')")
@RequiredArgsConstructor
public class SuperAdminMemberController {

    private final MemberRepository memberRepository;

    @GetMapping("/usage-summary")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> usageSummary() {
        return ResponseEntity.ok(ApiResponse.success(memberRepository.countMembersByTenant()));
    }
}
