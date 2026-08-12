package com.chitfund.notificationservice.repository;

import com.chitfund.notificationservice.domain.UserPushToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserPushTokenRepository extends JpaRepository<UserPushToken, UUID> {

    List<UserPushToken> findByUserId(UUID userId);

    Optional<UserPushToken> findByToken(String token);

    void deleteByToken(String token);

    void deleteByUserId(UUID userId);
}
