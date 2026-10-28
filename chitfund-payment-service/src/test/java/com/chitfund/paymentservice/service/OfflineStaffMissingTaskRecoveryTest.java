package com.chitfund.paymentservice.service;

import com.chitfund.common.exception.*;
import com.chitfund.paymentservice.controller.OfflineStaffActionController;
import com.chitfund.paymentservice.dto.request.*;
import com.chitfund.paymentservice.exception.OfflineReviewRequiredException;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import java.math.BigDecimal;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class OfflineStaffMissingTaskRecoveryTest {
    @Test void aRemovedTaskStillPreservesItsSignedCashEvidenceForReview() {
        var actions = mock(OfflineStaffActionService.class);
        var reviews = mock(OfflineStaffReviewService.class);
        var controller = new OfflineStaffActionController(actions, reviews);
        var actor = UUID.randomUUID(); var reviewId = UUID.randomUUID();
        var original = new OfflineStaffActionRequest();
        var auth = new UsernamePasswordAuthenticationToken(actor, null, List.of(new SimpleGrantedAuthority("ROLE_STAFF")));
        when(actions.apply(original, actor, "STAFF")).thenThrow(new ResourceNotFoundException("Removed task"));
        when(reviews.preserve(original, actor, "STAFF", null)).thenReturn(reviewId);
        assertThatThrownBy(() -> controller.apply(original, auth)).isInstanceOfSatisfying(OfflineReviewRequiredException.class,
                error -> assertThat(error.getReviewId()).isEqualTo(reviewId));
        verify(reviews).preserve(original, actor, "STAFF", null);
    }

    @Test void accessRejectionDoesNotBypassHistoricalProofVerification() {
        var actions = mock(OfflineStaffActionService.class); var reviews = mock(OfflineStaffReviewService.class);
        var actor = UUID.randomUUID(); var original = new OfflineStaffActionRequest();
        var auth = new UsernamePasswordAuthenticationToken(actor, null, List.of(new SimpleGrantedAuthority("ROLE_STAFF")));
        when(actions.apply(original, actor, "STAFF")).thenThrow(new BusinessException(ErrorCode.FORBIDDEN, "Restore account access", HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> new OfflineStaffActionController(actions, reviews).apply(original, auth)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(reviews);
    }

    @Test void refundReviewRejectsAmountsThatWouldBeRoundedByTheDatabase() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            for (String amount : List.of("100.001", "10000000000000.00", "0.00", "-1.00")) {
                var decision = new ResolveOfflineStaffReviewRequest("RECORD_REFUND", "v1", "Full refund verified",
                        new BigDecimal(amount), true, "CASH", "RETURN-123", java.time.Instant.now());
                assertThat(validator.validate(decision)).as(amount).anyMatch(v -> v.getPropertyPath().toString().equals("actualAmount"));
            }
            var valid = new ResolveOfflineStaffReviewRequest("RECORD_REFUND", "v1", "Full refund verified",
                    new BigDecimal("100.01"), true, "CASH", "RETURN-123", java.time.Instant.now());
            assertThat(validator.validate(valid)).isEmpty();
        }
    }
}
