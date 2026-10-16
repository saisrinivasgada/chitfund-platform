package com.chitfund.paymentservice.migration;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.paymentservice.domain.enums.PaymentMode;
import com.chitfund.paymentservice.dto.request.RecordPaymentRequest;
import com.chitfund.paymentservice.repository.OfflinePaymentReviewRepository;
import com.chitfund.paymentservice.repository.OfflineCommandReceiptRepository;
import com.chitfund.paymentservice.repository.*;
import com.chitfund.paymentservice.service.*;
import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import com.chitfund.paymentservice.client.*;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
import com.chitfund.paymentservice.exception.OfflineReviewRequiredException;
import com.chitfund.paymentservice.service.OfflinePaymentReviewCapture;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManagerFactory;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.*;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
import javax.sql.DataSource;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@Testcontainers(disabledWithoutDocker = true)
@SpringJUnitConfig(OfflinePaymentReviewPersistenceMySqlTest.Config.class)
class OfflinePaymentReviewPersistenceMySqlTest {
    @Container static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitfund_payments").withUsername("chitfund").withPassword("testpassword");
    @Autowired OfflinePaymentReviewCapture capture;
    @Autowired OfflinePaymentReviewRepository reviews;
    @Autowired PlatformTransactionManager transactions;
    @Autowired PaymentService payments;
    @Autowired PaymentRecordRepository records;
    @Autowired PaymentBatchRepository batches;
    @Autowired MemberCreditService credit;
    @Autowired AdminWalletService wallet;
    @BeforeEach void tenant() { TenantContext.set("review-test-org"); }
    @AfterEach void clear() { TenantContext.clear(); }

    private RecordPaymentRequest request() {
        var request = new RecordPaymentRequest(); request.setMemberId(UUID.randomUUID()); request.setChitId(UUID.randomUUID());
        request.setAmount(new BigDecimal("1000.00")); request.setPaymentMode(PaymentMode.CASH);
        request.setRecordedAt(Instant.parse("2026-10-15T12:00:00Z")); request.setOfflineAuthorization("preserved-original-proof");
        return request;
    }
    @Test void reviewSurvivesRollbackOfTheFinancialTransaction() throws Exception {
        String operation = UUID.randomUUID().toString(); UUID actor = UUID.randomUUID(); var original = request();
        UUID id = new TransactionTemplate(transactions).execute(status -> {
            UUID saved = capture.preserve(original, actor, operation, "DUES_CHANGED");
            status.setRollbackOnly(); return saved;
        });
        var saved = reviews.findByTenantIdAndOperationId("review-test-org", operation).orElseThrow();
        assertThat(saved.getId()).isEqualTo(id); assertThat(saved.getStatus()).isEqualTo("PENDING");
        assertThat(saved.getRequestJson()).contains("preserved-original-proof");
        try (var connection = MYSQL.createConnection(""); var query = connection.prepareStatement("SELECT COUNT(*) FROM payment_batches WHERE idempotency_key=?")) {
            query.setString(1, operation); try (var result = query.executeQuery()) { result.next(); assertThat(result.getInt(1)).isZero(); }
        }
    }
    @Test void simultaneousDeliveryOfTheSameConflictCreatesOneImmutableReview() throws Exception {
        String operation = UUID.randomUUID().toString(); UUID actor = UUID.randomUUID(); var original = request();
        var start = new CountDownLatch(1); var pool = Executors.newFixedThreadPool(2);
        Callable<UUID> send = () -> {
            TenantContext.set("review-test-org");
            try { start.await(); return capture.preserve(original, actor, operation, "DUES_CHANGED"); }
            finally { TenantContext.clear(); }
        };
        try {
            var first = pool.submit(send); var second = pool.submit(send); start.countDown();
            assertThat(first.get(20, TimeUnit.SECONDS)).isEqualTo(second.get(20, TimeUnit.SECONDS));
            original.setAmount(new BigDecimal("2000"));
            assertThatThrownBy(() -> capture.preserve(original, actor, operation, "DUES_CHANGED"))
                    .isInstanceOf(BusinessException.class).hasMessageContaining("different details");
            assertThat(reviews.findByTenantIdAndOperationId("review-test-org", operation).orElseThrow().getRequestJson()).contains("1000.00");
            assertThat(reviews.findByTenantIdAndOperationId("another-org", operation)).isEmpty();
        } finally { pool.shutdownNow(); }
    }

