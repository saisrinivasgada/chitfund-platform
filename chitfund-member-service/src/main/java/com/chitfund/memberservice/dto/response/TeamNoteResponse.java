package com.chitfund.memberservice.dto.response;

import com.chitfund.memberservice.domain.enums.NoteVisibility;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class TeamNoteResponse {
    private UUID id;
    private UUID authorId;
    private String authorName;
    private String authorRole;
    private String text;
    private NoteVisibility visibility;
    private boolean own;         // true if the caller is the author
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
