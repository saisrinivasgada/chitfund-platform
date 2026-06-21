package com.chitfund.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.domain.Page;

import java.util.List;

/**
 * Standardized paginated response.
 *
 * WHY pagination?
 * - Never return unbounded lists from a DB. A chit with 1000 members would send
 *   1000 rows in one response — slow, memory-intensive, bad UX.
 * - Pagination is a fundamental API design principle.
 *
 * DSA CONCEPT: This maps to the concept of "streaming" or "chunking" large datasets.
 * Database uses LIMIT + OFFSET internally (or cursor-based for high performance).
 *
 * INTERVIEW: "OFFSET pagination is simple but slow at large offsets (DB scans all prior rows).
 * Cursor-based pagination (using last seen ID) is O(log N) via index seek — used by
 * Twitter, Instagram feeds, Stripe's list APIs."
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PagedResponse<T> {

    private List<T> content;
    private int pageNumber;
    private int pageSize;
    private long totalElements;
    private int totalPages;
    private boolean last;
    private boolean first;

    public static <T> PagedResponse<T> from(Page<T> page) {
        return PagedResponse.<T>builder()
                .content(page.getContent())
                .pageNumber(page.getNumber())
                .pageSize(page.getSize())
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .last(page.isLast())
                .first(page.isFirst())
                .build();
    }
}