    @Test void twoDevicesCannotTurnOneOutstandingInstalmentIntoAnUnreviewedOverpayment() throws Exception {
        var firstPayment = request(); var secondPayment = request();
        secondPayment.setMemberId(firstPayment.getMemberId()); secondPayment.setChitId(firstPayment.getChitId());
        records.saveAndFlush(PaymentRecord.builder().tenantId("review-test-org").memberId(firstPayment.getMemberId())
                .chitId(firstPayment.getChitId()).monthNumber(1).dueDate(java.time.LocalDate.of(2026, 10, 15))
                .amountDue(new BigDecimal("1000.00")).amountPaid(BigDecimal.ZERO).status(PaymentRecordStatus.OUTSTANDING).build());
        clearInvocations(credit, wallet);
        var pool = Executors.newFixedThreadPool(2); var start = new CountDownLatch(1);
        java.util.function.Function<RecordPaymentRequest, Callable<String>> send = original -> () -> {
            TenantContext.set("review-test-org");
            try {
                start.await(); payments.recordPayment(original, UUID.randomUUID(), UUID.randomUUID().toString()); return "APPLIED";
            } catch (OfflineReviewRequiredException held) { return "HELD"; }
            finally { TenantContext.clear(); }
        };
        try {
            var first = pool.submit(send.apply(firstPayment)); var second = pool.submit(send.apply(secondPayment)); start.countDown();
            assertThat(List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS))).containsExactlyInAnyOrder("APPLIED", "HELD");
            var history = records.findByTenantIdAndMemberIdAndChitIdOrderByMonthNumberAsc("review-test-org", firstPayment.getMemberId(), firstPayment.getChitId());
            assertThat(history.get(0).getAmountPaid()).isEqualByComparingTo("1000");
            assertThat(batches.findByTenantIdAndMemberIdOrderByCreatedAtDesc("review-test-org", firstPayment.getMemberId())).hasSize(1);
            verify(wallet, times(1)).addEntry(any(), any(), eq("review-test-org"));
            verify(credit, never()).addCredit(any(), any(), any(), any(), any(), any());
        } finally { pool.shutdownNow(); }
    }

    @Configuration @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = OfflinePaymentReviewRepository.class,
        excludeFilters = @ComponentScan.Filter(type = FilterType.REGEX, pattern = ".*\\.repository\\.(?!OfflinePaymentReviewRepository$|OfflineCommandReceiptRepository$|PaymentRecordRepository$|PaymentBatchRepository$|PaymentAllocationRepository$).*"))
    static class Config {
        @Bean DataSource dataSource() { return new DriverManagerDataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword()); }
        @Bean Flyway flyway(DataSource source) {
            var flyway = Flyway.configure().dataSource(source).locations("classpath:db/migration").load(); flyway.migrate(); return flyway;
        }
        @Bean @DependsOn("flyway") LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource source) {
            var factory = new LocalContainerEntityManagerFactoryBean(); factory.setDataSource(source);
            factory.setPackagesToScan("com.chitfund.paymentservice.domain"); factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            factory.setJpaPropertyMap(Map.of("hibernate.type.preferred_uuid_jdbc_type", "VARCHAR",
                    "hibernate.physical_naming_strategy", "org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy")); return factory;
        }
        @Bean PlatformTransactionManager transactionManager(EntityManagerFactory factory) { return new JpaTransactionManager(factory); }
        @Bean ObjectMapper objectMapper() { return new ObjectMapper().findAndRegisterModules(); }
        @Bean OfflinePaymentReviewCapture capture(OfflinePaymentReviewRepository reviews, ObjectMapper mapper, OfflineCommandReceiptRepository receipts) { return new OfflinePaymentReviewCapture(reviews, mapper, receipts); }
        @Bean MemberCreditService credit() {
            var credit = mock(MemberCreditService.class); when(credit.getBalanceForUpdate(any())).thenReturn(BigDecimal.ZERO);
            when(credit.getBalance(any())).thenReturn(BigDecimal.ZERO); return credit;
        }
        @Bean AdminWalletService wallet() { return mock(AdminWalletService.class); }
        @Bean PaymentService payments(PaymentBatchRepository batches, PaymentRecordRepository records, PaymentAllocationRepository allocations,
                OfflinePaymentReviewCapture capture, MemberCreditService credit, AdminWalletService wallet) {
            var access = mock(PlanExpiryChecker.class); when(access.assertRecordedPaymentMaySync(any(), any(), any())).thenReturn("verified-grant");
            var members = mock(MemberServiceClient.class); when(members.isMemberActive(any())).thenReturn(true);
            return new PaymentService(batches, records, allocations, access, mock(PaymentEventPublisher.class), members,
                    mock(ChitServiceClient.class), wallet, mock(NotificationService.class), credit, mock(ChitMonthDrawService.class), mock(AuditClient.class), capture);
        }
    }
}
