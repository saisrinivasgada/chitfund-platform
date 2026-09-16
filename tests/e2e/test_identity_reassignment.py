"""Protected Hub recycled-phone workflow against disposable MySQL 8."""

from __future__ import annotations

import json
import hashlib
import uuid

import pytest

from conftest import TENANT_A, TENANT_B
from test_cross_org_identity import _create_member, _data, _seed_tenant_and_admin


pytestmark = pytest.mark.recon
MANAGEMENT_URL = "http://127.0.0.1:9091"
SEED_PASSWORD = "Password@1"
SEED_PASSWORD_HASH = "$2b$12$gU9KnFzFGGZ8Y9DSRlRuleNIv4cPCDt5oQM4nTHjPVtnRHZw7bpMm"


def _hub_login(requests, username: str):
    response = requests.post(
        f"{MANAGEMENT_URL}/api/hub/auth/login",
        json={"username": username, "password": SEED_PASSWORD}, timeout=20)
    return _data(response)


def _hub(requests, method: str, path: str, token: str, **kwargs):
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {token}"
    headers.setdefault("Content-Type", "application/json")
    return requests.request(
        method, f"{MANAGEMENT_URL}{path}", headers=headers, timeout=30, **kwargs)


def _seed_employee(db, employee_id: str, username: str, role: str,
                   can_manage: bool, owner: bool = False):
    db.query(
        "chitwise_management",
        """INSERT INTO employees
           (id,email,full_name,username,password_hash,role,is_active,
            invite_accepted_at,created_at,updated_at,can_manage_identity_cases,
            platform_owner,must_change_password,auth_version)
           VALUES (%s,%s,%s,%s,%s,%s,1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),
                   UTC_TIMESTAMP(6),%s,%s,0,0)
           ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),
             email=VALUES(email),full_name=VALUES(full_name),username=VALUES(username),
             role=VALUES(role),is_active=1,
             can_manage_identity_cases=VALUES(can_manage_identity_cases),
             platform_owner=VALUES(platform_owner),must_change_password=0""",
        (employee_id, f"{username}@example.test", username, username,
         SEED_PASSWORD_HASH, role, can_manage, owner),
    )


