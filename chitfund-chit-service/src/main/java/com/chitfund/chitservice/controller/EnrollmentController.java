package com.chitfund.chitservice.controller;

import com.chitfund.chitservice.dto.request.EnrollMemberRequest;
import com.chitfund.chitservice.dto.response.ChitEnrollmentResponse;
import com.chitfund.chitservice.service.EnrollmentService;
import com.chitfund.common.dto.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/chits/{chitId}/enrollments")
@RequiredArgsConstructor
public class EnrollmentController {

    private final EnrollmentService enrollmentService;

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<ChitEnrollmentResponse>> enroll(
            @PathVariable UUID chitId,
            @Valid @RequestBody EnrollMemberRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(enrollmentService.enrollMember(chitId, request), "Member enrolled"));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<ChitEnrollmentResponse>>> list(@PathVariable UUID chitId) {
        return ResponseEntity.ok(ApiResponse.success(enrollmentService.listEnrollments(chitId)));
    }

    @DeleteMapping("/{memberId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Void>> remove(
            @PathVariable UUID chitId,
            @PathVariable UUID memberId) {
        enrollmentService.removeEnrollment(chitId, memberId);
        return ResponseEntity.ok(ApiResponse.success(null, "Enrollment removed"));
    }
}
