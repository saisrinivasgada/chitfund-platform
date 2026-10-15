"""
Shared fixtures for the cross-service financial tests.

These run against the disposable stack in docker-compose.test.yml, never against
a deployed environment. Every fixture that could touch a database asserts it is
pointed at loopback first — the reset script has the same guard, and both exist
because this repo has already had one incident of production being reached by
accident.

The tests here assert against the database directly as well as the API. An API
can report a plausible total while the underlying rows are wrong, and it is the
rows that decide what a member actually owes.
"""

from __future__ import annotations

import os
import uuid
from decimal import Decimal

import pytest

# Ports are offset +1000 from prod so a misconfigured client cannot reach the
# real stack even by accident.
USER_URL = os.getenv("TEST_USER_URL", "http://127.0.0.1:9081")
GATEWAY_URL = os.getenv("TEST_GATEWAY_URL", "http://127.0.0.1:9080")
CHIT_URL = os.getenv("TEST_CHIT_URL", "http://127.0.0.1:9082")
MEMBER_URL = os.getenv("TEST_MEMBER_URL", "http://127.0.0.1:9083")
PAYMENT_URL = os.getenv("TEST_PAYMENT_URL", "http://127.0.0.1:9084")
PAYOUT_URL = os.getenv("TEST_PAYOUT_URL", "http://127.0.0.1:9085")

