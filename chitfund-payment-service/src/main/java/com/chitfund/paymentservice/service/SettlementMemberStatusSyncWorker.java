package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.client.MemberServiceClient;
import com.chitfund.paymentservice.repository.SettlementMemberStatusSyncRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
@Slf4j
public class SettlementMemberStatusSyncWorker {
    private final SettlementMemberStatusSyncRepository repository;
    private final SettlementMemberStatusSyncStore store;
    private final MemberServiceClient memberServiceClient;

    @Scheduled(fixedDelayString = "${chitwise.settlement-member-sync-delay-ms:5000}")
    public void processReady() {
        for (var id : repository.findReadyIds(LocalDateTime.now(), PageRequest.of(0, 25))) {
            var claimed = store.claim(id);
            if (claimed.isEmpty()) continue;
            try {
                var sync = claimed.get();
                memberServiceClient.setMemberStatus(sync.getMemberId(), sync.getDesiredStatus());
                store.complete(id, sync.getClaimToken());
            } catch (Exception error) {
                log.warn("Member status sync {} failed; it will retry", id);
                store.fail(id, claimed.get().getClaimToken(), error);
            }
        }
    }
}
