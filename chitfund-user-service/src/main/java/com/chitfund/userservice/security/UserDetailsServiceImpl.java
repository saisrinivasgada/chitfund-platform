package com.chitfund.userservice.security;

import com.chitfund.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * WHY implement UserDetailsService?
 * Spring Security's DaoAuthenticationProvider calls loadUserByUsername during the
 * /api/auth/login flow to fetch the user and verify the password.
 * We also add loadUserById for the JWT filter (token carries userId, not username).
 *
 * WHY @Transactional(readOnly = true)?
 * - readOnly = true tells Hibernate to skip dirty-checking on loaded entities.
 * - Slightly faster for SELECT-only operations.
 * - Also signals to the DB (via JDBC hint) that this is a read — some DBs can
 *   route read transactions to replicas.
 */
@Service
@RequiredArgsConstructor
public class UserDetailsServiceImpl implements UserDetailsService {

    private final UserRepository userRepository;

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
    }

    @Transactional(readOnly = true)
    public UserDetails loadUserById(String userId) {
        return userRepository.findById(UUID.fromString(userId))
                .orElseThrow(() -> new UsernameNotFoundException("User not found with id: " + userId));
    }
}
