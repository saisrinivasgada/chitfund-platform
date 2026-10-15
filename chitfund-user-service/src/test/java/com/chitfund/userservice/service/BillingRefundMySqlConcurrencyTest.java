package com.chitfund.userservice.service;

import com.chitfund.common.outbox.DurableAuditOutbox;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.PlanPayment;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.dto.request.RecordRefundRequest;
import com.chitfund.userservice.dto.response.PaymentResponse;
import com.chitfund.userservice.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
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
class BillingRefundMySqlConcurrencyTest {
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

    @Autowired PlanPaymentRepository paymentRepo;
    @Autowired PlanReceiptRepository receiptRepo;
    @Autowired ReceiptNumberSeqRepository seqRepo;
    @Autowired TenantRepository tenantRepo;
    @Autowired PlanLimitsRepository planRepo;
    @Autowired UserRepository userRepo;
    @Autowired TenantCustomLimitsRepository customLimitsRepo;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void simultaneousSameKeyRefundCreatesOneReceiptAndOneAuditEvent() throws Exception {
        UUID requestedTenantId = UUID.randomUUID();
        AtomicReference<UUID> tenantId = new AtomicReference<>();
        String paymentId = UUID.randomUUID().toString();
        String actorId = UUID.randomUUID().toString();
        TransactionTemplate transactions = new TransactionTemplate(transactionManager);
        transactions.executeWithoutResult(status -> {
            Tenant savedTenant = tenantRepo.saveAndFlush(Tenant.builder().id(requestedTenantId)
                    .name("Concurrency Org").slug("concurrency-" + requestedTenantId)
                    .status("ACTIVE").plan("BASIC").creditBalanceInr(BigDecimal.ZERO).build());
            tenantId.set(savedTenant.getId());
            paymentRepo.save(PlanPayment.builder()
                    .id(paymentId).tenantId(savedTenant.getId().toString()).type("PURCHASE")
                    .status("COMPLETED").amountPaise(10_000L).grossAmountPaise(10_000L)
                    .toPlan("BASIC").toPlanName("Basic")
                    .planPeriodStart(LocalDate.now()).planPeriodEnd(LocalDate.now().plusDays(30))
                    .paymentMethod("UPI").paymentDate(LocalDate.now())
                    .idempotencyKey("original-" + paymentId)
                    .requestFingerprint("original-fingerprint").createdBy(actorId).build());
        });

        BillingService service = new BillingService(paymentRepo, receiptRepo, seqRepo,
                tenantRepo, planRepo, userRepo, customLimitsRepo,
                new AuditClient(new DurableAuditOutbox(jdbc),
                        new ObjectMapper().findAndRegisterModules()));
        RecordRefundRequest request = new RecordRefundRequest();
        request.setRefundAmountPaise(4_000L);
        request.setRefundReason("Approved concurrent correction");
        request.setRefundMethod("UPI");
        request.setRefundDate(LocalDate.now());
        request.setIdempotencyKey("same-refund-key");

        CountDownLatch start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> transactions.execute(status -> {
                await(start);
                return service.recordRefund(paymentId, request, actorId);
            }));
            var second = executor.submit(() -> transactions.execute(status -> {
                await(start);
                return service.recordRefund(paymentId, request, actorId);
            }));
            start.countDown();

            PaymentResponse firstResult = first.get(15, TimeUnit.SECONDS);
            PaymentResponse secondResult = second.get(15, TimeUnit.SECONDS);
            assertThat(firstResult.getId()).isEqualTo(secondResult.getId()).isEqualTo(paymentId);
        } finally {
            executor.shutdownNow();
        }

        assertThat(receiptRepo.findByPaymentId(paymentId))
                .filteredOn(receipt -> "REFUND".equals(receipt.getType()))
                .hasSize(1);
        assertThat(tenantId.get()).isNotNull();
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM audit_event_outbox WHERE entity_id=? " +
                        "AND payload LIKE '%REFUND_RECORDED%'", Long.class, paymentId))
                .isEqualTo(1L);
        PlanPayment stored = paymentRepo.findById(paymentId).orElseThrow();
        assertThat(stored.getRefundAmountPaise()).isEqualTo(4_000L);
        assertThat(stored.getRefundIdempotencyKey()).isEqualTo("same-refund-key");
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Concurrent refund start timed out");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Concurrent refund interrupted", exception);
        }
    }
}
