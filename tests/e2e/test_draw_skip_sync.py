"""Coordinated skips against real chit/payment services and their independent DBs."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import time
import uuid
import pytest

pytestmark = pytest.mark.concurrency


def _wait_terminal(api, admin, chit_id):
    deadline = time.monotonic() + 35
    last = None
    while time.monotonic() < deadline:
        response = api.as_role("GET", f"{api.chit}/api/chits/{chit_id}/lifecycle-sync", admin)
        assert response.status_code == 200, response.text[:300]
        last = response.json()["data"]
        if last["status"] in ("COMPLETED", "REJECTED", "FAILED"):
            assert last["status"] != "FAILED", last
            return last["status"]
        time.sleep(0.2)
    pytest.fail(f"skip command never reached a terminal result: {last}")


def _request(chit, member):
    return dict(attemptId=str(uuid.uuid4()), chitId=chit, monthNumber=1, dueDate="2026-01-01",
                installmentAmount="1000.00", memberIds=[member], skipReason="Holiday pause")


def test_duplicate_skip_is_one_waiver_one_schedule_shift(api, db, token, active_chit, member_factory):
    admin = token("ADMIN"); member = member_factory(admin); chit = active_chit(admin, [member])
    before = api.as_role("GET", f"{api.chit}/api/chits/{chit}", admin).json()["data"]
    body = _request(chit, member)
    def submit():
        return api.as_role("POST", f"{api.chit}/api/chits/{chit}/skip-draw", admin, json=body)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: submit(), range(2)))
    assert all(r.status_code == 202 for r in responses), [r.text[:300] for r in responses]
    assert responses[0].json()["data"]["commandId"] == responses[1].json()["data"]["commandId"]
    assert _wait_terminal(api, admin, chit) == "COMPLETED"
    assert submit().json()["data"]["status"] == "COMPLETED"
    after = api.as_role("GET", f"{api.chit}/api/chits/{chit}", admin).json()["data"]
    assert after["scheduleSyncCommandId"] is None
    old = date.fromisoformat(before["endDate"]); new = date.fromisoformat(after["endDate"])
    assert (new.year * 12 + new.month) - (old.year * 12 + old.month) == 1
    assert db.scalar("chitfund_payment", "SELECT COUNT(*) FROM payment_records WHERE chit_id=%s AND status='WAIVED'", (chit,)) == 1
    assert db.scalar("chitfund_chit", "SELECT MIN(month_number) FROM month_reservations WHERE chit_id=%s AND status<>'VOIDED'", (chit,)) == 2
    assert db.scalar("chitfund_chit", "SELECT COUNT(*) FROM chit_lifecycle_commands WHERE chit_id=%s AND command_type='SKIP_DRAW'", (chit,)) == 1


def test_open_racing_skip_resolves_without_freezing_or_shifting_an_open_draw(api, db, token, active_chit, member_factory):
    admin = token("ADMIN"); member = member_factory(admin); chit = active_chit(admin, [member])
    body = _request(chit, member)
    def skip():
        return api.as_role("POST", f"{api.chit}/api/chits/{chit}/skip-draw", admin, json=body)
    def open_draw():
        return api.as_role("POST", f"{api.payment}/admin/draws/open", admin, json={
            "chitId": chit, "monthNumber": 1, "dueDate": "2026-01-01", "installmentAmount": "1000.00",
            "maxCycles": 12, "members": [{"memberId": member, "amountDue": "1000.00"}]})
    with ThreadPoolExecutor(max_workers=2) as pool:
        a, b = pool.submit(skip), pool.submit(open_draw)
        skip_response, open_response = a.result(), b.result()
    assert skip_response.status_code == 202, skip_response.text[:300]
    assert open_response.status_code in (201, 400, 409), open_response.text[:300]
    terminal = _wait_terminal(api, admin, chit)
    after = api.as_role("GET", f"{api.chit}/api/chits/{chit}", admin).json()["data"]
    assert after["scheduleSyncCommandId"] is None
    rows = db.query("chitfund_payment", "SELECT status FROM chit_month_draws WHERE chit_id=%s", (chit,))
    assert len(rows) == 1
    first_slot = db.scalar("chitfund_chit", "SELECT MIN(month_number) FROM month_reservations WHERE chit_id=%s AND status<>'VOIDED'", (chit,))
    assert (terminal, rows[0]["status"], first_slot) in (("COMPLETED", "SKIPPED", 2), ("REJECTED", "OPEN", 1))


def test_old_split_skip_route_is_rejected_before_any_financial_write(api, db, token, active_chit, member_factory):
    admin = token("ADMIN"); member = member_factory(admin); chit = active_chit(admin, [member])
    response = api.as_role("POST", f"{api.payment}/admin/draws/skip", admin, json=_request(chit, member))
    assert response.status_code == 409, response.text[:300]
    assert db.scalar("chitfund_payment", "SELECT COUNT(*) FROM chit_month_draws WHERE chit_id=%s", (chit,)) == 0
