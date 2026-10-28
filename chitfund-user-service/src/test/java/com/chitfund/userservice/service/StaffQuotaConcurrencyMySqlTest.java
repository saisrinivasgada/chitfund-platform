package com.chitfund.userservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.*;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.mapper.UserMapper;
import com.chitfund.userservice.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.*;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@DataJpaTest(properties={"spring.jpa.hibernate.ddl-auto=none","spring.flyway.enabled=true"})
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker=true)
@Transactional(propagation=Propagation.NOT_SUPPORTED)
class StaffQuotaConcurrencyMySqlTest {
    @Container static final MySQLContainer<?> MYSQL=new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitfund_users").withUsername("chitfund").withPassword("testpassword");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r){r.add("spring.datasource.url",MYSQL::getJdbcUrl);r.add("spring.datasource.username",MYSQL::getUsername);r.add("spring.datasource.password",MYSQL::getPassword);}
    @Autowired UserRepository users;
    @Autowired TenantRepository tenants;
    @Autowired TenantCustomLimitsRepository custom;
    @Autowired PlanLimitsRepository plans;
    @Autowired PlatformTransactionManager manager;
    PlanService service;
    Tenant tenant;
    @BeforeEach void setup(){
        var suffix=UUID.randomUUID().toString();tenant=tenants.saveAndFlush(Tenant.builder().name("Quota QA").slug("quota-"+suffix).plan("CUSTOM").build());
        custom.saveAndFlush(TenantCustomLimits.builder().tenantId(tenant.getId().toString()).maxStaff(1).allowedChitTypes("RESERVATION").build());
        service=new PlanService(plans,mock(PlanAddOnDefRepository.class),mock(TenantDiscountRepository.class),custom,tenants,users,new ObjectMapper(),mock(AuditClient.class));
    }
    @AfterEach void clear(){TenantContext.clear();SecurityContextHolder.clearContext();}
    User user(Role role,boolean enabled){return User.builder().username(UUID.randomUUID().toString()).passwordHash("fixture-only").role(role).tenantId(tenant.getId().toString()).enabled(enabled).build();}
    @Test void quotaUsesCurrentRowsEvenWhenEarlierUsernameLookupPinnedAnOlderSnapshot() throws Exception {
        var read=new CountDownLatch(1);var inserted=new CountDownLatch(1);var pool=Executors.newSingleThreadExecutor();
        try{
            var older=pool.submit(()->new TransactionTemplate(manager).execute(status->{
                users.existsByUsername("not-present-"+UUID.randomUUID());read.countDown();
                try{assertThat(inserted.await(5,TimeUnit.SECONDS)).isTrue();}catch(InterruptedException e){throw new RuntimeException(e);}
                try{service.checkStaffLimit(tenant.getId().toString());return false;}catch(BusinessException full){assertThat(full.getMessage()).contains("maximum of 1 staff");return true;}
            }));
            assertThat(read.await(5,TimeUnit.SECONDS)).isTrue();
            new TransactionTemplate(manager).executeWithoutResult(status->{service.checkStaffLimit(tenant.getId().toString());users.saveAndFlush(user(Role.STAFF,true));});
            inserted.countDown();assertThat(older.get(10,TimeUnit.SECONDS)).isTrue();
        }finally{inserted.countDown();pool.shutdownNow();}
    }
    @Test void reactivationAndAdminToStaffRoleChangeCannotBypassAnOccupiedQuota(){
        users.saveAndFlush(user(Role.STAFF,true));var inactive=users.saveAndFlush(user(Role.MANAGER,false));var admin=users.saveAndFlush(user(Role.ADMIN,true));
        var audit=mock(AuditClient.class);var serviceUser=new UserService(users,audit,service,mock(UserMapper.class),mock(RefreshTokenRepository.class),mock(TrustedDeviceRepository.class));
        var caller=user(Role.ADMIN,true);caller.setId(UUID.randomUUID());TenantContext.set(tenant.getId().toString());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(caller,null,List.of()));
        assertThatThrownBy(()->new TransactionTemplate(manager).execute(status->serviceUser.activateStaff(inactive.getId())))
                .isInstanceOf(BusinessException.class).hasMessageContaining("maximum of 1 staff");
        assertThatThrownBy(()->new TransactionTemplate(manager).execute(status->serviceUser.changeRole(admin.getId(),Role.STAFF)))
                .isInstanceOf(BusinessException.class).hasMessageContaining("maximum of 1 staff");
        assertThat(users.findById(inactive.getId()).orElseThrow().isEnabled()).isFalse();
        assertThat(users.findById(admin.getId()).orElseThrow().getRole()).isEqualTo(Role.ADMIN);verifyNoInteractions(audit);
    }
}
