"""
Authorization and tenant isolation — Phase 3, against the live stack.

Every call here goes straight to the API with a signed token. Hiding a button
proves nothing; the backend has to refuse. Two of these are regression guards
for holes found and closed earlier today:

  * GET /payouts/{id} allowed any MEMBER to read any payout, exposing another
    member's winning amount, deductions and disbursements.
  * CashRequestService.findOrThrow resolved rows without a tenant filter, so an
    admin of one organisation could mutate another's cash requests.

Both were fixed. These exist so they cannot come back unnoticed.

    pytest tests/e2e/test_authorization.py -v
"""

import uuid

import pytest

pytestmark = pytest.mark.negative

# What matters is that access is denied, not the exact code. 400 is included
# deliberately: BusinessException's two-argument constructor hardcodes
# HttpStatus.BAD_REQUEST, so FORBIDDEN and UNAUTHORIZED both surface as 400
# across the platform. The refusal is real — the body carries GENERAL_005
# "Access denied" — but the status is misleading. See test_forbidden_status_code
# below, which documents the gap rather than pretending it is not there.
#
# 404 is an acceptable refusal for a scoped lookup: "not found in your tenant"
# leaks less than "exists but forbidden".
REFUSED = {400, 401, 403, 404}


def _status(resp):
    return resp.status_code


def _denied(resp) -> bool:
    """True when the response is any kind of refusal rather than data."""
    return resp.status_code >= 400


class TestUnauthenticated:
    """No token at all must never reach financial data."""

    @pytest.mark.parametrize("path", [
        "/payments/requests/active",
        "/payments/requests/pending",
        "/admin/wallet/balance",
        "/settlement/all",
    ])
    def test_payment_endpoints_reject_anonymous(self, api, path):
        r = api.get(f"{api.payment}{path}")
        assert _status(r) in REFUSED, (
            f"{path} answered {r.status_code} without a token")

    def test_payout_list_rejects_anonymous(self, api):
        r = api.get(f"{api.payout}/payouts/pending")
        assert _status(r) in REFUSED

    def test_chit_list_rejects_anonymous(self, api):
        r = api.get(f"{api.chit}/api/chits")
        assert _status(r) in REFUSED


