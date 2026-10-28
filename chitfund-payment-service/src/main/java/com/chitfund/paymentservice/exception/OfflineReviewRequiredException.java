package com.chitfund.paymentservice.exception;

import com.chitfund.common.exception.*;
import org.springframework.http.HttpStatus;
import java.util.UUID;

public class OfflineReviewRequiredException extends BusinessException {
    private final UUID reviewId;
    public OfflineReviewRequiredException(UUID reviewId) {
        super(ErrorCode.OFFLINE_PAYMENT_REVIEW_REQUIRED,
                "Saved collection needs admin review. It has been preserved without applying money or creating credit.", HttpStatus.CONFLICT);
        this.reviewId = reviewId;
    }
    public UUID getReviewId() { return reviewId; }
}
