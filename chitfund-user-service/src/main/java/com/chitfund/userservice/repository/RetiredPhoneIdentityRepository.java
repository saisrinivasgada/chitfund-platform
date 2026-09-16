package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.RetiredPhoneIdentity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface RetiredPhoneIdentityRepository extends JpaRepository<RetiredPhoneIdentity, UUID> {}
