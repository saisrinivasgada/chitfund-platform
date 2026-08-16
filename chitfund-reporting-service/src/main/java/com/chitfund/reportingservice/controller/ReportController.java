package com.chitfund.reportingservice.controller;

import com.chitfund.common.context.MemberContext;
import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.reportingservice.dto.response.ChitCollectionReport;
import com.chitfund.reportingservice.dto.response.MemberStatementReport;
import com.chitfund.reportingservice.dto.response.PayoutSummaryReport;
import com.chitfund.reportingservice.service.ReportQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportQueryService queryService;

    // ─── Collection reports (chit-level) ────────────────────────────────────

    @GetMapping("/chit/{chitId}/collections")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<List<ChitCollectionReport>>> getChitCollections(
            @PathVariable String chitId) {
        return ResponseEntity.ok(ApiResponse.success(queryService.getChitCollectionReport(chitId)));
    }

    @GetMapping("/chit/{chitId}/collections/{monthNumber}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<ChitCollectionReport>> getMonthSnapshot(
            @PathVariable String chitId,
            @PathVariable Integer monthNumber) {
        return ResponseEntity.ok(ApiResponse.success(queryService.getMonthSnapshot(chitId, monthNumber)));
    }

    // ─── Member statement reports ────────────────────────────────────────────

    @GetMapping("/chit/{chitId}/members")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<List<MemberStatementReport>>> getChitMemberStatements(
            @PathVariable String chitId) {
        return ResponseEntity.ok(ApiResponse.success(queryService.getChitMemberStatements(chitId)));
    }

    @GetMapping("/member/{memberId}/statement")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_STAFF', 'ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<List<MemberStatementReport>>> getMemberStatement(
            @PathVariable String memberId, Authentication auth) {
        boolean isMember = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_MEMBER"));
        if (isMember && !memberId.equals(MemberContext.get())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Access denied");
        }
        return ResponseEntity.ok(ApiResponse.success(queryService.getMemberStatement(memberId)));
    }

    // ─── Payout reports ──────────────────────────────────────────────────────

    @GetMapping("/chit/{chitId}/payouts")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<List<PayoutSummaryReport>>> getChitPayouts(
            @PathVariable String chitId) {
        return ResponseEntity.ok(ApiResponse.success(queryService.getChitPayouts(chitId)));
    }

    @GetMapping("/member/{memberId}/payouts")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_STAFF', 'ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<List<PayoutSummaryReport>>> getMemberPayouts(
            @PathVariable String memberId, Authentication auth) {
        boolean isMember = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_MEMBER"));
        if (isMember && !memberId.equals(MemberContext.get())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Access denied");
        }
        return ResponseEntity.ok(ApiResponse.success(queryService.getMemberPayouts(memberId)));
    }
}
