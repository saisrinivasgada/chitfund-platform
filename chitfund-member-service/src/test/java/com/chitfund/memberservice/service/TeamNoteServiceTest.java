package com.chitfund.memberservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.memberservice.domain.TeamNote;
import com.chitfund.memberservice.domain.enums.NoteVisibility;
import com.chitfund.memberservice.dto.request.TeamNoteRequest;
import com.chitfund.memberservice.repository.TeamNoteRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TeamNoteServiceTest {

    @Mock
    private TeamNoteRepository repository;

    @InjectMocks
    private TeamNoteService service;

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void listsOnlyThroughTenantScopedQuery() {
        UUID userId = UUID.randomUUID();
        TenantContext.set("tenant-a");
        when(repository.findVisibleTo("tenant-a", userId, "ADMIN", NoteVisibility.SHARED))
                .thenReturn(List.of());

        service.getVisible(userId, "ADMIN");

        verify(repository).findVisibleTo("tenant-a", userId, "ADMIN", NoteVisibility.SHARED);
    }

    @Test
    void assignsTrustedTenantContextWhenCreatingNote() {
        UUID userId = UUID.randomUUID();
        TenantContext.set("tenant-a");
        TeamNoteRequest request = new TeamNoteRequest();
        request.setText("tenant note");
        request.setVisibility(NoteVisibility.PRIVATE);
        when(repository.save(any(TeamNote.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.create(userId, "Admin", "ADMIN", request);

        var captor = org.mockito.ArgumentCaptor.forClass(TeamNote.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getTenantId()).isEqualTo("tenant-a");
    }

    @Test
    void cannotUpdateNoteOutsideCurrentTenant() {
        UUID noteId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        TenantContext.set("tenant-a");
        when(repository.findByIdAndTenantId(noteId, "tenant-a")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.update(noteId, userId, new TeamNoteRequest()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404 NOT_FOUND");

        verify(repository, never()).save(any());
    }

    @Test
    void failsClosedWithoutTenantContext() {
        assertThatThrownBy(() -> service.getVisible(UUID.randomUUID(), "ADMIN"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("401 UNAUTHORIZED");

        verify(repository, never()).findVisibleTo(any(), any(), any(), any());
    }
}
