# Production duplicate-settlement check

- Attempted at: `2026-09-10T18:10:39.516160+00:00`
- Target schema: `chitfund_payment`
- Intended session: `START TRANSACTION READ ONLY`, followed by rollback
- Query limit: MySQL `MAX_EXECUTION_TIME(5000)` optimizer hint
- Result: **not executed** — the database connection failed with a sanitized
  `OperationalError` after the connection timeout.
- Production rows returned: none
- Production data modified: none

No host, credentials, tenant IDs, member IDs, or row contents are stored here.

## Exact aggregate-only queries

This first query is the approved detection query for duplicate **live**
settlements. It was not executed because the connection could not be opened:

```sql
SELECT /*+ MAX_EXECUTION_TIME(5000) */
       COUNT(*) AS duplicate_member_groups,
       COALESCE(SUM(duplicate_count - 1), 0) AS excess_live_rows
FROM (
    SELECT tenant_id, member_id, COUNT(*) AS duplicate_count
    FROM settlements
    WHERE payment_status <> 'VOIDED'
    GROUP BY tenant_id, member_id
    HAVING COUNT(*) > 1
) AS duplicates;
```

V37 uses the first query as its safety check. The application refuses automatic
re-settlement of legacy VOIDED rows because they lack exact snapshots; V38 adds
the final supersession-aware live-row rule. The broader historical query below
is still useful as an audit count, but it is not a deployment prerequisite:

```sql
SELECT /*+ MAX_EXECUTION_TIME(5000) */
       COUNT(*) AS duplicate_member_groups,
       COALESCE(SUM(duplicate_count - 1), 0) AS excess_rows
FROM (
    SELECT tenant_id, member_id, COUNT(*) AS duplicate_count
    FROM settlements
    GROUP BY tenant_id, member_id
    HAVING COUNT(*) > 1
) AS duplicates;
```

```sql
SELECT /*+ MAX_EXECUTION_TIME(5000) */
       COUNT(*) AS null_tenant_rows
FROM settlements
WHERE tenant_id IS NULL;
```

The final query detects legacy rows that would otherwise bypass tenant-scoped
uniqueness and prevent `tenant_id` from being made non-null.
