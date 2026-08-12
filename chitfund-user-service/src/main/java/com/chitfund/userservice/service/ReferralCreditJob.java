package com.chitfund.userservice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class ReferralCreditJob {

    private final PromotionService promotionService;

    // Runs daily at 02:00 — releases referral credits where 30 days have elapsed since org activation
    @Scheduled(cron = "0 0 2 * * *")
    public void releaseMaturedReferralCredits() {
        log.info("ReferralCreditJob: checking for matured referral credits");
        promotionService.releaseMaturedCredits();
        log.info("ReferralCreditJob: done");
    }
}
