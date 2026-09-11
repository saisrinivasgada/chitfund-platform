#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
MANIFEST="$REPO_ROOT/.github/flyway-migration-checksums.sha256"
EXPECTED_PATHS="$(mktemp)"
ACTUAL_PATHS="$(mktemp)"
trap 'rm -f "$EXPECTED_PATHS" "$ACTUAL_PATHS"' EXIT

cd "$REPO_ROOT"

if grep -R --include='*.java' -nE 'flyway[.]repair[(]' \
    chitfund-*-service/src/main/java chitwise-management-service/src/main/java; then
  echo "Automatic Flyway repair is forbidden: it can erase failed rows and rewrite checksums."
  exit 1
fi

awk '{print $2}' "$MANIFEST" | LC_ALL=C sort > "$EXPECTED_PATHS"
find chitfund-*-service chitwise-management-service \
    -type f -path '*/src/main/resources/db/migration/V*.sql' \
    | LC_ALL=C sort > "$ACTUAL_PATHS"

if ! diff -u "$EXPECTED_PATHS" "$ACTUAL_PATHS"; then
  echo "Migration manifest is missing a file or contains a file that no longer exists."
  echo "Add new migrations to the manifest; never regenerate an existing migration checksum."
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check "$MANIFEST"
else
  shasum -a 256 --check "$MANIFEST"
fi
