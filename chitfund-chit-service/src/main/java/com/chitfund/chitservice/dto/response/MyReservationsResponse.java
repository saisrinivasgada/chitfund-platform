package com.chitfund.chitservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * A member's own view of a chit's reservation schedule.
 *
 * <p>Deliberately split in two: {@code mySlots} carries full detail for the
 * slots the caller holds, while {@code outline} describes every other month
 * only as taken/open. No other member's id ever appears here — that is the
 * whole point of this DTO existing alongside {@link MonthReservationResponse},
 * which is admin-only.
 */
@Data
@Builder
public class MyReservationsResponse {

    private List<MySlot> mySlots;
    private List<OutlineEntry> outline;

    @Data
    @Builder
    public static class MySlot {
        private UUID id;
        private Integer monthNumber;
        private LocalDate reservationMonth;
        private BigDecimal payoutAmount;
        private BigDecimal postPayoutContribution;
        /** RESERVED or PROCESSED — VOIDED slots are filtered out. */
        private String status;
    }

    /** One month of the schedule, anonymised. */
    @Data
    @Builder
    public static class OutlineEntry {
        private Integer monthNumber;
        private LocalDate reservationMonth;
        /** True when this month belongs to the caller. */
        private boolean mine;
        /** True when someone (anyone) holds it, or the org does. */
        private boolean taken;
        private boolean orgHeld;
        private boolean processed;
    }
}