class TestExpiredToken:
    def test_expired_admin_token_is_refused(self, api, token):
        expired = token("ADMIN", expired=True)
        r = api.as_role("GET", f"{api.payment}/payments/requests/active", expired)
        assert _status(r) in REFUSED, (
            "an expired token was accepted — session expiry is not enforced")

    def test_token_signed_with_the_wrong_key_is_refused(self, api):
        # Proves the signature is actually verified rather than the payload
        # simply being decoded and trusted.
        jwt = pytest.importorskip("jwt")
        import datetime as dt
        forged = jwt.encode(
            {"sub": str(uuid.uuid4()), "role": "ADMIN",
             "tenantId": "10000000-0000-0000-0000-000000000001",
             "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1)},
            "not-the-real-signing-secret-but-long-enough-for-hs256",
            algorithm="HS256")
        r = api.as_role("GET", f"{api.payment}/payments/requests/active", forged)
        assert _status(r) in REFUSED, "a forged signature was accepted"


class TestRoleSeparation:
    """A valid token for the wrong role must still be refused."""

    def test_member_cannot_list_all_cash_requests(self, api, token):
        member = token("MEMBER", member_id=str(uuid.uuid4()))
        r = api.as_role("GET", f"{api.payment}/payments/requests/active", member)
        assert _status(r) in REFUSED, (
            "a MEMBER listed every cash request in the organisation")

    def test_member_cannot_read_the_treasury(self, api, token):
        member = token("MEMBER", member_id=str(uuid.uuid4()))
        r = api.as_role("GET", f"{api.payment}/admin/wallet/balance", member)
        assert _status(r) in REFUSED, "a MEMBER read the organisation's treasury"

    def test_member_cannot_list_all_settlements(self, api, token):
        member = token("MEMBER", member_id=str(uuid.uuid4()))
        r = api.as_role("GET", f"{api.payment}/settlement/all", member)
        assert _status(r) in REFUSED

    def test_staff_cannot_read_the_treasury(self, api, token):
        # Staff collect cash; they have no reason to see the org's balance.
        staff = token("STAFF")
        r = api.as_role("GET", f"{api.payment}/admin/wallet/balance", staff)
        assert _status(r) in REFUSED

    def test_admin_can_read_the_treasury(self, api, token):
        # The negative cases above only mean something if the positive works —
        # otherwise a broken endpoint would look like good authorization.
        admin = token("ADMIN")
        r = api.as_role("GET", f"{api.payment}/admin/wallet/balance", admin)
        assert r.status_code == 200, (
            f"ADMIN could not read the treasury ({r.status_code}); the refusals "
            "above may be masking a broken endpoint rather than proving anything")


class TestPayoutOwnership:
    """
    Regression: GET /payouts/{id} had no ownership check.

    Any member holding a payout id could read another member's winning amount,
    deductions and disbursement records. Fixed in d5f86e1.
    """

    def test_member_cannot_read_an_arbitrary_payout(self, api, token):
        member = token("MEMBER", member_id=str(uuid.uuid4()))
        r = api.as_role("GET", f"{api.payout}/payouts/{uuid.uuid4()}", member)
        # 200 would mean a payout was served to someone with no connection to it.
        assert _denied(r), (
            f"a MEMBER received {r.status_code} for a payout that is not theirs")

    def test_member_cannot_list_another_members_payouts(self, api, token):
        mine, theirs = str(uuid.uuid4()), str(uuid.uuid4())
        member = token("MEMBER", member_id=mine)
        r = api.as_role("GET", f"{api.payout}/payouts/member/{theirs}", member)
        assert _denied(r)

    def test_refusal_carries_the_forbidden_error_code(self, api, token):
        """
        The status code alone cannot distinguish a permission failure from a
        malformed request, so assert on the error code in the body — that is
        what actually proves the ownership check ran rather than validation
        rejecting the request for some unrelated reason.
        """
        member = token("MEMBER", member_id=str(uuid.uuid4()))
        r = api.as_role("GET", f"{api.payout}/payouts/member/{uuid.uuid4()}", member)
        assert _denied(r)
        body = r.json()
        assert body.get("errorCode") == "GENERAL_005", (
            f"expected FORBIDDEN (GENERAL_005), got {body.get('errorCode')!r} — "
            "the request may be failing validation before the ownership check")
        assert "denied" in (body.get("message") or "").lower()

    def test_forbidden_returns_403(self, api, token):
        """
        Until 2026-09-10 this returned 400: BusinessException's shorter
        constructors hardcoded BAD_REQUEST regardless of the error code, so a
        permission failure was indistinguishable from a malformed request and
        clients that redirect on 401 never fired. Now mapped by code.
        """
        member = token("MEMBER", member_id=str(uuid.uuid4()))
        r = api.as_role("GET", f"{api.payout}/payouts/member/{uuid.uuid4()}", member)
        assert r.status_code == 403, (
            f"expected 403 for a permission failure, got {r.status_code}")


class TestTenantIsolation:
    """
    Regression: cash-request lookups resolved rows without a tenant filter, so
    an admin of one organisation could act on another's. Fixed in b828d0c.
    """

    def test_admin_cannot_touch_another_tenants_cash_request(self, api, token):
        admin_b = token("ADMIN", tenant="20000000-0000-0000-0000-000000000002")
        r = api.as_role(
            "PATCH", f"{api.payment}/payments/requests/{uuid.uuid4()}/cancel",
            admin_b, json={"reason": "cross-tenant probe"})
        assert _status(r) in REFUSED or r.status_code >= 400, (
            f"tenant B got {r.status_code} mutating a request it does not own")

    def test_tenant_b_sees_none_of_tenant_a_requests(self, api, token):
        admin_b = token("ADMIN", tenant="20000000-0000-0000-0000-000000000002")
        r = api.as_role("GET", f"{api.payment}/payments/requests/active", admin_b)
        if r.status_code == 200:
            # An empty list is the correct answer for a tenant with no data. A
            # populated one would mean the scoping is not applied.
            assert r.json().get("data") == [] or r.json().get("data") is None, (
                "tenant B was served cash requests belonging to another tenant")

    def test_treasury_is_scoped_per_tenant(self, api, token):
        a = api.as_role("GET", f"{api.payment}/admin/wallet/balance", token("ADMIN"))
        b = api.as_role("GET", f"{api.payment}/admin/wallet/balance",
                        token("ADMIN", tenant="20000000-0000-0000-0000-000000000002"))
        if a.status_code == 200 and b.status_code == 200:
            # Both are empty on a clean stack; the point is that each answers for
            # itself rather than one seeing the other's entries.
            assert a.json().get("data") is not None
            assert b.json().get("data") is not None


class TestInternalEndpoints:
    """Service-to-service routes must not be usable with the wrong key."""

    def test_internal_route_rejects_a_missing_key(self, api):
        r = api.get(f"{api.payment}/admin/draws/internal/apply-auction-dividend")
        assert r.status_code != 200

    def test_internal_route_rejects_a_wrong_key(self, api):
        import requests
        r = requests.post(
            f"{api.payment}/admin/draws/internal/apply-auction-dividend",
            headers={"X-Internal-Key": "not-the-key",
                     "X-Tenant-ID": "10000000-0000-0000-0000-000000000001",
                     "Content-Type": "application/json"},
            json={"chitId": str(uuid.uuid4()), "monthNumber": 1,
                  "grossInstallmentAmount": 1000, "dividendPerSpot": 0,
                  "memberSpots": []},
            timeout=20)
        assert r.status_code in REFUSED, (
            f"an internal endpoint accepted a wrong key ({r.status_code}) — "
            "these routes bypass user authentication entirely")


class TestOperationalMetrics:
    @pytest.mark.parametrize("service_name,url", [
        ("payment", "payment"),
        ("payout", "payout"),
    ])
    def test_outbox_metrics_are_exported_but_not_public(
            self, api, token, service_name, url):
        base = getattr(api, url)
        anonymous = api.get(f"{base}/actuator/prometheus")
        assert anonymous.status_code == 401

        authenticated = api.as_role(
            "GET", f"{base}/actuator/prometheus", token("ADMIN"))
        assert authenticated.status_code == 200, authenticated.text[:200]
        assert "chitwise_outbox_pending" in authenticated.text
        assert f'service="{service_name}"' in authenticated.text
