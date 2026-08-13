package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * WHY Spring Data JPA interfaces?
 * - Zero boilerplate: findByUsername generates "SELECT * FROM users WHERE username = ?"
 * - Method names are contracts — misspell a field and it fails at startup, not runtime
 * - EXISTS queries (existsByUsername) are more efficient than findBy — they use
 *   "SELECT 1 WHERE EXISTS(...)" instead of fetching the full row
 *
 * INTERVIEW: "Spring Data translates method names to JPQL at startup via reflection.
 * For complex queries use @Query with JPQL or native SQL. For reporting queries
 * with many filters, consider QueryDSL or Specifications (Criteria API)."
 */
public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByUsername(String username);

    Optional<User> findByEmail(String email);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    boolean existsByEmailAndDeletedAtIsNull(String email);

    // Check if any active non-MEMBER account holds this email (used when creating member logins)
    boolean existsByEmailAndRoleNotAndDeletedAtIsNull(String email, com.chitfund.userservice.domain.enums.Role role);

    java.util.List<User> findByRoleIn(java.util.List<com.chitfund.userservice.domain.enums.Role> roles);

    java.util.List<User> findByRoleInAndDeletedAtIsNull(java.util.List<com.chitfund.userservice.domain.enums.Role> roles);

    long countByRoleInAndDeletedAtIsNullAndEnabledTrue(java.util.List<com.chitfund.userservice.domain.enums.Role> roles);

    java.util.List<User> findByRoleInAndDeletedAtIsNotNull(java.util.List<com.chitfund.userservice.domain.enums.Role> roles);

    // Mobile login: match phone number + country code together
    java.util.List<User> findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull(String phone, String phoneCountryCode);

    // Used for duplicate-phone-in-category check: "does any active account with this phone
    // already belong to one of these roles?"
    boolean existsByPhoneAndRoleInAndDeletedAtIsNull(String phone, java.util.List<com.chitfund.userservice.domain.enums.Role> roles);

    // Recovery path for partial create-login: find an existing active MEMBER by email
    // so we can reuse them instead of failing with EMAIL_TAKEN on retry.
    Optional<User> findByEmailAndRoleAndDeletedAtIsNull(String email, com.chitfund.userservice.domain.enums.Role role);

    // Tenant-scoped staff list: filter directly on users.tenant_id + users.role
    java.util.List<User> findByTenantIdAndRoleInAndDeletedAtIsNull(
        String tenantId,
        java.util.List<com.chitfund.userservice.domain.enums.Role> roles);

    java.util.List<User> findByTenantIdAndRoleInAndDeletedAtIsNotNull(
        String tenantId,
        java.util.List<com.chitfund.userservice.domain.enums.Role> roles);

    // Tenant-scoped staff count for plan limit enforcement
    long countByTenantIdAndRoleInAndDeletedAtIsNullAndEnabledTrue(
        String tenantId,
        java.util.List<com.chitfund.userservice.domain.enums.Role> roles);
}