DB_HOST = os.getenv("TEST_DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("TEST_DB_PORT", "4306"))
DB_USER = "root"
DB_PASSWORD = "testpassword"

INTERNAL_KEY = "test-internal-service-key"

# Seeded in test-seed.sql. Two tenants so isolation can be proven rather than
# assumed.
TENANT_A = "10000000-0000-0000-0000-000000000001"
TENANT_B = "20000000-0000-0000-0000-000000000002"


def _assert_local(host: str) -> None:
    """Refuse to run against anything that is not clearly the local stack."""
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise RuntimeError(
            f"refusing to run destructive tests against DB host {host!r}. "
            "These tests drop and rewrite financial rows and are only ever safe "
            "against the disposable stack."
        )


def pytest_configure(config):
    _assert_local(DB_HOST)
    for url in (GATEWAY_URL, USER_URL, CHIT_URL, MEMBER_URL, PAYMENT_URL, PAYOUT_URL):
        host = url.split("//", 1)[1].split(":", 1)[0]
        _assert_local(host)


@pytest.fixture(scope="session")
def db():
    """
    Direct database access for assertions the API does not expose.

    Read-mostly by design: these tests drive the system through its API and use
    SQL to check what actually landed. Writing rows directly would prove nothing
    about the code under test.
    """
    pymysql = pytest.importorskip(
        "pymysql", reason="pip install pymysql to run the cross-service tests")
    _assert_local(DB_HOST)

    conns = {}

    def connect(schema: str):
        if schema not in conns:
            conns[schema] = pymysql.connect(
                host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD,
                database=schema, autocommit=True,
                cursorclass=pymysql.cursors.DictCursor)
        return conns[schema]

    class Db:
        def query(self, schema: str, sql: str, args=()):
            with connect(schema).cursor() as cur:
                cur.execute(sql, args)
                return cur.fetchall()

        def one(self, schema: str, sql: str, args=()):
            rows = self.query(schema, sql, args)
            return rows[0] if rows else None

        def scalar(self, schema: str, sql: str, args=()):
            row = self.one(schema, sql, args)
            return None if row is None else next(iter(row.values()))

    yield Db()

    for c in conns.values():
        c.close()


JWT_SECRET = os.getenv(
    "TEST_JWT_SECRET", "test-only-jwt-secret-not-for-production-min-32-chars")


@pytest.fixture(scope="session")
def token():
    """
    Mints scoped JWTs for the test stack.

    Going through /auth/login would need seeded users, password hashes and the
    OTP path, none of which is what these tests are about. Signing directly with
    the stack's own secret produces a token the services genuinely accept, so
    authorization is still exercised for real — a wrong role or tenant is
    rejected exactly as it would be in production.

    Only ever valid against the disposable stack: the secret is a test literal
    and the fixtures refuse to run off-loopback.

    Claim shape mirrors JwtTokenProvider.generateScopedToken.
    """
    jwt = pytest.importorskip(
        "jwt", reason="pip install pyjwt to run the authenticated tests")
    import datetime as _dt

    def mint(role: str, *, tenant: str = TENANT_A, user_id: str | None = None,
             member_id: str | None = None, expired: bool = False) -> str:
        now = _dt.datetime.now(_dt.timezone.utc)
        claims = {
            "sub": user_id or "00000000-0000-0000-0000-0000000000aa",
            "username": f"test-{role.lower()}",
            "role": role,
            "iat": now,
            # A deliberately expired token lets the negative tests prove
            # expiry is enforced rather than assumed.
            "exp": now - _dt.timedelta(minutes=5) if expired
                   else now + _dt.timedelta(hours=2),
        }
        if tenant:
            claims.update({
                "tenantId": tenant,
                "tenantSlug": "test-org",
                "tenantPlan": "ENTERPRISE",   # avoids plan-limit rejections
                "tenantStatus": "ACTIVE",
            })
        if member_id:
            claims["memberId"] = member_id
        return jwt.encode(claims, JWT_SECRET, algorithm="HS256")

    return mint


@pytest.fixture(scope="session")
def api():
    """Thin HTTP helper. Keeps the tests about money rather than about requests."""
    requests = pytest.importorskip(
        "requests", reason="pip install requests to run the cross-service tests")

    class Api:
        gateway, user, chit, member, payment, payout = (
            GATEWAY_URL, USER_URL, CHIT_URL, MEMBER_URL, PAYMENT_URL, PAYOUT_URL)

        def internal(self, method: str, url: str, tenant: str = TENANT_A, **kw):
            """Call an /internal route with the service key and tenant header."""
            headers = kw.pop("headers", {})
            headers.setdefault("X-Internal-Key", INTERNAL_KEY)
            headers.setdefault("X-Tenant-ID", tenant)
            return requests.request(method, url, headers=headers, timeout=20, **kw)

        def get(self, url, **kw):
            return requests.get(url, timeout=20, **kw)

        def as_role(self, method: str, url: str, jwt: str, **kw):
            """Authenticated call. The service validates this token for real."""
            headers = kw.pop("headers", {})
            headers.setdefault("Authorization", f"Bearer {jwt}")
            headers.setdefault("Content-Type", "application/json")
            return requests.request(method, url, headers=headers, timeout=20, **kw)

    return Api()


@pytest.fixture
def member_factory(api):
    """Create real tenant-scoped member profiles for financial scenarios."""
    created_members: list[tuple[str, str]] = []

    def create(admin: str) -> str:
        marker = uuid.uuid4().hex
        created = api.as_role("POST", f"{api.member}/members", admin, json={
            "fullName": f"Acceptance Member {marker[:8]}",
            "phone": str(10**9 + (int(marker[:12], 16) % (9 * 10**9))),
            "phoneCountryCode": "+91",
            "email": f"acceptance-{marker}@example.test",
            "sendAppAccess": False,
        })
        assert created.status_code == 201, created.text[:500]
        member_id = created.json()["data"]["id"]
        created_members.append((member_id, admin))
        return member_id

    yield create

    # Soft-delete through the application so disposable tests exercise normal
    # cleanup and do not consume the next test's plan member allowance.
    for member_id, admin in created_members:
        api.as_role("DELETE", f"{api.member}/members/{member_id}", admin)


@pytest.fixture
def active_chit(api):
    """Create, enroll and activate a real reservation chit for API tests.

    Payment-service deliberately rejects unknown or draft chit IDs.  Financial
    tests must therefore follow the same lifecycle as the app instead of
    inserting payment rows for invented identifiers.
    """
    created_chits: list[tuple[str, str]] = []

    def create(admin: str, member_ids: list[str], *, months: int = 12) -> str:
        created = api.as_role("POST", f"{api.chit}/api/chits", admin, json={
            "chitType": "RESERVATION",
            "name": f"Disposable acceptance {uuid.uuid4()}",
            "chitValue": 1000 * months,
            "installmentAmount": 1000,
            "numberOfMonths": months,
            "numberOfMembers": max(2, len(member_ids)),
            "monthlyDueDate": 1,
            "reservationSchedule": [
                {
                    "reservationMonth": f"2026-{index + 1:02d}-01",
                    "memberId": member_id,
                    "payoutAmount": 1000,
                }
                for index, member_id in enumerate(member_ids)
            ],
        })
        assert created.status_code == 201, created.text[:500]
        chit_id = created.json()["data"]["id"]

        activated = api.as_role(
            "PUT", f"{api.chit}/api/chits/{chit_id}/status", admin,
            json={"status": "ACTIVE", "startDate": "2026-01-01"})
        assert activated.status_code == 200, activated.text[:500]
        assert activated.json()["data"]["status"] == "ACTIVE"
        created_chits.append((chit_id, admin))
        return chit_id

    yield create

    # Plan limits are intentionally active in the disposable stack. Complete
    # each test's chit through the public API so one test cannot consume the
    # next test's active-chit allowance.
    for chit_id, admin in created_chits:
        api.as_role(
            "PUT", f"{api.chit}/api/chits/{chit_id}/status", admin,
            json={"status": "COMPLETED"})


@pytest.fixture(scope="session", autouse=True)
def stack_is_up(api):
    """
    Fail fast and clearly if the stack is not running.

    Without this the first test fails on a connection error, which reads like a
    product bug rather than a missing environment.
    """
    requests = pytest.importorskip("requests")
    down = []
    for name, url in (("gateway", GATEWAY_URL), ("user", USER_URL), ("chit", CHIT_URL), ("member", MEMBER_URL),
                      ("payment", PAYMENT_URL), ("payout", PAYOUT_URL)):
        try:
            if requests.get(f"{url}/actuator/health", timeout=5).status_code != 200:
                down.append(name)
        except Exception:
            down.append(name)
    if down:
        pytest.exit(
            "test stack is not healthy: " + ", ".join(down) + "\n"
            "  docker compose -f docker-compose.test.yml up -d --wait",
            returncode=1)


def money(value) -> Decimal:
    """2dp Decimal, matching the services' BigDecimal columns. Never float."""
    if isinstance(value, float):
        raise TypeError(f"refusing float {value!r} — use str/int/Decimal")
    return Decimal(str(value)).quantize(Decimal("0.01"))
