package com.chitfund.userservice.service;

import com.chitfund.userservice.domain.entity.PlanLimits;
import com.chitfund.userservice.repository.PlanLimitsRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.flyway.enabled=true"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class PlanMutationMySqlConcurrencyTest {

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitfund_users")
            .withUsername("chitfund")
            .withPassword("testpassword");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
    }

    @Autowired PlanLimitsRepository planRepository;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void concurrentPlanEditorsSerializeAndSecondEditorSeesFirstCommit() throws Exception {
        String code = "LOCKTEST";
        TransactionTemplate transactions = new TransactionTemplate(transactionManager);
        transactions.executeWithoutResult(status -> planRepository.saveAndFlush(PlanLimits.builder()
                .plan(code)
                .displayName("Original")
                .tagline("Original tagline")
                .features("[]")
                .capabilities("[]")
                .maxActiveChits(1)
                .maxMembers(20)
                .maxStaff(0)
                .allowedChitTypes("RESERVATION")
                .priceMonthlyInr(0)
                .isActive(true)
                .isPublic(false)
                .displayOrder(99)
                .build()));

        CountDownLatch firstHasLock = new CountDownLatch(1);
        CountDownLatch allowFirstCommit = new CountDownLatch(1);
        CountDownLatch secondHasLock = new CountDownLatch(1);
        AtomicReference<String> secondObservedName = new AtomicReference<>();
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> transactions.executeWithoutResult(status -> {
                PlanLimits plan = planRepository.findByPlanForUpdate(code).orElseThrow();
                firstHasLock.countDown();
                await(allowFirstCommit, "first plan update release");
                plan.setDisplayName("First editor name");
                planRepository.saveAndFlush(plan);
            }));

            var second = executor.submit(() -> transactions.executeWithoutResult(status -> {
                await(firstHasLock, "first plan lock");
                PlanLimits plan = planRepository.findByPlanForUpdate(code).orElseThrow();
                secondObservedName.set(plan.getDisplayName());
                secondHasLock.countDown();
                plan.setTagline("Second editor tagline");
                planRepository.saveAndFlush(plan);
            }));

            assertThat(firstHasLock.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(secondHasLock.await(500, TimeUnit.MILLISECONDS))
                    .as("second editor must wait for the first transaction")
                    .isFalse();
            allowFirstCommit.countDown();
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);
        } finally {
            allowFirstCommit.countDown();
            executor.shutdownNow();
        }

        assertThat(secondObservedName.get()).isEqualTo("First editor name");
        PlanLimits stored = planRepository.findById(code).orElseThrow();
        assertThat(stored.getDisplayName()).isEqualTo("First editor name");
        assertThat(stored.getTagline()).isEqualTo("Second editor tagline");
    }

    private static void await(CountDownLatch latch, String operation) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException(operation + " timed out");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(operation + " interrupted", exception);
        }
    }
}
