package com.chitfund.paymentservice.controller;

import com.chitfund.common.context.MemberContext;
import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.*;
import com.chitfund.paymentservice.client.ChitServiceClient;
import com.chitfund.paymentservice.domain.enums.DrawStatus;
import com.chitfund.paymentservice.service.ChitMonthDrawService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/admin/draws/member/chit")
@RequiredArgsConstructor
public class MemberDrawController {
    private final ChitServiceClient chits;
    private final ChitMonthDrawService draws;

    // Members see their own enrolled chit's schedule, not organisation-wide
    // collection aggregates or the identities of administrators who changed it.
    public record MemberDraw(UUID id, UUID chitId, int monthNumber, LocalDate dueDate,
                             BigDecimal installmentAmount, DrawStatus status, String skipReason) { }

    @GetMapping("/{chitId}")
    @PreAuthorize("hasAuthority('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<List<MemberDraw>>> getDraws(@PathVariable UUID chitId) {
        UUID memberId;
        try { memberId = UUID.fromString(MemberContext.get()); }
        catch (IllegalArgumentException | NullPointerException invalid) { throw new BusinessException(ErrorCode.FORBIDDEN, "Member context is required"); }
        if (chits.getEnrollmentsForMember(memberId).stream().noneMatch(e -> chitId.equals(e.getChitId()))) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "This chit is not linked to your member account");
        }
        var schedule = draws.getCyclesForChit(chitId).stream().map(draw -> new MemberDraw(draw.getId(),
                draw.getChitId(), draw.getMonthNumber(), draw.getDueDate(), draw.getInstallmentAmount(),
                draw.getStatus(), draw.getSkipReason())).toList();
        return ResponseEntity.ok(ApiResponse.success(schedule));
    }
}
