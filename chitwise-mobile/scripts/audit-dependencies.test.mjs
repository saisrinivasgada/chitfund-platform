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

test('permits only the version-pinned Expo build-tool advisories', () => {
  const result = run({
    braces: {
      severity: 'high',
      via: [{
        severity: 'high',
        url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
      }],
    },
    'node-forge': {
      severity: 'high',
      via: [{
        severity: 'high',
        url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv',
      }],
    },
  }, { high: 2 });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Accepted Expo build-tool advisories/);
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
