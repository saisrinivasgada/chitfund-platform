package com.chitfund.memberservice.dto.request;

import com.chitfund.memberservice.domain.enums.NoteVisibility;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class TeamNoteRequest {

    @Size(max = 4000, message = "Note text must be under 4000 characters")
    private String text;

    @NotNull
    private NoteVisibility visibility;
}
