package com.chitfund.userservice.config;

import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataSeeder implements ApplicationRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    private static final String SUPER_ADMIN_USERNAME = "saisrinivas";
    private static final String SUPER_ADMIN_EMAIL    = "saisrinivasgada@gmail.com";
    private static final String SUPER_ADMIN_NAME     = "Sai Srinivas";
    private static final String SUPER_ADMIN_PASSWORD = "Password@1";

    @Override
    public void run(ApplicationArguments args) {
        if (userRepository.findByUsername(SUPER_ADMIN_USERNAME).isEmpty()) {
            User superAdmin = User.builder()
                    .username(SUPER_ADMIN_USERNAME)
                    .email(SUPER_ADMIN_EMAIL)
                    .fullName(SUPER_ADMIN_NAME)
                    .passwordHash(passwordEncoder.encode(SUPER_ADMIN_PASSWORD))
                    .role(Role.SUPER_ADMIN)
                    .enabled(true)
                    .mustChangePassword(false)
                    .build();
            userRepository.save(superAdmin);
            log.info("Super admin '{}' seeded", SUPER_ADMIN_USERNAME);
        }
    }
}
