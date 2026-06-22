package com.chitfund.reportingservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.reportingservice.dto.response.ChitCollectionReport;
import com.chitfund.reportingservice.dto.response.MemberStatementReport;
import com.chitfund.reportingservice.dto.response.PayoutSummaryReport;
import com.chitfund.reportingservice.service.ReportQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportQueryService queryService;

    // ─── Collection reports (chit-level) ────────────────────────────────────

    @GetMapping("/chit/{chitId}/collections")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_WORKER')")
    public ResponseEntity<ApiResponse<List<ChitCollectionReport>>> getChitCollections(
            @PathVariable String chitId) {
        return ResponseEntity.ok(ApiResponse.success(queryService.getChitCollectionReport(chitId)));
    }

    @GetMapping("/chit/{chitId}/collections/{monthNumber}")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_WORKER')")
    public ResponseEntity<ApiResponse<ChitCollectionReport>> getMonthSnapshot(
            @PathVariable String chitId,
            @PathVariable Integer monthNumber) {
        return ResponseEntity.ok(ApiResponse.success(queryService.getMonthSnapshot(chitId, monthNumber)));
    }

    // ─── Member statement reports ────────────────────────────────────────────

    /**
     * Admin view: all members' balances for a chit (outstanding list).
     */
    @GetMapping("/chit/{chitId}/members")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_WORKER')")
    public ResponseEntity<ApiResponse<List<MemberStatementReport>>> getChitMemberStatements(
            @PathVariable String chitId) {
        return ResponseEntity.ok(ApiResponse.success(queryService.getChitMemberStatements(chitId)));
    }

    /**
     * Member's own statement across all their chits.
     * Admin can also call this for any member.
     */
    @GetMapping("/member/{memberId}/statement")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_WORKER', 'ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<List<MemberStatementReport>>> getMemberStatement(
            @PathVariable String memberId) {
        return ResponseEntity.ok(ApiResponse.success(queryService.getMemberStatement(memberId)));
    }

    // ─── Payout reports ──────────────────────────────────────────────────────

    @GetMapping("/chit/{chitId}/payouts")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_WORKER')")
    public ResponseEntity<ApiResponse<List<PayoutSummaryReport>>> getChitPayouts(
            @PathVariable String chitId) {
        return ResponseEntity.ok(ApiResponse.success(queryService.getChitPayouts(chitId)));
    }

    @GetMapping("/member/{memberId}/payouts")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_WORKER', 'ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<List<PayoutSummaryReport>>> getMemberPayouts(
            @PathVariable String memberId) {
        return ResponseEntity.ok(ApiResponse.success(queryService.getMemberPayouts(memberId)));
    }
}
