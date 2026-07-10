package com.chitfund.chitservice.mapper;

import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.entity.ChitEnrollment;
import com.chitfund.chitservice.domain.entity.MonthReservation;
import com.chitfund.chitservice.domain.entity.MonthlyWinner;
import com.chitfund.chitservice.dto.response.*;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface ChitMapper {

    // enrolledCount, winnersAssigned, and attributes are set manually in ChitService
    @Mapping(target = "enrolledCount",  ignore = true)
    @Mapping(target = "winnersAssigned", ignore = true)
    @Mapping(target = "attributes",      ignore = true)
    ChitResponse toResponse(Chit chit);

    @Mapping(source = "chit.id", target = "chitId")
    ChitEnrollmentResponse toEnrollmentResponse(ChitEnrollment enrollment);

    @Mapping(source = "chit.id", target = "chitId")
    MonthlyWinnerResponse toWinnerResponse(MonthlyWinner winner);

    @Mapping(source = "chit.id", target = "chitId")
    @Mapping(target = "chitName", ignore = true)
    @Mapping(target = "eligibleToRealize", ignore = true)
    MonthReservationResponse toReservationResponse(MonthReservation reservation);
}
