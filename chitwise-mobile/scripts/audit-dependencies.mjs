import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ── Rationale for approved exceptions ───────────────────────────────────────
//
// node-forge 1.4.0: All node-forge advisories affect its TLS/certificate/crypto
// functions. This package is consumed exclusively by Expo CLI tooling at build
// time (certificate generation, EAS update signing). It is a Node.js module;
// Hermes (the JS runtime in the shipped app bundle) never loads it. User
// input never reaches node-forge at runtime. No compatible patched version
// exists for Expo SDK 54. Compensating control: build inputs (certs, manifests)
// are trusted internal artifacts. Dependency path: expo-doctor / eas-cli →
// @expo/cli → @expo/code-signing-certificates → node-forge.
//
// decode-uri-component 0.2.2: Used by query-string → expo-router for URL
// parsing of in-app navigation. The advisory (DoS via crafted percent-encoded
// URLs) applies to deep links opened by the app. npm publishes no version of
// decode-uri-component > 0.5.0; no independent upgrade path exists for 0.2.x.
// Compensating controls: (1) iOS and Android enforce URL length limits that
// prevent the exponential/quadratic decode amplification; (2) expo-router 6.x
// applies schema-validated route matching before query-string parsing, so
// unrecognised paths are rejected before reaching the parser; (3) an attacker
// cannot cause a crash that affects persistent data or session state — only the
// current navigation stack. Dependency path: expo-router → query-string →
// decode-uri-component.
//
// picomatch 4.0.4: ReDoS vulnerability via crafted extglob patterns. picomatch
// is consumed exclusively by Expo/Metro's build-time file globbing (@expo/cli,
// @expo/metro-config, micromatch, tinyglobby). It processes project file-system
// paths that are internal artifacts — not user-controlled input. No patched
// version exists; 4.0.7 is the latest and also affected. Hermes (the shipped
// JS runtime) never loads picomatch. Compensating control: glob patterns are
// always constructed from trusted project configuration, never from HTTP input
// or deep links. Dependency path: @expo/cli → micromatch → picomatch.
//
// Keep exceptions deliberately narrow: exact advisory URL, exact installed
// version, and a review-by date that forces a fresh evaluation.
const REVIEW_BY = '2027-01-31';
const approvedLeaves = new Map([
  ['https://github.com/advisories/GHSA-vfj7-8cjw-p6xm', {
    packageName: 'braces',
    version: '3.0.3',
    exposure: 'Expo/Metro repository-file globbing during builds',
  }],
  // node-forge: all build-tool advisories; see rationale above
  ['https://github.com/advisories/GHSA-86w9-cpqp-85rv', {
    packageName: 'node-forge', version: '1.4.0',
    exposure: 'Expo CLI certificate tooling — build-time only, trusted inputs',
  }],
  ['https://github.com/advisories/GHSA-4642-5mcj-2rqw', {
    packageName: 'node-forge', version: '1.4.0',
    exposure: 'Expo CLI certificate tooling — build-time only, trusted inputs',
  }],
  ['https://github.com/advisories/GHSA-6wvx-3r32-xmcg', {
    packageName: 'node-forge', version: '1.4.0',
    exposure: 'Expo CLI certificate tooling — build-time only, trusted inputs',
  }],
  ['https://github.com/advisories/GHSA-525v-9gp9-w22h', {
    packageName: 'node-forge', version: '1.4.0',
    exposure: 'Expo CLI certificate tooling — build-time only, trusted inputs',
  }],
  ['https://github.com/advisories/GHSA-7wch-p9px-956x', {
    packageName: 'node-forge', version: '1.4.0',
    exposure: 'Expo CLI certificate tooling — build-time only, trusted inputs',
  }],
  ['https://github.com/advisories/GHSA-h6cr-wjv9-3cpp', {
    packageName: 'node-forge', version: '1.4.0',
    exposure: 'Expo CLI certificate tooling — build-time only, trusted inputs',
  }],
  ['https://github.com/advisories/GHSA-4487-j8r4-4g2f', {
    packageName: 'node-forge', version: '1.4.0',
    exposure: 'Expo CLI certificate tooling — build-time only, trusted inputs',
  }],
  ['https://github.com/advisories/GHSA-5cwg-6vw7-rj6p', {
    packageName: 'node-forge', version: '1.4.0',
    exposure: 'Expo CLI certificate tooling — build-time only, trusted inputs',
  }],
  ['https://github.com/advisories/GHSA-jc66-7q78-782g', {
    packageName: 'node-forge', version: '1.4.0',
    exposure: 'Expo CLI certificate tooling — build-time only, trusted inputs',
  }],
  ['https://github.com/advisories/GHSA-8hrf-8g6f-7xwp', {
    packageName: 'node-forge', version: '1.4.0',
    exposure: 'Expo CLI certificate tooling — build-time only, trusted inputs',
  }],
  ['https://github.com/advisories/GHSA-hqq3-7jhf-c5jx', {
    packageName: 'node-forge', version: '1.4.0',
    exposure: 'Expo CLI certificate tooling — build-time only, trusted inputs',
  }],
  ['https://github.com/advisories/GHSA-5x38-2vff-x55p', {
    packageName: 'node-forge', version: '1.4.0',
    exposure: 'Expo CLI certificate tooling — build-time only, trusted inputs',
  }],
  // decode-uri-component: expo-router navigation URL parsing; see rationale above
  ['https://github.com/advisories/GHSA-vcc3-ghjq-m6fr', {
    packageName: 'decode-uri-component', version: '0.2.2',
    exposure: 'expo-router URL parsing — mitigated by OS URL limits and schema validation',
  }],
  ['https://github.com/advisories/GHSA-qr28-fpjm-wq7f', {
    packageName: 'decode-uri-component', version: '0.2.2',
    exposure: 'expo-router URL parsing — mitigated by OS URL limits and schema validation',
  }],
  // picomatch: build-time file globbing; see rationale above
  ['https://github.com/advisories/GHSA-fc5q-39xc-vjpf', {
    packageName: 'picomatch', version: '4.0.4',
    exposure: 'Expo/Metro build-time file globbing — trusted project file paths, no user input',
  }],
]);

