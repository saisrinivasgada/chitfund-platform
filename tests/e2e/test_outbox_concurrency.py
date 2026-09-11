"""Production-version MySQL checks for outbox worker coordination."""

from __future__ import annotations

import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest

pytestmark = pytest.mark.concurrency


def _connect():
    pymysql = pytest.importorskip("pymysql")
    host = os.getenv("TEST_DB_HOST", "127.0.0.1")
    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError("outbox concurrency test is restricted to disposable loopback MySQL")
    return pymysql.connect(
        host=host,
        port=int(os.getenv("TEST_DB_PORT", "4306")),
        user="root",
        password="testpassword",
        database="chitfund_payment",
        autocommit=False,
    )


def test_two_mysql_workers_claim_without_overlap_and_stale_finalize_loses():
    table = f"event_outbox_claim_test_{uuid.uuid4().hex}"
    delivery_ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    setup = _connect()
    try:
        with setup.cursor() as cursor:
            cursor.execute(f"""
                CREATE TABLE `{table}` (
                    delivery_id VARCHAR(36) PRIMARY KEY,
                    status VARCHAR(16) NOT NULL,
                    available_at DATETIME(6) NOT NULL,
                    claimed_until DATETIME(6) NULL,
                    lease_token VARCHAR(36) NULL,
                    created_at DATETIME(6) NOT NULL,
                    INDEX idx_pending (status, available_at, delivery_id),
                    INDEX idx_expired (status, claimed_until, delivery_id)
                ) ENGINE=InnoDB
                """)
            for delivery_id in delivery_ids:
                cursor.execute(f"""
                    INSERT INTO `{table}` (
                        delivery_id, status, available_at, created_at)
                    VALUES (%s, 'PENDING', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))
                    """, (delivery_id,))
        setup.commit()

        barrier = threading.Barrier(2)

        def claim(lease_token):
            connection = _connect()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET TRANSACTION ISOLATION LEVEL READ COMMITTED")
                    cursor.execute("START TRANSACTION")
                    cursor.execute(f"""
                        SELECT delivery_id FROM `{table}`
                        WHERE status='PENDING' AND available_at <= UTC_TIMESTAMP(6)
                        ORDER BY available_at, delivery_id LIMIT 1
                        FOR UPDATE SKIP LOCKED
                        """)
                    row = cursor.fetchone()
                    assert row is not None
                    barrier.wait(timeout=5)
                    cursor.execute(f"""
                        UPDATE `{table}` SET status='IN_FLIGHT', lease_token=%s,
                            claimed_until=DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 SECOND)
                        WHERE delivery_id=%s
                        """, (lease_token, row[0]))
                connection.commit()
                return row[0]
            finally:
                connection.close()

        lease_a, lease_b = str(uuid.uuid4()), str(uuid.uuid4())
        with ThreadPoolExecutor(max_workers=2) as executor:
            claimed = [future.result(timeout=10) for future in (
                executor.submit(claim, lease_a), executor.submit(claim, lease_b))]
        assert len(set(claimed)) == 2

        with setup.cursor() as cursor:
            cursor.execute(f"""
                UPDATE `{table}` SET status='PUBLISHED'
                WHERE delivery_id=%s AND lease_token=%s AND status='IN_FLIGHT'
                """, (claimed[0], lease_a))
            correct_finalize = cursor.rowcount
            cursor.execute(f"""
                UPDATE `{table}`
                SET claimed_until=DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 SECOND)
                WHERE delivery_id=%s AND lease_token=%s
                """, (claimed[1], lease_b))
        setup.commit()

        reclaimed_lease = str(uuid.uuid4())
        with setup.cursor() as cursor:
            cursor.execute("SET TRANSACTION ISOLATION LEVEL READ COMMITTED")
            cursor.execute("START TRANSACTION")
            cursor.execute(f"""
                SELECT delivery_id FROM `{table}`
                WHERE status='IN_FLIGHT' AND claimed_until < UTC_TIMESTAMP(6)
                ORDER BY claimed_until, delivery_id LIMIT 1
                FOR UPDATE SKIP LOCKED
                """)
            reclaimed = cursor.fetchone()
            assert reclaimed == (claimed[1],)
            cursor.execute(f"""
                UPDATE `{table}` SET lease_token=%s,
                    claimed_until=DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 SECOND)
                WHERE delivery_id=%s
                """, (reclaimed_lease, claimed[1]))
        setup.commit()

        with setup.cursor() as cursor:
            cursor.execute(f"""
                UPDATE `{table}` SET status='PUBLISHED'
                WHERE delivery_id=%s AND lease_token=%s AND status='IN_FLIGHT'
                """, (claimed[1], lease_b))
            stale_finalize = cursor.rowcount
            cursor.execute(f"""
                UPDATE `{table}` SET status='PUBLISHED'
                WHERE delivery_id=%s AND lease_token=%s AND status='IN_FLIGHT'
                """, (claimed[1], reclaimed_lease))
            reclaimed_finalize = cursor.rowcount
        setup.commit()
        assert correct_finalize == 1
        assert stale_finalize == 0
        assert reclaimed_finalize == 1
    finally:
        try:
            with setup.cursor() as cursor:
                cursor.execute(f"DROP TABLE IF EXISTS `{table}`")
            setup.commit()
        finally:
            setup.close()
