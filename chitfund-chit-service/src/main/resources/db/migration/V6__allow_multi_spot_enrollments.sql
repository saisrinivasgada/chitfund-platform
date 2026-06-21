-- V6: Remove the unique constraint that prevented one member from holding
-- multiple spots in the same chit.
--
-- WHY remove uk_chit_member?
-- Business rule: a member may invest in multiple slots (e.g. admin holds 2 spots).
-- Each row in chit_enrollments now represents one spot, not one member.
-- The capacity guard (countByChitIdAndActiveTrue < totalMembers) is enforced
-- in the service layer, not at the DB constraint level.
--
-- We add a non-unique index on (chit_id, member_id) to keep lookups fast.

ALTER TABLE chit_enrollments
    DROP INDEX uk_chit_member,
    ADD INDEX idx_enrollments_chit_member (chit_id, member_id);