def test_owner_approved_phone_reassignment_is_audited_and_idempotent(api, db, token):
    requests = pytest.importorskip("requests")
    admin_a_id = _seed_tenant_and_admin(db, TENANT_A, "A")
    admin_b_id = _seed_tenant_and_admin(db, TENANT_B, "B")
    admin_a = token("ADMIN", tenant=TENANT_A, user_id=admin_a_id)
    admin_b = token("ADMIN", tenant=TENANT_B, user_id=admin_b_id)

    unique = uuid.uuid4().hex[:10]
    phone = "9" + unique.translate(str.maketrans("abcdef", "123456"))[:9]
    old_user_id = str(uuid.uuid4())
    db.query(
        "chitfund_user",
        """INSERT INTO users
           (id,username,email,full_name,phone,phone_country_code,password_hash,role,
            enabled,locked,must_change_password,failed_login_attempts,has_app_access,
            email_verified_at,email_verification_required,created_at,updated_at)
           VALUES (%s,%s,%s,'Original phone owner',%s,'+91','unused-test-hash','MEMBER',
                   1,0,0,0,1,UTC_TIMESTAMP(6),0,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))""",
        (old_user_id, f"old_{unique}", f"old-{unique}@example.test", phone),
    )

    old_profile = _create_member(
        api, admin_a, name="Historical profile", phone=phone,
        email=f"historical-{unique}@example.test", city="Hyderabad", send_access=False)
    db.query(
        "chitfund_member",
        "UPDATE members SET user_id=%s,has_app_access=1 WHERE id=%s",
        (old_user_id, old_profile["id"]),
    )
    old_link_id = str(uuid.uuid4())
    db.query(
        "chitfund_user",
        """INSERT INTO member_user_links (id,user_id,tenant_id,member_id,created_at)
           VALUES (%s,%s,%s,%s,UTC_TIMESTAMP(6))""",
        (old_link_id, old_user_id, TENANT_A, old_profile["id"]),
    )
    refresh_id = str(uuid.uuid4())
    refresh_hash = hashlib.sha256(f"refresh-{unique}".encode()).hexdigest()
    device_hash = hashlib.sha256(f"device-{unique}".encode()).hexdigest()
    db.query(
        "chitfund_user",
        """INSERT INTO refresh_tokens
           (id,token,user_id,expires_at,revoked,created_at,tenant_id)
           VALUES (%s,%s,%s,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 1 DAY),0,
                   UTC_TIMESTAMP(6),%s)""",
        (refresh_id, refresh_hash, old_user_id, TENANT_A),
    )
    db.query(
        "chitfund_user",
        """INSERT INTO trusted_devices (id,user_id,token_hash,expires_at,created_at)
           VALUES (%s,%s,%s,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 1 DAY),UTC_TIMESTAMP(6))""",
        (str(uuid.uuid4()), old_user_id, device_hash),
    )

    # The new person is created in another organization. The phone match only
    # creates a pending request to the old identity; it does not link anything.
    new_profile = _create_member(
        api, admin_b, name="New phone owner", phone=phone,
        email=f"new-profile-{unique}@example.test", city="Pune", send_access=True)
    unsafe_request_id = new_profile["appAccessRequestId"]
    assert db.scalar(
        "chitfund_user",
        "SELECT candidate_user_id FROM chitfund_access_requests WHERE id=%s",
        (unsafe_request_id,)) == old_user_id
    assert db.scalar(
        "chitfund_user",
        "SELECT COUNT(*) FROM member_user_links WHERE tenant_id=%s AND member_id=%s",
        (TENANT_B, new_profile["id"]),
    ) == 0

    _seed_employee(db, "EMP-INVESTIGATOR", f"investigator_{unique}",
                   "SUPPORT_AGENT", True)
    _seed_employee(db, "EMP-ORDINARY", f"ordinary_{unique}",
                   "SUPPORT_AGENT", False)
    _seed_employee(db, "EMP-NONOWNER-SA", f"nonowner_{unique}",
                   "SUPER_ADMIN", True)
    investigator = _hub_login(requests, f"investigator_{unique}")["token"]
    ordinary = _hub_login(requests, f"ordinary_{unique}")["token"]
    nonowner = _hub_login(requests, f"nonowner_{unique}")["token"]
    owner = _hub_login(requests, "saisrinivas")["token"]

    ticket = _data(requests.post(
        f"{MANAGEMENT_URL}/api/tickets",
        headers={
            "X-User-Id": admin_b_id,
            "X-User-Role": "ADMIN",
            "X-Tenant-Id": TENANT_B,
            "X-User-Name": "Identity Test Admin",
            "X-Internal-Auth": "test-internal-service-key",
        },
        json={
            "type": "ACCOUNT",
            "accountCaseSubtype": "PHONE_REASSIGNMENT",
            "subject": "Phone number now belongs to a different member",
            "description": "Organization verified that the carrier reassigned this number.",
            "memberId": new_profile["id"],
            "userId": old_user_id,
            "preferredContact": "EMAIL",
        }, timeout=20), expected=(201,))
    assert ticket["priority"] == "HIGH"
    identity_case = db.one(
        "chitwise_management",
        "SELECT id,status FROM identity_cases WHERE ticket_id=%s", (ticket["id"],))
    assert identity_case["status"] == "OPEN"
    case_id = identity_case["id"]

    assert _hub(requests, "GET", "/api/hub/identity-cases", ordinary).status_code == 403
    assert _hub(requests, "GET", "/api/hub/identity-cases", investigator).status_code == 200

    proposal = {
        "reason": "Carrier reassignment and member identity were independently verified.",
        "oldUserId": old_user_id,
        "phoneCountryCode": "+91",
        "phone": phone,
        "email": f"new-owner-{unique}@example.test",
        "approvedMemberLinks": [{"tenantId": TENANT_B, "memberId": new_profile["id"]}],
    }
    prepared = _data(_hub(
        requests, "PUT", f"/api/hub/identity-cases/{case_id}/prepare",
        investigator, json=proposal))
    assert prepared["status"] == "PROPOSED"
    assert _hub(
        requests, "PUT", f"/api/hub/identity-cases/{case_id}/approve",
        investigator, json={"reason": "Owner review complete"}).status_code == 403
    assert _hub(
        requests, "PUT", f"/api/hub/identity-cases/{case_id}/approve",
        nonowner, json={"reason": "Owner review complete"}).status_code == 403

    approved = _data(_hub(
        requests, "PUT", f"/api/hub/identity-cases/{case_id}/approve",
        owner, json={"reason": "Owner review complete"}))
    assert approved["status"] == "APPROVED"
    repeated_approval = _data(_hub(
        requests, "PUT", f"/api/hub/identity-cases/{case_id}/approve",
        owner, json={"reason": "Owner review complete"}))
    assert repeated_approval["status"] == "APPROVED"

    executed = _data(_hub(
        requests, "POST", f"/api/hub/identity-cases/{case_id}/execute", owner))
    assert executed["status"] == "EXECUTED"
    retried = _data(_hub(
        requests, "POST", f"/api/hub/identity-cases/{case_id}/execute", owner))
    assert retried["status"] == "EXECUTED"

    operation = db.one(
        "chitfund_user",
        """SELECT operation_id,status,new_user_id,result_json
           FROM identity_operation_executions WHERE operation_id=%s""",
        (f"identity-case:{case_id}",))
    assert operation["operation_id"] == f"identity-case:{case_id}"
    assert operation["status"] == "COMPLETED"
    result = json.loads(operation["result_json"])
    new_user_id = operation["new_user_id"]
    assert result["newUserId"] == new_user_id
    assert db.scalar(
        "chitfund_user",
        "SELECT COUNT(*) FROM identity_operation_executions WHERE operation_id=%s",
        (f"identity-case:{case_id}",)) == 1

    old_identity = db.one(
        "chitfund_user", "SELECT phone,phone_country_code FROM users WHERE id=%s",
        (old_user_id,))
    assert old_identity == {"phone": None, "phone_country_code": None}
    assert db.scalar(
        "chitfund_user", "SELECT revoked FROM refresh_tokens WHERE id=%s",
        (refresh_id,)) == 1
    assert db.scalar(
        "chitfund_user", "SELECT COUNT(*) FROM trusted_devices WHERE user_id=%s",
        (old_user_id,)) == 0
    assert db.one(
        "chitfund_user",
        "SELECT user_id,tenant_id,member_id FROM member_user_links WHERE id=%s",
        (old_link_id,)) == {
            "user_id": old_user_id, "tenant_id": TENANT_A,
            "member_id": old_profile["id"],
        }
    assert db.one(
        "chitfund_member",
        "SELECT user_id,has_app_access FROM members WHERE id=%s",
        (old_profile["id"],)) == {"user_id": old_user_id, "has_app_access": 1}

    assert db.scalar(
        "chitfund_user", "SELECT status FROM chitfund_access_requests WHERE id=%s",
        (unsafe_request_id,)) == "REVOKED"
    replacement = db.one(
        "chitfund_user",
        """SELECT id,candidate_user_id,status,request_kind
           FROM chitfund_access_requests
           WHERE tenant_id=%s AND member_id=%s AND id<>%s
           ORDER BY created_at DESC LIMIT 1""",
        (TENANT_B, new_profile["id"], unsafe_request_id),
    )
    assert replacement["candidate_user_id"] == new_user_id
    assert replacement["status"] == "PENDING_MEMBER"
    assert replacement["request_kind"] == "NEW_ACCOUNT"
    assert db.one(
        "chitfund_member",
        "SELECT user_id,has_app_access FROM members WHERE id=%s",
        (new_profile["id"],)) == {"user_id": None, "has_app_access": 0}

    # The old request and case remain fully auditable; retries did not duplicate
    # either execution or the new identity request.
    assert db.scalar(
        "chitfund_user",
        "SELECT COUNT(*) FROM chitfund_request_audit WHERE request_id=%s AND action='REQUEST_REVOKED'",
        (unsafe_request_id,)) == 1
    assert db.scalar(
        "chitwise_management",
        "SELECT COUNT(*) FROM identity_case_audit WHERE identity_case_id=%s AND action='EXECUTED'",
        (case_id,)) == 1
    assert db.scalar(
        "chitfund_user",
        "SELECT COUNT(*) FROM chitfund_access_requests WHERE candidate_user_id=%s",
        (new_user_id,)) == 1
