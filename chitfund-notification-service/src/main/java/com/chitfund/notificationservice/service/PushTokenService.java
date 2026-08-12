package com.chitfund.notificationservice.service;

import com.chitfund.notificationservice.domain.UserPushToken;
import com.chitfund.notificationservice.repository.UserPushTokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class PushTokenService {

    private final UserPushTokenRepository repo;

    /**
     * Register (or refresh) an Expo push token for a user.
     * If the token already exists for a different user it is re-assigned —
     * this handles device hand-offs and account switches.
     */
    @Transactional
    public void register(UUID userId, String token, String platform) {
        Optional<UserPushToken> existing = repo.findByToken(token);
        if (existing.isPresent()) {
            UserPushToken t = existing.get();
            t.setUserId(userId);
            t.setPlatform(platform);
            repo.save(t);
            log.info("Push token re-assigned to userId={}", userId);
        } else {
            repo.save(UserPushToken.builder()
                    .userId(userId)
                    .token(token)
                    .platform(platform)
                    .build());
            log.info("Push token registered for userId={} platform={}", userId, platform);
        }
    }

    /** Called on logout — removes one specific token (device signed out). */
    @Transactional
    public void unregister(String token) {
        repo.deleteByToken(token);
        log.info("Push token unregistered: ...{}", token.substring(Math.max(0, token.length() - 8)));
    }

    /** Remove all tokens for a user (all devices signed out, e.g. account deleted). */
    @Transactional
    public void unregisterAll(UUID userId) {
        repo.deleteByUserId(userId);
    }
}
