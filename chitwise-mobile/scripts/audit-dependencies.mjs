import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Expo SDK 54 currently pulls these packages into its Node-side Metro and
// certificate tooling. npm publishes no patched version and recommends
// incompatible Expo/React Native downgrades/upgrades. Neither package accepts
// member/admin input in the shipped Hermes application bundle.
//
// Keep this exception deliberately narrow: exact advisory, exact installed
// version, and an expiry that forces a fresh review instead of silently living
// forever. Every other High/Critical advisory still fails CI.
const REVIEW_BY = '2027-01-31';
const approvedLeaves = new Map([
  ['https://github.com/advisories/GHSA-vfj7-8cjw-p6xm', {
    packageName: 'braces',
    version: '3.0.3',
    exposure: 'Expo/Metro repository-file globbing during builds',
  }],
  ['https://github.com/advisories/GHSA-86w9-cpqp-85rv', {
    packageName: 'node-forge',
    version: '1.4.0',
    exposure: 'Expo CLI/update certificate tooling with trusted build inputs',
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
  console.warn(`Accepted Expo build-tool advisories (review by ${REVIEW_BY}):`);
  for (const [url, approval] of accepted) {
    console.warn(`- ${approval.packageName}@${approval.version}: ${approval.exposure} (${url})`);
  }
}

const counts = report.metadata?.vulnerabilities ?? {};
console.log(
  `Dependency audit passed: ${counts.critical ?? 0} Critical, `
  + `${counts.high ?? 0} High roll-ups, ${counts.moderate ?? 0} Moderate; `
  + 'all High findings resolve only to the reviewed Expo build-tool exceptions.',
);
