package com.chitfund.auditservice.domain;

import com.chitfund.auditservice.repository.AuditLogRepository;
import org.hibernate.annotations.Immutable;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

class AuditLogImmutabilityTest {

    @Test
    void entityAndRepositoryExposeAnAppendOnlyContract() {
        assertThat(AuditLog.class.isAnnotationPresent(Immutable.class)).isTrue();
        assertThat(Arrays.stream(AuditLog.class.getDeclaredMethods())
                .anyMatch(method -> method.getName().equals("rejectMutation"))).isTrue();
        assertThat(Arrays.stream(AuditLogRepository.class.getMethods())
                .map(java.lang.reflect.Method::getName))
                .noneMatch(name -> name.startsWith("delete"));
    }
}
