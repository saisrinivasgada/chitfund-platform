import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./audit-dependencies.mjs', import.meta.url));

function run(vulnerabilities, counts = {}) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      CHITWISE_AUDIT_REPORT_JSON: JSON.stringify({
        vulnerabilities,
        metadata: {
          vulnerabilities: {
            critical: 0,
            high: 0,
            moderate: 0,
            ...counts,
          },
        },
      }),
    },
  });
}

test('permits only the version-pinned Expo vendor exceptions', () => {
  const result = run({
    braces: {
      severity: 'high',
      via: [{
        severity: 'high',
        url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
      }],
    },
  }, { high: 1 });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Accepted Expo vendor exceptions/);
});

test('fails closed for an unknown High advisory', () => {
  const result = run({
    unknown: {
      severity: 'high',
      via: [{
        severity: 'high',
        url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz',
      }],
    },
  }, { high: 1 });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unapproved High advisory/);
});

test('no longer accepts the patched node-forge advisory', () => {
  const result = run({
    'node-forge': {
      severity: 'high',
      via: [{
        severity: 'high',
        url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv',
      }],
    },
  }, { high: 1 });

  assert.notEqual(result.status, 0);
  // node-forge is overridden to 1.4.3 (patched); the exception is pinned at 1.4.0.
  // The script rejects this as a version mismatch rather than "unapproved" — which
  // is the correct rejection: the exception no longer applies to the installed version.
  assert.match(result.stderr, /node-forge.*1\.4\.0.*installed 1\.4\.3|unapproved High advisory/);
});

test('fails closed for every Critical advisory', () => {
  const result = run({
    criticalPackage: {
      severity: 'critical',
      via: [{
        severity: 'critical',
        url: 'https://github.com/advisories/GHSA-critical-test',
      }],
    },
  }, { critical: 1 });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Critical severity/);
});

test('handles npm meta-vulnerability cycles and still reaches the leaf', () => {
  const result = run({
    metro: { severity: 'high', via: ['metro-config'] },
    'metro-config': {
      severity: 'high',
      via: [
        'metro',
        {
          severity: 'high',
          url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
        },
      ],
    },
  }, { high: 2 });

  assert.equal(result.status, 0, result.stderr);
});
