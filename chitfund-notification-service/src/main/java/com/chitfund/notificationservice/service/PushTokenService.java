package com.chitfund.notificationservice.service;

import com.chitfund.notificationservice.repository.UserPushTokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class PushTokenService {

    private final UserPushTokenRepository repo;

    /**
     * Register (or refresh) an Expo push token for a user.
     *
     * <p>A single atomic upsert (see {@link UserPushTokenRepository#upsertToken}) keyed
     * on the unique token column. This replaces the former find-then-save, which raced
     * on the unique key for simultaneous first-time registrations (surfacing as a 500)
     * and could lose the latest owner on simultaneous hand-offs. When the token already
     * exists — e.g. a device hand-off or account switch — the row is reassigned in place,
     * preserving its id so in-flight queued deliveries resolve correctly.
     *
     * <p>The token value is never logged or echoed into log/error messages.
     */
    @Transactional
    public void register(UUID userId, String token, String platform) {
        repo.upsertToken(UUID.randomUUID().toString(), userId.toString(), token, platform,
                LocalDateTime.now());
        log.info("Push token registered/refreshed for userId={} platform={}", userId, platform);
    }

    /**
     * Called on logout — removes one specific token for the authenticated user.
     * Scoped to {@code userId} so a delayed logout for user A cannot delete a
     * device token that has since been re-assigned to user B. A no-op (token
     * already re-assigned or absent) is safe and idempotent.
     */
    @Transactional
    public void unregister(UUID userId, String token) {
        int removed = repo.deleteByUserIdAndToken(userId, token);
        log.info("Push token unregister for userId={} removed={}", userId, removed);
    }

    /** Remove all tokens for a user (all devices signed out, e.g. account deleted). */
    @Transactional
    public void unregisterAll(UUID userId) {
        repo.deleteByUserId(userId);
    }
}
