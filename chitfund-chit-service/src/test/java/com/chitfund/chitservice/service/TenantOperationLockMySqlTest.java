package com.chitfund.chitservice.service;

import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers(disabledWithoutDocker = true)
class TenantOperationLockMySqlTest {

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0.36")
            .withCommand("--log-bin-trust-function-creators=1").withDatabaseName("chit_lock_test")
            .withUsername("test")
            .withPassword("test");

    @Test
    void sameTenantOperationsSerializeUntilTheFirstTransactionCommits() throws Exception {
        try (Connection setup = connection()) {
            setup.createStatement().execute("""
                    CREATE TABLE tenant_operation_locks (
                      tenant_id VARCHAR(50) PRIMARY KEY,
                      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                    ) ENGINE=InnoDB
                    """);
            setup.createStatement().execute(
                    "INSERT INTO tenant_operation_locks (tenant_id) VALUES ('tenant-a')");
        }

        var executor = Executors.newSingleThreadExecutor();
        try (Connection first = connection()) {
            first.setAutoCommit(false);
            try (var statement = first.prepareStatement(
                    "SELECT tenant_id FROM tenant_operation_locks WHERE tenant_id=? FOR UPDATE")) {
                statement.setString(1, "tenant-a");
                statement.executeQuery().next();
            }

            var secondAcquired = executor.submit(() -> {
                try (Connection second = connection()) {
                    second.setAutoCommit(false);
                    try (var statement = second.prepareStatement(
                            "SELECT tenant_id FROM tenant_operation_locks WHERE tenant_id=? FOR UPDATE")) {
                        statement.setString(1, "tenant-a");
                        statement.executeQuery().next();
                    }
                    second.commit();
                    return true;
                }
            });

            assertThatThrownBy(() -> secondAcquired.get(300, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);

            first.commit();
            assertThat(secondAcquired.get(3, TimeUnit.SECONDS)).isTrue();
        } finally {
            executor.shutdownNow();
        }
    }

    private Connection connection() throws Exception {
        return DriverManager.getConnection(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
    }
}