function fail(message) {
  console.error(`Dependency audit failed: ${message}`);
  process.exit(1);
}

function readInstalledVersion(packageName) {
  try {
    return JSON.parse(readFileSync(
      new URL(`../node_modules/${packageName}/package.json`, import.meta.url),
      'utf8',
    )).version;
  } catch (error) {
    fail(`cannot verify installed ${packageName}: ${error.message}`);
  }
}

const injectedReport = process.env.NODE_ENV === 'test'
  ? process.env.CHITWISE_AUDIT_REPORT_JSON
  : undefined;
const audit = injectedReport
  ? { stdout: injectedReport, stderr: '', status: 0 }
  : spawnSync('npm', ['audit', '--json'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    shell: false,
  });

if (!audit.stdout?.trim()) {
  fail(`npm audit returned no JSON${audit.stderr ? `: ${audit.stderr.trim()}` : ''}`);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch (error) {
  fail(`npm audit returned invalid JSON: ${error.message}`);
}

if (report.error) {
  fail(`npm audit could not complete: ${report.error.summary ?? report.error.code ?? 'unknown error'}`);
}

const vulnerabilities = report.vulnerabilities ?? {};

function leafAdvisories(name, visiting = new Set()) {
  if (visiting.has(name)) {
    // npm's meta-vulnerability graph can contain cycles (for example Metro
    // and Metro Config referring to one another). Stop this branch while the
    // sibling branches continue down to the concrete GHSA leaf.
    return [];
  }
  const vulnerability = vulnerabilities[name];
  if (!vulnerability) {
    fail(`npm audit references missing vulnerability ${name}`);
  }

  const next = new Set(visiting);
  next.add(name);
  const leaves = [];
  for (const via of vulnerability.via ?? []) {
    if (typeof via === 'string') {
      leaves.push(...leafAdvisories(via, next));
    } else if (via?.url) {
      leaves.push(via);
    } else {
      fail(`unrecognized advisory entry under ${name}`);
    }
  }
  return leaves;
}

const blockers = [];
const accepted = new Map();

for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  if (!['high', 'critical'].includes(vulnerability.severity)) continue;
  if (vulnerability.severity === 'critical') {
    blockers.push(`${name}: Critical severity`);
    continue;
  }

  const leaves = leafAdvisories(name);
  if (leaves.length === 0) {
    blockers.push(`${name}: High severity without a traceable advisory`);
    continue;
  }

  for (const leaf of leaves) {
    // A High meta-vulnerability can aggregate Moderate leaf advisories with a
    // High one. The CI contract is High/Critical, so lower-severity leaves are
    // reported by npm's summary but do not require a High exception.
    if (!['high', 'critical'].includes(leaf.severity)) continue;
    if (leaf.severity === 'critical') {
      blockers.push(`${name}: Critical advisory ${leaf.url}`);
      continue;
    }
    const approval = approvedLeaves.get(leaf.url);
    if (!approval) {
      blockers.push(`${name}: unapproved High advisory ${leaf.url}`);
    } else {
      accepted.set(leaf.url, approval);
    }
  }
}

for (const [url, approval] of accepted) {
  const actual = readInstalledVersion(approval.packageName);
  if (actual !== approval.version) {
    blockers.push(
      `${approval.packageName}: approved only at ${approval.version}, installed ${actual} (${url})`,
    );
  }
}

const today = new Date().toISOString().slice(0, 10);
if (accepted.size > 0 && today > REVIEW_BY) {
  blockers.push(`Expo vendor exceptions expired on ${REVIEW_BY}; review the current SDK/advisories`);
}

if (blockers.length > 0) {
  blockers.forEach((blocker) => console.error(`- ${blocker}`));
  process.exit(1);
}

if (accepted.size > 0) {
  console.warn(`Accepted Expo vendor exceptions (review by ${REVIEW_BY}):`);
  for (const [url, approval] of accepted) {
    console.warn(`- ${approval.packageName}@${approval.version}: ${approval.exposure} (${url})`);
  }
}

const counts = report.metadata?.vulnerabilities ?? {};
console.log(
  `Dependency audit passed: ${counts.critical ?? 0} Critical, `
  + `${counts.high ?? 0} High roll-ups, ${counts.moderate ?? 0} Moderate; `
  + 'all High findings resolve only to reviewed and documented vendor exceptions.',
);
