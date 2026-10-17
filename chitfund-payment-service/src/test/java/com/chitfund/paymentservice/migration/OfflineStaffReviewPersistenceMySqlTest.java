package com.chitfund.paymentservice.migration;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.*;
import com.chitfund.paymentservice.client.*;
import com.chitfund.paymentservice.domain.*;
import com.chitfund.paymentservice.domain.enums.CashRequestStatus;
import com.chitfund.paymentservice.dto.request.*;
import com.chitfund.paymentservice.dto.response.CashRequestResponse;
import com.chitfund.paymentservice.repository.*;
import com.chitfund.paymentservice.service.*;
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
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
import javax.sql.DataSource;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@Testcontainers(disabledWithoutDocker = true)
@SpringJUnitConfig(OfflineStaffReviewPersistenceMySqlTest.Config.class)
class OfflineStaffReviewPersistenceMySqlTest {
    @Container static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
        .withCommand("--log-bin-trust-function-creators=1").withDatabaseName("chitfund_payments").withUsername("chitfund").withPassword("testpassword");
    @Autowired OfflineStaffReviewService reviews;
    @Autowired OfflineStaffActionService actions;
    @Autowired CashPaymentRequestRepository requests;
    @Autowired OfflineStaffReviewRepository stored;
    @Autowired OfflineCommandReceiptRepository receipts;
    @Autowired CashRequestService cash;
    @Autowired DataSource dataSource;
    UUID actor;
    OfflineStaffActionRequest command;
    CashPaymentRequest task;
    @BeforeEach void setup() {
        TenantContext.set("staff-review-org"); actor=UUID.randomUUID(); clearInvocations(cash);
        task=requests.saveAndFlush(CashPaymentRequest.builder().tenantId(TenantContext.get()).memberId(UUID.randomUUID()).chitId(UUID.randomUUID())
            .status(CashRequestStatus.ASSIGNED).assignedStaffId(actor).requestedAmount(new BigDecimal("200")).build());
        command=new OfflineStaffActionRequest();command.setOperationId(UUID.randomUUID().toString());command.setRequestId(task.getId());
        command.setAction("PARTIAL_COLLECT");command.setCollectedAmount(new BigDecimal("100"));
        command.setExpectedUpdatedAt(task.getUpdatedAt().minusDays(1));command.setRecordedAt(Instant.now().minusSeconds(60));command.setOfflineAuthorization("historical-proof");
        command.setCollectionSnapshot(new OfflineStaffActionRequest.CollectionSnapshot(task.getMemberId(),task.getChitId(),task.getRequestedAmount()));
    }
    @AfterEach void clear(){TenantContext.clear();}
    ResolveOfflineStaffReviewRequest decision(UUID id,String kind) {
        return new ResolveOfflineStaffReviewRequest(kind,(String)reviews.detail(id,UUID.randomUUID(),true).get("version"),
            "Verified original physical collection",new BigDecimal("100"),true,"CASH","RETURN-123",Instant.now());
    }
    @Test void changedTaskRollsBackAndItsOriginalEvidenceSurvivesInSeparateReview() throws Exception {
        assertThatThrownBy(()->actions.apply(command,actor,"STAFF")).isInstanceOf(BusinessException.class).hasMessageContaining("changed");
        UUID id=reviews.preserve(command,actor,"STAFF",null);
        var saved=stored.findByIdAndTenantId(id,TenantContext.get()).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo("PENDING");assertThat(saved.getRequestJson()).contains("historical-proof");
        assertThat(receipts.findByTenantIdAndActorIdAndOperationId(TenantContext.get(),actor,command.getOperationId())).isEmpty();
        assertThat(requests.findByIdAndTenantId(task.getId(),TenantContext.get()).orElseThrow().getStatus()).isEqualTo(CashRequestStatus.ASSIGNED);
        try(var connection=dataSource.getConnection();var result=connection.createStatement().executeQuery("SELECT COUNT(*) FROM payment_batches")){
            result.next();assertThat(result.getInt(1)).isZero();
        }
        verifyNoInteractions(cash);
    }
    @Test void simultaneousIntakeKeepsOneImmutableReviewAndTenantIsolation() throws Exception {
        var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        Callable<UUID> intake=()->{TenantContext.set("staff-review-org");try{start.await();return reviews.preserve(command,actor,"STAFF",UUID.randomUUID());}finally{TenantContext.clear();}};
        try{
            var one=pool.submit(intake);var two=pool.submit(intake);start.countDown();UUID id=one.get(20,TimeUnit.SECONDS);
            assertThat(two.get(20,TimeUnit.SECONDS)).isEqualTo(id);
            command.setCollectedAmount(new BigDecimal("101"));assertThatThrownBy(()->reviews.preserve(command,actor,"STAFF",UUID.randomUUID())).isInstanceOf(BusinessException.class);
            assertThat(stored.findByIdAndTenantId(id,"another-org")).isEmpty();
        }finally{pool.shutdownNow();}
    }
    @Test void twoReviewersRecordOneCustodyAndOneReceiptWithNoMemberPayment() throws Exception {
        UUID id=reviews.preserve(command,actor,"STAFF",UUID.randomUUID());var d=decision(id,"RECORD_CUSTODY");
        var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        Callable<String> resolve=()->{TenantContext.set("staff-review-org");try{start.await();return(String)reviews.resolve(id,d,UUID.randomUUID()).get("status");}finally{TenantContext.clear();}};
        try{
            var one=pool.submit(resolve);var two=pool.submit(resolve);start.countDown();
            assertThat(one.get(20,TimeUnit.SECONDS)).isEqualTo("RECORDED");assertThat(two.get(20,TimeUnit.SECONDS)).isEqualTo("RECORDED");
            verify(cash,times(1)).partiallyCollect(task.getId(),d.actualAmount(),actor,"STAFF");
            assertThat(receipts.findByTenantIdAndActorIdAndOperationId(TenantContext.get(),actor,command.getOperationId())).isPresent();
        }finally{pool.shutdownNow();}
    }
    @Test void cancelledReviewPreventsLaterNormalDeliveryFromRecordingCash() {
        UUID id=reviews.preserve(command,actor,"STAFF",UUID.randomUUID());reviews.resolve(id,decision(id,"CANCEL_MISTAKE"),UUID.randomUUID());
        var result=actions.apply(command,actor,"STAFF");assertThat(result.path("offlineReviewResolution").asText()).isEqualTo("CANCELLED");verifyNoInteractions(cash);
    }
    @Test void cancellingMistakeAllowsANewRealCollectionOnlyAfterRefreshingTheTask() {
        assertNewCollectionAfterClosing("CANCEL_MISTAKE","CANCELLED");
    }
    @Test void recordingCompletedRefundAllowsALaterNewCollectionAfterRefreshingTheTask() {
        assertNewCollectionAfterClosing("RECORD_REFUND","REFUNDED");
    }
    void assertNewCollectionAfterClosing(String decision, String status) {
        UUID id=reviews.preserve(command,actor,"STAFF",UUID.randomUUID());
        var before=requests.findByIdAndTenantId(task.getId(),TenantContext.get()).orElseThrow().getUpdatedAt();
        reviews.resolve(id,decision(id,decision),UUID.randomUUID());
        var refreshed=requests.findByIdAndTenantId(task.getId(),TenantContext.get()).orElseThrow();
        assertThat(refreshed.getStatus()).isEqualTo(CashRequestStatus.ASSIGNED);
        assertThat(refreshed.getUpdatedAt()).isAfter(before);
        assertThat(actions.apply(command,actor,"STAFF").path("offlineReviewResolution").asText()).isEqualTo(status);
        verifyNoInteractions(cash);
        command.setOperationId(UUID.randomUUID().toString());command.setExpectedUpdatedAt(refreshed.getUpdatedAt());
        command.setRecordedAt(Instant.now());
        assertThat(actions.apply(command,actor,"STAFF").path("id").asText()).isEqualTo(task.getId().toString());
        verify(cash,times(1)).partiallyCollect(task.getId(),command.getCollectedAmount(),actor,"STAFF");
    }
    @Test void changingTaskAfterOpeningReviewCannotBeApprovedWithStaleVersion() {
        UUID id=reviews.preserve(command,actor,"STAFF",UUID.randomUUID());var d=decision(id,"CANCEL_MISTAKE");
        task.setAssignedStaffId(UUID.randomUUID());requests.saveAndFlush(task);
        assertThatThrownBy(()->reviews.resolve(id,d,UUID.randomUUID())).isInstanceOf(BusinessException.class).hasMessageContaining("changed during review");
        assertThat(stored.findByIdAndTenantId(id,TenantContext.get()).orElseThrow().getStatus()).isEqualTo("PENDING");verifyNoInteractions(cash);
    }
    @Test void unsignedUpgradePreservesExactBytesAndRequiresExplicitAdminEvidenceBeforeCustody() throws Exception {
        String raw="{\"requestId\":\""+task.getId()+"\",\"collectedAmount\":100}";
        String hash=java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        var old=new LegacyOfflineStaffActionRequest("PARTIAL_COLLECT-"+task.getId(),"PARTIAL_COLLECT",Instant.now().minusSeconds(60),raw,hash);
        UUID admin=UUID.randomUUID();UUID id=reviews.preserveLegacy(old,actor,"STAFF",admin);
        var saved=stored.findByIdAndTenantId(id,TenantContext.get()).orElseThrow();assertThat(saved.getLegacyPayloadJson()).isEqualTo(raw);assertThat(saved.getLegacyPayloadHash()).isEqualTo(hash);
        assertThat(reviews.detail(id,admin,true).get("authorizationVerified")).isEqualTo(false);
        assertThatThrownBy(()->reviews.resolve(id,decision(id,"RECORD_CUSTODY"),admin)).isInstanceOf(BusinessException.class).hasMessageContaining("older");verifyNoInteractions(cash);
        Instant verified=Instant.now().minusSeconds(120);
        var verifiedDecision=new ResolveOfflineStaffReviewRequest("RECORD_CUSTODY",(String)reviews.detail(id,admin,true).get("version"),"Checked original collector and cash evidence",new BigDecimal("100"),true,null,null,null,true,verified);
        assertThat(reviews.resolve(id,verifiedDecision,admin).get("status")).isEqualTo("RECORDED");
        assertThat(reviews.resolve(id,verifiedDecision,admin).get("status")).isEqualTo("RECORDED");verify(cash,times(1)).partiallyCollect(task.getId(),new BigDecimal("100"),actor,"STAFF");
        assertThat(receipts.findByTenantIdAndActorIdAndOperationId(TenantContext.get(),actor,old.operationId()).orElseThrow().getRecordedAt()).isEqualTo(verified);
        assertThat(stored.findByIdAndTenantId(id,TenantContext.get()).orElseThrow().getLegacyPayloadJson()).isEqualTo(raw);
        try(var connection=dataSource.getConnection();var result=connection.createStatement().executeQuery("SELECT COUNT(*) FROM payment_batches")){result.next();assertThat(result.getInt(1)).isZero();}
    }
    @Configuration @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses=OfflineStaffReviewRepository.class,
        excludeFilters=@ComponentScan.Filter(type=FilterType.REGEX,pattern=".*\\.repository\\.(?!OfflineStaffReviewRepository$|OfflineCommandReceiptRepository$|CashPaymentRequestRepository$).*"))
    static class Config {
        @Bean DataSource dataSource(){return new DriverManagerDataSource(MYSQL.getJdbcUrl(),MYSQL.getUsername(),MYSQL.getPassword());}
        @Bean Flyway flyway(DataSource ds){var f=Flyway.configure().dataSource(ds).locations("classpath:db/migration").load();f.migrate();return f;}
        @Bean @DependsOn("flyway") LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource ds){
            var f=new LocalContainerEntityManagerFactoryBean();f.setDataSource(ds);f.setPackagesToScan("com.chitfund.paymentservice.domain");f.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            f.setJpaPropertyMap(Map.of("hibernate.type.preferred_uuid_jdbc_type","VARCHAR","hibernate.physical_naming_strategy","org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy"));return f;
        }
        @Bean PlatformTransactionManager transactionManager(EntityManagerFactory f){return new JpaTransactionManager(f);}
        @Bean ObjectMapper json(){return new ObjectMapper().findAndRegisterModules();}
        @Bean UserServiceClient users(){var u=mock(UserServiceClient.class);when(u.verifyOfflineHistoricalEvidence(any())).thenReturn("grant-a");when(u.verifyOfflineRecordedAction(any())).thenReturn("grant-a");return u;}
        @Bean CashRequestService cash(){var c=mock(CashRequestService.class);when(c.partiallyCollect(any(),any(),any(),any())).thenAnswer(i->CashRequestResponse.builder().id(i.getArgument(0)).status(CashRequestStatus.PARTIALLY_COLLECTED).build());return c;}
        @Bean AuditClient audit(){return mock(AuditClient.class);}
        @Bean FinancialCommandLock locks(DataSource ds){return new FinancialCommandLock(new org.springframework.jdbc.core.JdbcTemplate(ds));}
        @Bean OfflineStaffReviewService reviews(OfflineStaffReviewRepository r,OfflineCommandReceiptRepository receipts,CashPaymentRequestRepository requests,CashRequestService cash,UserServiceClient users,FinancialCommandLock locks,AuditClient audit,ObjectMapper json,EntityManagerFactory f){
            return new OfflineStaffReviewService(r,receipts,requests,cash,users,locks,audit,json,SharedEntityManagerCreator.createSharedEntityManager(f));
        }
        @Bean OfflineStaffActionService actions(UserServiceClient users,CashRequestService cash,CashPaymentRequestRepository requests,OfflineCommandReceiptRepository receipts,ObjectMapper json,AuditClient audit,FinancialCommandLock locks,OfflineStaffReviewRepository reviews){return new OfflineStaffActionService(users,cash,requests,receipts,json,audit,locks,reviews);}
    }
}
