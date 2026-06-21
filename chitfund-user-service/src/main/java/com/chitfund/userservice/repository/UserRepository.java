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

    java.util.List<User> findByRoleIn(java.util.List<com.chitfund.userservice.domain.enums.Role> roles);

    java.util.List<User> findByRoleInAndDeletedAtIsNull(java.util.List<com.chitfund.userservice.domain.enums.Role> roles);

    java.util.List<User> findByRoleInAndDeletedAtIsNotNull(java.util.List<com.chitfund.userservice.domain.enums.Role> roles);
}