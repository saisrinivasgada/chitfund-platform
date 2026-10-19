import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve(import.meta.dirname, 'ensure-ci-android-ndk.sh');
function fixture(scenario) {
  const root = mkdtempSync(join(tmpdir(), 'chitwise-ndk-test-'));
  const sdk = join(root, 'sdk'); const logs = join(root, 'logs');
  mkdirSync(join(sdk, 'cmdline-tools/latest/bin'), { recursive: true }); mkdirSync(logs);
  const installer = `#!/usr/bin/env bash
set -eu
n=0; [[ ! -f "$ANDROID_HOME/calls" ]] || n=$(cat "$ANDROID_HOME/calls")
n=$((n+1)); echo "$n" > "$ANDROID_HOME/calls"
if [[ "$CASE" == "fail" || ( "$CASE" == "retry" && "$n" == 1 ) ]]; then
  mkdir -p "$ANDROID_HOME/.temp"; echo corrupt > "$ANDROID_HOME/.temp/archive"
  echo 'Error on ZipFile unknown archive' >&2; exit 1
fi
[[ ! -e "$ANDROID_HOME/.temp/archive" ]]
ndk="$ANDROID_HOME/ndk/27.1.12297006"
mkdir -p "$ndk/toolchains/llvm/prebuilt/linux-x86_64/bin"
echo 'Pkg.Revision = 27.1.12297006' > "$ndk/source.properties"
printf '#!/bin/sh\\nexit 0\\n' > "$ndk/toolchains/llvm/prebuilt/linux-x86_64/bin/clang"
chmod +x "$ndk/toolchains/llvm/prebuilt/linux-x86_64/bin/clang"
`;
  writeFileSync(join(sdk, 'cmdline-tools/latest/bin/sdkmanager'), installer, { mode: 0o755 });
  return { root, sdk, run: () => spawnSync('bash', [script], { encoding: 'utf8', env: { ...process.env, ANDROID_HOME: sdk, RUNNER_TEMP: logs, CASE: scenario } }) };
}

test('a corrupt download is cleared and a later valid toolchain is accepted', () => {
  const f = fixture('retry');
  try { const result = f.run(); assert.equal(result.status, 0, result.stdout + result.stderr); assert.equal(readFileSync(join(f.sdk, 'calls'), 'utf8').trim(), '2'); }
  finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('a permanent installation failure remains a failure after three attempts', () => {
  const f = fixture('fail');
  try { const result = f.run(); assert.equal(result.status, 1); assert.equal(readFileSync(join(f.sdk, 'calls'), 'utf8').trim(), '3'); }
  finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('a verified cached toolchain avoids another download', () => {
  const f = fixture('success');
  try { assert.equal(f.run().status, 0); assert.equal(f.run().status, 0); assert.equal(readFileSync(join(f.sdk, 'calls'), 'utf8').trim(), '1'); }
  finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('a cached directory with the wrong revision is replaced', () => {
  const f = fixture('success');
  try {
    assert.equal(f.run().status, 0);
    writeFileSync(join(f.sdk, 'ndk/27.1.12297006/source.properties'), 'Pkg.Revision = 27x1x12297006\n');
    assert.equal(f.run().status, 0);
    assert.equal(readFileSync(join(f.sdk, 'calls'), 'utf8').trim(), '2');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
