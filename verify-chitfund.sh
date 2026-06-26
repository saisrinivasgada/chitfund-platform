#!/bin/bash
# ChitFund Platform — post-deploy smoke test
#
# Usage:
#   ./verify-chitfund.sh <admin_username> <admin_password>
#   ./verify-chitfund.sh saisrinivas MyPassword
#
# What it tests:
#   1. All services are healthy (actuator/health)
#   2. Admin login works and returns a valid JWT
#   3. Members list loads (GET /api/members)
#   4. Create a test member (POST /api/members)
#   5. Create a login for that member (POST /api/auth/register + PATCH /api/members/{id}/link-user)
#   6. Member can log in with temp password
#   7. Cleanup: delete test member + user
#
# Exit code 0 = all checks passed. Non-zero = something is broken.

BASE_URL="http://localhost:8080"
ADMIN_USER="${1:-admin}"
ADMIN_PASS="${2:-Admin@1234}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
ERRORS=()

ok()   { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL+1)); ERRORS+=("$1"); }
info() { echo -e "${CYAN}[verify]${NC} $1"; }
warn() { echo -e "${YELLOW}[verify]${NC} $1"; }

ADMIN_TOKEN=""
TEST_MEMBER_ID=""
TEST_USER_ID=""
TS=$(date +%s)
TEST_PHONE="9900${TS: -6}"   # unique 10-digit test phone
TEST_USERNAME="smoketest_${TS}"
TEST_EMAIL="smoketest_${TS}@test.local"

cleanup() {
  if [ -n "$TEST_MEMBER_ID" ] && [ -n "$ADMIN_TOKEN" ]; then
    curl -s -X DELETE "$BASE_URL/api/members/$TEST_MEMBER_ID" \
      -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null 2>&1
  fi
  if [ -n "$TEST_USER_ID" ] && [ -n "$ADMIN_TOKEN" ]; then
    curl -s -X DELETE "$BASE_URL/api/users/$TEST_USER_ID" \
      -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null 2>&1
  fi
}
trap cleanup EXIT

echo ""
info "ChitFund Smoke Test — $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ── 1. Service health checks ──────────────────────────────────────────────────
info "1. Service health checks"
declare -A PORTS=(
  ["user"]=8081 ["chit"]=8082 ["member"]=8083
  ["payment"]=8084 ["payout"]=8085 ["gateway"]=8080
)
for svc in "${!PORTS[@]}"; do
  port=${PORTS[$svc]}
  status=$(curl -s --max-time 5 "http://localhost:$port/actuator/health" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','DOWN'))" 2>/dev/null)
  if [ "$status" = "UP" ]; then
    ok "$svc (:$port) is UP"
  else
    fail "$svc (:$port) health = '${status:-no response}'"
  fi
done

# ── 2. Admin login ─────────────────────────────────────────────────────────────
echo ""
info "2. Admin login"
login_resp=$(curl -s --max-time 10 -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")
ADMIN_TOKEN=$(echo "$login_resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null)
if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "None" ]; then
  ok "Admin login succeeded"
else
  fail "Admin login FAILED — check username/password (response: $(echo $login_resp | python3 -c 'import sys,json; print(json.load(sys.stdin).get(\"message\",\"?\"))' 2>/dev/null))"
  echo ""
  echo -e "${RED}Cannot continue without admin token — aborting${NC}"
  exit 1
fi

# ── 3. Members list ────────────────────────────────────────────────────────────
echo ""
info "3. Members list (GET /api/members)"
members_resp=$(curl -s --max-time 10 "$BASE_URL/api/members" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
members_ok=$(echo "$members_resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('success') else 'no')" 2>/dev/null)
if [ "$members_ok" = "yes" ]; then
  count=$(echo "$members_resp" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); print(d.get('totalElements', len(d) if isinstance(d,list) else '?'))" 2>/dev/null)
  ok "Members list loaded ($count members)"
else
  fail "Members list FAILED — $(echo $members_resp | python3 -c 'import sys,json; print(json.load(sys.stdin).get(\"message\",\"?\"))' 2>/dev/null)"
fi

# ── 4. Create test member ──────────────────────────────────────────────────────
echo ""
info "4. Create test member (POST /api/members)"
create_resp=$(curl -s --max-time 10 -X POST "$BASE_URL/api/members" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{\"fullName\":\"Smoke Test Member\",\"phone\":\"$TEST_PHONE\",\"phoneCountryCode\":\"+91\"}")
create_ok=$(echo "$create_resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('success') else 'no')" 2>/dev/null)
if [ "$create_ok" = "yes" ]; then
  TEST_MEMBER_ID=$(echo "$create_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null)
  ok "Test member created (id=$TEST_MEMBER_ID)"
else
  fail "Create member FAILED — $(echo $create_resp | python3 -c 'import sys,json; print(json.load(sys.stdin).get(\"message\",\"?\"))' 2>/dev/null)"
fi

# ── 5. Create member login ─────────────────────────────────────────────────────
echo ""
info "5. Create member login (POST /api/auth/register + PATCH link-user)"
reg_resp=$(curl -s --max-time 10 -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$TEST_USERNAME\",\"email\":\"$TEST_EMAIL\",\"role\":\"MEMBER\"}")
reg_ok=$(echo "$reg_resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('success') else 'no')" 2>/dev/null)
TEMP_PASS=""
if [ "$reg_ok" = "yes" ]; then
  TEST_USER_ID=$(echo "$reg_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('user',{}).get('id',''))" 2>/dev/null)
  TEMP_PASS=$(echo "$reg_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('tempPassword',''))" 2>/dev/null)
  ok "User registered (id=$TEST_USER_ID)"
else
  fail "Register user FAILED — $(echo $reg_resp | python3 -c 'import sys,json; print(json.load(sys.stdin).get(\"message\",\"?\"))' 2>/dev/null)"
fi

if [ -n "$TEST_MEMBER_ID" ] && [ -n "$TEST_USER_ID" ]; then
  link_resp=$(curl -s --max-time 10 -X PATCH "$BASE_URL/api/members/$TEST_MEMBER_ID/link-user" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{\"userId\":\"$TEST_USER_ID\"}")
  link_ok=$(echo "$link_resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('success') else 'no')" 2>/dev/null)
  if [ "$link_ok" = "yes" ]; then
    ok "Member linked to user account"
  else
    fail "Link user FAILED — $(echo $link_resp | python3 -c 'import sys,json; print(json.load(sys.stdin).get(\"message\",\"?\"))' 2>/dev/null)"
  fi
fi

# ── 6. Member login with temp password ───────────────────────────────────────
echo ""
info "6. Member login with temp password"
if [ -n "$TEMP_PASS" ]; then
  mlogin_resp=$(curl -s --max-time 10 -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$TEST_USERNAME\",\"password\":\"$TEMP_PASS\"}")
  mlogin_ok=$(echo "$mlogin_resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('success') else 'no')" 2>/dev/null)
  if [ "$mlogin_ok" = "yes" ]; then
    ok "Member login with temp password works"
  else
    fail "Member login FAILED — $(echo $mlogin_resp | python3 -c 'import sys,json; print(json.load(sys.stdin).get(\"message\",\"?\"))' 2>/dev/null)"
  fi
else
  warn "Skipping member login — no temp password available"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}  ALL $PASS checks PASSED${NC}"
else
  echo -e "${RED}  $FAIL check(s) FAILED, $PASS passed${NC}"
  echo ""
  for e in "${ERRORS[@]}"; do
    echo -e "  ${RED}✗${NC} $e"
  done
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit $FAIL
