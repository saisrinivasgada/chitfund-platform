"""Cross-organization identity flows against the disposable MySQL 8 stack."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import uuid

import pytest

from conftest import JWT_SECRET, TENANT_A, TENANT_B


pytestmark = pytest.mark.recon


def _data(response, expected=(200, 201)):
    assert response.status_code in expected, response.text[:500]
    body = response.json()
    assert body.get("success") is True, body
    return body.get("data")


def _seed_tenant_and_admin(db, tenant_id: str, label: str) -> str:
    admin_id = str(uuid.uuid4())
    db.query(
        "chitfund_user",
        """INSERT INTO tenants (id, name, slug, status, plan, created_at, updated_at)
           VALUES (%s,%s,%s,'ACTIVE','GROWTH',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))
           ON DUPLICATE KEY UPDATE status='ACTIVE', plan='GROWTH'""",
        (tenant_id, f"Identity Test {label}", f"identity-{label.lower()}"),
    )
    # Tenant creation normally snapshots the selected plan into this table.
    # These are test prerequisites inserted directly, so mirror that part of
    # the real creation flow rather than leaving a tenant that no service can
    # use for subscription checks.
    db.query(
        "chitfund_user",
        """INSERT INTO tenant_custom_limits
           (tenant_id,max_active_chits,max_members,max_staff,capabilities,
            allowed_chit_types,price_monthly_inr,notes,created_at,updated_at,plan_code)
           SELECT %s,max_active_chits,max_members,max_staff,capabilities,
                  allowed_chit_types,price_monthly_inr,NULL,
                  UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),plan
           FROM plan_limits WHERE plan='GROWTH'
           ON DUPLICATE KEY UPDATE
             max_active_chits=VALUES(max_active_chits),
             max_members=VALUES(max_members), max_staff=VALUES(max_staff),
             capabilities=VALUES(capabilities),
             allowed_chit_types=VALUES(allowed_chit_types),
             price_monthly_inr=VALUES(price_monthly_inr), plan_code=VALUES(plan_code),
             updated_at=UTC_TIMESTAMP(6)""",
        (tenant_id,),
    )
    db.query(
        "chitfund_user",
        """INSERT INTO users
           (id,username,email,full_name,password_hash,role,enabled,locked,
            must_change_password,failed_login_attempts,tenant_id,has_app_access,
            email_verification_required,created_at,updated_at)
           VALUES (%s,%s,%s,%s,'unused-test-hash','ADMIN',1,0,0,0,%s,1,0,
                   UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))""",
        (admin_id, f"identity_admin_{label.lower()}_{admin_id[:8]}",
         f"identity-admin-{admin_id}@example.test", f"Identity Admin {label}", tenant_id),
    )
    return admin_id


def _latest_code(db, table: str, reference_column: str, reference: str, purpose: str) -> str:
    row = db.one(
        "chitfund_user",
        f"""SELECT verification_code FROM {table}
            WHERE {reference_column}=%s AND purpose=%s
            ORDER BY created_at DESC LIMIT 1""",
        (reference, purpose),
    )
    assert row is not None, f"no {purpose} code generated for disposable test reference"
    return row["verification_code"]


def _create_member(api, admin_token: str, *, name: str, phone: str, email: str,
                   city: str, send_access: bool = True):
    return _data(api.as_role("POST", f"{api.member}/members", admin_token, json={
        "fullName": name,
        "phone": phone,
        "phoneCountryCode": "+91",
        "email": email,
        "city": city,
        "sendAppAccess": send_access,
    }))


def _login(api, username: str, password: str):
    return _data(api.as_role(
        "POST", f"{api.user}/api/auth/login", "",
        json={"username": username, "password": password}))


def _select_tenant(api, login_token: str, tenant_id: str):
    return _data(api.as_role(
        "POST", f"{api.user}/api/auth/select-tenant", "",
        json={"loginToken": login_token, "tenantId": tenant_id}))


def test_staff_and_admin_require_verified_email_before_login(api, db, token):
    """Mandatory staff email is verified before any tenant/access token is issued."""
    unique = uuid.uuid4().hex[:10]
    # Use a dedicated tenant so this test remains independent of prior manual
    # runs and of the staff-limit scenarios exercised elsewhere in the suite.
    email_tenant = str(uuid.uuid4())
    creator_id = _seed_tenant_and_admin(db, email_tenant, f"Email-{unique}")
    creator = token("ADMIN", tenant=email_tenant, user_id=creator_id)

    missing_email = api.as_role(
        "POST", f"{api.user}/api/users/staff", creator, json={
            "username": f"staff_no_email_{unique}",
            "password": "EmailGate@1",
            "fullName": "Staff Without Email",
            "phone": "6" + unique.translate(str.maketrans("abcdef", "123456"))[:9],
            "phoneCountryCode": "+91",
            "role": "STAFF",
        })
    assert missing_email.status_code == 400

    def create_and_begin_login(role: str, phone_prefix: str):
        username = f"email_{role.lower()}_{unique}"
        email = f"{role.lower()}-{unique}@example.test"
        phone = phone_prefix + unique.translate(
            str.maketrans("abcdef", "123456"))[:9]
        password = "EmailGate@1"
        created = _data(api.as_role(
            "POST", f"{api.user}/api/users/staff", creator, json={
                "username": username,
                "email": email,
                "password": password,
                "fullName": f"Email Gate {role}",
                "phone": phone,
                "phoneCountryCode": "+91",
                "role": role,
            }), expected=(201,))
        user_id = created["user"]["id"]
        assert created.get("accessToken") is None
        assert created.get("refreshToken") is None

        login = _login(api, username, password)
        assert login["requiresEmailVerification"] is True
        assert login["emailVerificationToken"]
        assert login.get("loginToken") is None
        assert login.get("authResponse") is None
        assert db.scalar(
            "chitfund_user",
            "SELECT email_verified_at FROM users WHERE id=%s", (user_id,)) is None

        email_code = _latest_code(
            db, "account_email_otps", "user_id", user_id, "LOGIN_EMAIL_VERIFY")
        verified = _data(api.as_role(
            "POST", f"{api.user}/api/auth/verify-login-email-otp", "", json={
                "emailVerificationToken": login["emailVerificationToken"],
                "code": email_code,
            }))
        assert db.scalar(
            "chitfund_user",
            "SELECT email_verified_at FROM users WHERE id=%s", (user_id,)) is not None
        return user_id, verified

    _, staff_login = create_and_begin_login("STAFF", "6")
    assert staff_login["requiresTenantSelection"] is True
    assert staff_login["requiresOtp"] is False
    staff_auth = _select_tenant(api, staff_login["loginToken"], email_tenant)
    assert staff_auth["accessToken"]
    assert staff_auth["user"]["role"] == "STAFF"

    admin_id, admin_email_verified = create_and_begin_login("ADMIN", "5")
    assert admin_email_verified["requiresOtp"] is True
    assert admin_email_verified["otpToken"]
    assert admin_email_verified.get("loginToken") is None

    phone_code = _latest_code(db, "phone_otps", "user_id", admin_id, "LOGIN")
    admin_otp_verified = _data(api.as_role(
        "POST", f"{api.user}/api/auth/verify-login-otp", "", json={
            "otpToken": admin_email_verified["otpToken"],
            "code": phone_code,
            "rememberDevice": False,
        }))
    assert admin_otp_verified["requiresTenantSelection"] is True
    admin_auth = _select_tenant(api, admin_otp_verified["loginToken"], email_tenant)
    assert admin_auth["accessToken"]
    assert admin_auth["user"]["role"] == "ADMIN"


def test_one_global_member_securely_joins_two_organizations(api, db, token):
    """Exercises the complete member-controlled A→B linking and recovery path."""
    admin_a_id = _seed_tenant_and_admin(db, TENANT_A, "A")
    admin_b_id = _seed_tenant_and_admin(db, TENANT_B, "B")
    admin_a = token("ADMIN", tenant=TENANT_A, user_id=admin_a_id)
    admin_b = token("ADMIN", tenant=TENANT_B, user_id=admin_b_id)

    unique = uuid.uuid4().hex[:10]
    phone = "8" + unique.translate(str.maketrans("abcdef", "123456"))[:9]
    username = f"member_{unique}"
    first_password = "CrossOrg@1"
    second_password = "CrossOrg@2"
    recovery_email = f"member-{unique}@example.test"

    # Email is mandatory at the organization boundary.
    missing_email = api.as_role("POST", f"{api.member}/members", admin_a, json={
        "fullName": "No Email", "phone": "7" + phone[1:],
        "phoneCountryCode": "+91", "sendAppAccess": False,
    })
    assert missing_email.status_code == 400

    member_a = _create_member(
        api, admin_a, name="Member Profile A", phone=phone,
        email=recovery_email, city="Hyderabad")
    request_a_id = member_a["appAccessRequestId"]
    assert member_a["appAccessRequestStatus"] == "PENDING_MEMBER"
    assert member_a["setupToken"]
    assert member_a["actionToken"]

    # The organization profile is immediately usable, but no account is linked
    # and no app access exists before member verification and admin confirmation.
    pending_profile = db.one(
        "chitfund_member",
        "SELECT user_id,has_app_access FROM members WHERE id=%s",
        (member_a["id"],),
    )
    assert pending_profile == {"user_id": None, "has_app_access": 0}
    assert db.scalar(
        "chitfund_user",
        "SELECT COUNT(*) FROM member_user_links WHERE tenant_id=%s AND member_id=%s",
        (TENANT_A, member_a["id"]),
    ) == 0

    # First-time setup proves both delivery channels. Codes are read from the
    # disposable DB only because real SMS/email providers are intentionally off.
    _data(api.as_role(
        "POST", f"{api.user}/api/chitfund-requests/setup/email-otp", "",
        json={"token": member_a["setupToken"], "email": recovery_email}))
    phone_otp = _latest_code(
        db, "phone_otps", "user_id", request_a_id, "APP_ACCESS_SETUP")
    email_otp = _latest_code(
        db, "account_email_otps", "user_id",
        db.scalar("chitfund_user", "SELECT candidate_user_id FROM chitfund_access_requests WHERE id=%s", (request_a_id,)),
        "ACCOUNT_EMAIL_VERIFY")
    setup = _data(api.as_role(
        "POST", f"{api.user}/api/chitfund-requests/setup", "", json={
            "token": member_a["setupToken"],
            "username": username,
            "newPassword": first_password,
            "fullName": "Global Member",
            "phoneOtp": phone_otp,
            "email": recovery_email,
            "emailOtp": email_otp,
            "termsAccepted": True,
        }))
    assert setup["status"] == "AWAITING_ADMIN"
    user_id = db.scalar(
        "chitfund_user", "SELECT candidate_user_id FROM chitfund_access_requests WHERE id=%s",
        (request_a_id,))
    verified_user = db.one(
        "chitfund_user",
        "SELECT email_verified_at,has_app_access FROM users WHERE id=%s", (user_id,))
    assert verified_user["email_verified_at"] is not None
    assert verified_user["has_app_access"] == 0

    activated_a = _data(api.as_role(
        "POST", f"{api.user}/api/chitfund-requests/{request_a_id}/confirm", admin_a))
    assert activated_a["status"] == "ACTIVE"

    first_login = _login(api, username, first_password)
    assert first_login["requiresTenantSelection"] is True
    assert {t["tenantId"] for t in first_login["tenants"]} == {TENANT_A}
    auth_a_before_recovery = _select_tenant(api, first_login["loginToken"], TENANT_A)

    # Merely matching the phone in organization B creates a pending request;
    # it never creates a link or exposes organization A data.
    member_b = _create_member(
        api, admin_b, name="Member Profile B", phone=phone,
        email=f"org-b-{unique}@example.test", city="Vijayawada")
    request_b_id = member_b["appAccessRequestId"]
    assert member_b["setupToken"] is None
    assert member_b["actionToken"]
    request_b = db.one(
        "chitfund_user",
        "SELECT request_kind,status,candidate_user_id FROM chitfund_access_requests WHERE id=%s",
        (request_b_id,))
    assert request_b == {
        "request_kind": "LINK_EXISTING", "status": "PENDING_MEMBER",
        "candidate_user_id": user_id,
    }
    assert db.scalar(
        "chitfund_user",
        "SELECT COUNT(*) FROM member_user_links WHERE tenant_id=%s AND member_id=%s",
        (TENANT_B, member_b["id"]),
    ) == 0

    wrong_tenant_confirm = api.as_role(
        "POST", f"{api.user}/api/chitfund-requests/{request_b_id}/confirm", admin_a)
    assert wrong_tenant_confirm.status_code == 403

    # The special forgot-password path for accepting a Chitfund Request uses
    # the already verified recovery email and revokes existing sessions.
    public = _data(api.get(
        f"{api.user}/api/chitfund-requests/public",
        params={"token": member_b["actionToken"]}))
    assert public["emailRecoveryAvailable"] is True
    _data(api.as_role(
        "POST", f"{api.user}/api/chitfund-requests/recovery/email-otp", "",
        json={"token": member_b["actionToken"]}))
    recovery_otp = _latest_code(
        db, "account_email_otps", "user_id", request_b_id,
        "CHITFUND_REQUEST_RECOVERY")
    recovery = _data(api.as_role(
        "POST", f"{api.user}/api/chitfund-requests/recovery/verify-email-otp", "",
        json={"token": member_b["actionToken"], "code": recovery_otp}))
    _data(api.as_role(
        "POST", f"{api.user}/api/auth/forgot-password/reset-with-token", "", json={
            "resetToken": recovery["resetToken"], "newPassword": second_password,
        }))
    revoked_refresh = api.as_role(
        "POST", f"{api.user}/api/auth/refresh", "",
        json={"refreshToken": auth_a_before_recovery["refreshToken"]})
    assert revoked_refresh.status_code in (400, 401)

    login_for_accept = _login(api, username, second_password)
    member_auth_a = _select_tenant(api, login_for_accept["loginToken"], TENANT_A)
    member_token_a = member_auth_a["accessToken"]
    mine = _data(api.as_role(
        "GET", f"{api.user}/api/chitfund-requests/mine", member_token_a))
    assert {r["id"] for r in mine} == {request_b_id}

    _data(api.as_role(
        "POST", f"{api.user}/api/chitfund-requests/{request_b_id}/otp", member_token_a))
    accept_otp = _latest_code(
        db, "phone_otps", "user_id", request_b_id, "CHITFUND_ACCEPT")

    def accept_once():
        return api.as_role(
            "POST", f"{api.user}/api/chitfund-requests/{request_b_id}/accept",
            member_token_a, json={"code": accept_otp})

    with ThreadPoolExecutor(max_workers=2) as pool:
        accept_results = list(pool.map(lambda _: accept_once(), range(2)))
    assert [r.status_code for r in accept_results] == [200, 200]
    assert db.scalar(
        "chitfund_user",
        "SELECT COUNT(*) FROM chitfund_request_audit WHERE request_id=%s AND action='MEMBER_VERIFIED'",
        (request_b_id,)) == 1

    def confirm_once():
        return api.as_role(
            "POST", f"{api.user}/api/chitfund-requests/{request_b_id}/confirm", admin_b)

    with ThreadPoolExecutor(max_workers=2) as pool:
        confirm_results = list(pool.map(lambda _: confirm_once(), range(2)))
    assert [r.status_code for r in confirm_results] == [200, 200]
    assert db.scalar(
        "chitfund_user",
        "SELECT COUNT(*) FROM member_user_links WHERE user_id=%s", (user_id,)) == 2
    assert db.scalar(
        "chitfund_user",
        "SELECT COUNT(*) FROM chitfund_request_audit WHERE request_id=%s AND action='ACCESS_ACTIVATED'",
        (request_b_id,)) == 1

    # A fresh real login now exposes both tenant choices. Each scoped session
    # resolves only that tenant's member profile and each refresh remains scoped.
    final_login = _login(api, username, second_password)
    assert {t["tenantId"] for t in final_login["tenants"]} == {TENANT_A, TENANT_B}
    session_a = _select_tenant(api, final_login["loginToken"], TENANT_A)
    session_b = _select_tenant(api, final_login["loginToken"], TENANT_B)
    profile_a = _data(api.as_role(
        "GET", f"{api.member}/members/me", session_a["accessToken"]))
    profile_b = _data(api.as_role(
        "GET", f"{api.member}/members/me", session_b["accessToken"]))
    assert (profile_a["id"], profile_a["fullName"], profile_a["city"]) == (
        member_a["id"], "Member Profile A", "Hyderabad")
    assert (profile_b["id"], profile_b["fullName"], profile_b["city"]) == (
        member_b["id"], "Member Profile B", "Vijayawada")

    jwt = pytest.importorskip("jwt")
    refreshed_a = _data(api.as_role(
        "POST", f"{api.user}/api/auth/refresh", "",
        json={"refreshToken": session_a["refreshToken"]}))
    refreshed_b = _data(api.as_role(
        "POST", f"{api.user}/api/auth/refresh", "",
        json={"refreshToken": session_b["refreshToken"]}))
    claims_a = jwt.decode(refreshed_a["accessToken"], JWT_SECRET, algorithms=["HS384"])
    claims_b = jwt.decode(refreshed_b["accessToken"], JWT_SECRET, algorithms=["HS384"])
    assert claims_a["tenantId"] == TENANT_A
    assert claims_b["tenantId"] == TENANT_B
    assert claims_a["memberId"] == member_a["id"]
    assert claims_b["memberId"] == member_b["id"]


def test_request_lifecycle_resend_decline_revoke_and_expiry(api, db, token):
    """Every terminal path is explicit, audited, and cannot reuse an old link."""
    admin_b_id = _seed_tenant_and_admin(db, TENANT_B, "B-Life")
    admin_b = token("ADMIN", tenant=TENANT_B, user_id=admin_b_id)
    unique = uuid.uuid4().hex[:10]
    phone = "6" + unique.translate(str.maketrans("abcdef", "123456"))[:9]
    user_id = str(uuid.uuid4())
    db.query(
        "chitfund_user",
        """INSERT INTO users
           (id,username,email,full_name,phone,phone_country_code,password_hash,role,
            enabled,locked,must_change_password,failed_login_attempts,has_app_access,
            email_verified_at,email_verification_required,created_at,updated_at)
           VALUES (%s,%s,%s,'Lifecycle Member',%s,'+91','unused-test-hash','MEMBER',
                   1,0,0,0,1,UTC_TIMESTAMP(6),0,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))""",
        (user_id, f"lifecycle_{unique}", f"lifecycle-{unique}@example.test", phone),
    )
    # This prerequisite represents an already established ChitWise member in A.
    db.query(
        "chitfund_user",
        """INSERT INTO member_user_links (id,user_id,tenant_id,member_id,created_at)
           VALUES (%s,%s,%s,%s,UTC_TIMESTAMP(6))""",
        (str(uuid.uuid4()), user_id, TENANT_A, str(uuid.uuid4())),
    )
    member_token = token("MEMBER", tenant=TENANT_A, user_id=user_id)

    member_b = _create_member(
        api, admin_b, name="Lifecycle Profile", phone=phone,
        email=f"lifecycle-b-{unique}@example.test", city="Pune")
    request_id = member_b["appAccessRequestId"]
    first_action_token = member_b["actionToken"]
    assert member_b["setupToken"] is None

    # Creating the same open request is idempotent; the DB keeps one active row.
    duplicate = _data(api.as_role(
        "POST", f"{api.member}/members/{member_b['id']}/app-access-request", admin_b))
    assert duplicate["id"] == request_id
    assert db.scalar(
        "chitfund_user",
        """SELECT COUNT(*) FROM chitfund_access_requests
           WHERE tenant_id=%s AND member_id=%s
             AND status IN ('PENDING_MEMBER','MEMBER_VERIFIED','AWAITING_ADMIN')""",
        (TENANT_B, member_b["id"]),
    ) == 1

    throttled = api.as_role(
        "POST", f"{api.user}/api/chitfund-requests/{request_id}/resend", admin_b)
    assert throttled.status_code == 429
    db.query(
        "chitfund_user",
        "UPDATE chitfund_access_requests SET last_sent_at=UTC_TIMESTAMP(6)-INTERVAL 10 MINUTE WHERE id=%s",
        (request_id,),
    )
    resent = _data(api.as_role(
        "POST", f"{api.user}/api/chitfund-requests/{request_id}/resend", admin_b))
    assert resent["actionToken"] and resent["actionToken"] != first_action_token
    stale_link = api.get(
        f"{api.user}/api/chitfund-requests/public",
        params={"token": first_action_token})
    assert stale_link.status_code in (400, 401, 404)

    declined = _data(api.as_role(
        "POST", f"{api.user}/api/chitfund-requests/{request_id}/decline", member_token))
    assert declined["status"] == "DECLINED"
    assert db.scalar(
        "chitfund_user",
        "SELECT COUNT(*) FROM member_user_links WHERE tenant_id=%s AND member_id=%s",
        (TENANT_B, member_b["id"]),
    ) == 0

    request_two = _data(api.as_role(
        "POST", f"{api.member}/members/{member_b['id']}/app-access-request", admin_b))
    revoked = _data(api.as_role(
        "POST", f"{api.user}/api/chitfund-requests/{request_two['id']}/revoke", admin_b))
    assert revoked["status"] == "REVOKED"
    revoked_link = api.get(
        f"{api.user}/api/chitfund-requests/public",
        params={"token": request_two["actionToken"]})
    assert revoked_link.status_code in (400, 401, 404)

    request_three = _data(api.as_role(
        "POST", f"{api.member}/members/{member_b['id']}/app-access-request", admin_b))
    db.query(
        "chitfund_user",
        "UPDATE chitfund_access_requests SET expires_at=UTC_TIMESTAMP(6)-INTERVAL 1 SECOND WHERE id=%s",
        (request_three["id"],),
    )
    expired_link = api.get(
        f"{api.user}/api/chitfund-requests/public",
        params={"token": request_three["actionToken"]})
    assert expired_link.status_code in (400, 401)
    assert db.scalar(
        "chitfund_user", "SELECT status FROM chitfund_access_requests WHERE id=%s",
        (request_three["id"],)) == "EXPIRED"
    assert db.scalar(
        "chitfund_user",
        "SELECT COUNT(*) FROM chitfund_request_audit WHERE request_id=%s AND action='REQUEST_EXPIRED'",
        (request_three["id"],)) == 1
