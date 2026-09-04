package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.AuditClient;
import com.chitfund.chitservice.client.NotificationClient;
import com.chitfund.chitservice.client.PaymentServiceClient;
import com.chitfund.chitservice.domain.entity.AuctionBid;
import com.chitfund.chitservice.domain.entity.AuctionSession;
import com.chitfund.chitservice.domain.enums.AuctionMode;
import com.chitfund.chitservice.domain.enums.AuctionStatus;
import com.chitfund.chitservice.dto.request.PlaceBidRequest;
import com.chitfund.chitservice.repository.AuctionBidRepository;
import com.chitfund.chitservice.repository.AuctionSessionRepository;
import com.chitfund.chitservice.repository.ChitEnrollmentRepository;
import com.chitfund.chitservice.repository.MonthlyWinnerRepository;
import com.chitfund.common.context.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuctionServiceConcurrencyTest {

    @Mock ChitService chitService;
    @Mock AuctionSessionRepository sessionRepository;
    @Mock AuctionBidRepository bidRepository;
    @Mock ChitEnrollmentRepository enrollmentRepository;
    @Mock MonthlyWinnerRepository winnerRepository;
    @Mock WinnerService winnerService;
    @Mock PaymentServiceClient paymentServiceClient;
    @Mock SimpMessagingTemplate messagingTemplate;
    @Mock NotificationClient notificationClient;
    @Mock AuditClient auditClient;

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void bidLocksAuctionAndPersistsTrustedTenant() {
        String tenantId = "tenant-a";
        TenantContext.set(tenantId);
        UUID chitId = UUID.randomUUID();
        UUID auctionId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        AuctionSession session = AuctionSession.builder()
                .id(auctionId)
                .tenantId(tenantId)
                .chitId(chitId)
                .auctionMode(AuctionMode.ONLINE)
                .status(AuctionStatus.OPEN)
                .scheduledPayoutAmount(new BigDecimal("100000"))
                .minBidStep(new BigDecimal("100"))
                .closesAt(LocalDateTime.now().plusMinutes(5))
                .build();
        PlaceBidRequest request = new PlaceBidRequest();
        request.setBidAmount(new BigDecimal("90000"));

        when(sessionRepository.findByIdAndChitIdAndTenantIdForUpdate(auctionId, chitId, tenantId))
                .thenReturn(Optional.of(session));
        when(enrollmentRepository.existsByChitIdAndMemberIdAndActiveTrue(chitId, memberId))
                .thenReturn(true);
        when(winnerRepository.findWinnerMemberIdsByChitId(chitId)).thenReturn(List.of());
        when(bidRepository.findTopByAuctionSessionIdAndTenantIdOrderByDiscountOfferedDescBidTimeAsc(
                auctionId, tenantId)).thenReturn(Optional.empty());
        when(bidRepository.findByAuctionSessionIdAndTenantIdOrderByDiscountOfferedDescBidTimeAsc(
                auctionId, tenantId)).thenReturn(List.of());
        when(bidRepository.save(any(AuctionBid.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service().placeBid(chitId, auctionId, request, memberId);

        verify(sessionRepository).findByIdAndChitIdAndTenantIdForUpdate(auctionId, chitId, tenantId);
        ArgumentCaptor<AuctionBid> captor = ArgumentCaptor.forClass(AuctionBid.class);
        verify(bidRepository).save(captor.capture());
        assertThat(captor.getValue().getTenantId()).isEqualTo(tenantId);
    }

    private AuctionService service() {
        return new AuctionService(
                chitService, sessionRepository, bidRepository, enrollmentRepository,
                winnerRepository, winnerService, paymentServiceClient, messagingTemplate,
                notificationClient, auditClient);
    }
}
