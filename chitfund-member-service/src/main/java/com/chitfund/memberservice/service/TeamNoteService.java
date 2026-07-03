package com.chitfund.memberservice.service;

import com.chitfund.memberservice.domain.TeamNote;
import com.chitfund.memberservice.domain.enums.NoteVisibility;
import com.chitfund.memberservice.dto.request.TeamNoteRequest;
import com.chitfund.memberservice.dto.response.TeamNoteResponse;
import com.chitfund.memberservice.repository.TeamNoteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TeamNoteService {

    private final TeamNoteRepository repo;

    public List<TeamNoteResponse> getVisible(UUID userId, String role) {
        return repo.findVisibleTo(userId, role, NoteVisibility.SHARED)
                .stream()
                .map(n -> toResponse(n, userId))
                .collect(Collectors.toList());
    }

    @Transactional
    public TeamNoteResponse create(UUID authorId, String authorName, String authorRole,
                                   TeamNoteRequest req) {
        TeamNote note = TeamNote.builder()
                .authorId(authorId)
                .authorName(authorName)
                .authorRole(authorRole)
                .text(req.getText() == null ? "" : req.getText())
                .visibility(req.getVisibility())
                .build();
        return toResponse(repo.save(note), authorId);
    }

    @Transactional
    public TeamNoteResponse update(UUID noteId, UUID callerId, TeamNoteRequest req) {
        TeamNote note = repo.findById(noteId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Note not found"));
        if (!note.getAuthorId().equals(callerId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only edit your own notes");
        }
        if (req.getText() != null)       note.setText(req.getText());
        if (req.getVisibility() != null) note.setVisibility(req.getVisibility());
        return toResponse(repo.save(note), callerId);
    }

    @Transactional
    public void delete(UUID noteId, UUID callerId) {
        TeamNote note = repo.findById(noteId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Note not found"));
        if (!note.getAuthorId().equals(callerId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only delete your own notes");
        }
        repo.delete(note);
    }

    private TeamNoteResponse toResponse(TeamNote n, UUID callerId) {
        return TeamNoteResponse.builder()
                .id(n.getId())
                .authorId(n.getAuthorId())
                .authorName(n.getAuthorName())
                .authorRole(n.getAuthorRole())
                .text(n.getText())
                .visibility(n.getVisibility())
                .own(n.getAuthorId().equals(callerId))
                .createdAt(n.getCreatedAt())
                .updatedAt(n.getUpdatedAt())
                .build();
    }
}
