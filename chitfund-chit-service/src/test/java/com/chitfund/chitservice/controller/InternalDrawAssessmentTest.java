package com.chitfund.chitservice.controller;

import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.entity.MonthReservation;
import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.domain.enums.ChitType;
import com.chitfund.chitservice.domain.enums.ReservationStatus;
import com.chitfund.chitservice.domain.enums.WinnerSelectionMode;
import com.chitfund.chitservice.dto.response.DrawMemberAmountResponse;
import com.chitfund.chitservice.mapper.ChitMapper;
import com.chitfund.chitservice.repository.ChitEnrollmentRepository;
import com.chitfund.chitservice.repository.ChitRepository;
import com.chitfund.chitservice.repository.MonthReservationRepository;
import com.chitfund.chitservice.repository.MonthlyWinnerRepository;
import com.chitfund.chitservice.service.ChitService;
import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class InternalDrawAssessmentTest {
    private static final String KEY = "test-internal-key";
    private static final String TENANT = "tenant-a";

    @Mock ChitEnrollmentRepository enrollmentRepository;
    @Mock ChitRepository chitRepository;
    @Mock MonthReservationRepository reservationRepository;
    @Mock MonthlyWinnerRepository winnerRepository;
    @Mock ChitMapper chitMapper;
    @Mock ChitService chitService;

    InternalSettlementController controller;

    @BeforeEach
    void setUp() {
        controller = new InternalSettlementController(enrollmentRepository, chitRepository,
                reservationRepository, winnerRepository, chitMapper, chitService);
        ReflectionTestUtils.setField(controller, "internalKey", KEY);
    }

    @Test
    @SuppressWarnings("unchecked")
    void reservationDuesUseSpotCountsAndPerWinnerContribution() {
        UUID chitId = UUID.randomUUID();
        UUID winner = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        Chit chit = Chit.builder()
                .id(chitId).tenantId(TENANT).name("Gold")
                .chitType(ChitType.RESERVATION).winnerSelectionMode(WinnerSelectionMode.RESERVATION)
                .status(ChitStatus.ACTIVE).chitValue(new BigDecimal("10000.00"))
                .totalAmount(new BigDecimal("10000.00"))
                .installmentAmount(new BigDecimal("1000.00"))
                .capacity(3).durationMonths(3)
                .postPayoutContributionEnabled(true)
                .defaultPostPayoutContribution(new BigDecimal("500.00"))
                .build();
        MonthReservation processed = MonthReservation.builder()
                .chit(chit).memberId(winner).monthNumber(1)
                .status(ReservationStatus.PROCESSED)
                .postPayoutContribution(new BigDecimal("400.00"))
                .createdBy(UUID.randomUUID()).build();

        when(chitRepository.findByIdAndTenantIdAndDeletedAtIsNull(chitId, TENANT))
                .thenReturn(Optional.of(chit));
        when(enrollmentRepository.findActiveMemberIdsByChitIdAndTenantId(chitId, TENANT))
                .thenReturn(List.of(winner, winner, other));
        when(reservationRepository.findByChitIdAndTenantId(chitId, TENANT))
                .thenReturn(List.of(processed));

        ApiResponse<List<DrawMemberAmountResponse>> body =
                (ApiResponse<List<DrawMemberAmountResponse>>) controller
                        .getDrawMemberAmounts(chitId, TENANT, KEY).getBody();

        assertThat(body).isNotNull();
        assertThat(body.getData()).extracting(DrawMemberAmountResponse::getMemberId,
                        DrawMemberAmountResponse::getAmountDue)
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple(winner, new BigDecimal("1400.00")),
                        org.assertj.core.groups.Tuple.tuple(other, new BigDecimal("1000.00")));
    }

    @Test
    void foreignTenantChitCannotBeAssessed() {
        UUID chitId = UUID.randomUUID();
        when(chitRepository.findByIdAndTenantIdAndDeletedAtIsNull(chitId, TENANT))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.getDrawMemberAmounts(chitId, TENANT, KEY))
                .isInstanceOf(ResourceNotFoundException.class);

        verify(enrollmentRepository, never())
                .findActiveMemberIdsByChitIdAndTenantId(chitId, TENANT);
    }
}
