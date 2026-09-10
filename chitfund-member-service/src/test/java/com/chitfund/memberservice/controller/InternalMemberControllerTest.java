package com.chitfund.memberservice.controller;

import com.chitfund.memberservice.domain.Member;
import com.chitfund.memberservice.domain.enums.MemberStatus;
import com.chitfund.memberservice.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InternalMemberControllerTest {
    @Mock private MemberRepository memberRepository;
    @InjectMocks private InternalMemberController controller;

    @BeforeEach
    void configureKey() {
        ReflectionTestUtils.setField(controller, "internalKey", "test-key");
    }

    @Test
    void activateIsIdempotentForInactiveMember() {
        UUID id = UUID.randomUUID();
        Member member = Member.builder().id(id).status(MemberStatus.INACTIVE).build();
        when(memberRepository.findById(id)).thenReturn(Optional.of(member));

        var response = controller.activateMember(id, "test-key");

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(member.getStatus()).isEqualTo(MemberStatus.ACTIVE);
        verify(memberRepository).save(member);
    }

    @Test
    void settlementSyncNeverOverridesBlacklist() {
        UUID id = UUID.randomUUID();
        Member member = Member.builder().id(id).status(MemberStatus.BLACKLISTED).build();
        when(memberRepository.findById(id)).thenReturn(Optional.of(member));

        var response = controller.activateMember(id, "test-key");

        assertThat(response.getStatusCode().value()).isEqualTo(409);
        assertThat(member.getStatus()).isEqualTo(MemberStatus.BLACKLISTED);
        verify(memberRepository, never()).save(any());
    }
}
