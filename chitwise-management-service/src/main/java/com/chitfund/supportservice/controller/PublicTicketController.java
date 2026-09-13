package com.chitfund.supportservice.controller;

import com.chitfund.supportservice.dto.request.CreatePublicInquiryRequest;
import com.chitfund.supportservice.dto.response.TicketResponse;
import com.chitfund.supportservice.service.TicketService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/public/tickets")
@RequiredArgsConstructor
public class PublicTicketController {
    private final TicketService ticketService;

    @PostMapping
    public ResponseEntity<?> createInquiry(@Valid @RequestBody CreatePublicInquiryRequest request) {
        TicketResponse ticket = ticketService.createPublicInquiry(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "success", true,
                "message", "Thanks! We'll reach out to you shortly.",
                "data", Map.of("ticketNumber", ticket.getTicketNumber())
        ));
    }
}

