'use strict';

/**
 * Exact, per-file coverage gate for a reviewed debt snapshot. The Linux
 * baseline comes from the completed PR coverage run recorded in its JSON.
 * Istanbul loads custom reporters through require(), so this module is CJS.
 */
const { createHash } = require('node:crypto');
const { globSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { ReportBase } = require('istanbul-lib-report');
const { uncoveredRecords } = require('./coverage-uncovered-locations.cjs');

const METRICS = ['statements', 'branches', 'functions', 'lines'];
const PLATFORMS = ['linux', 'win32'];
const SHA256 = /^[a-f0-9]{64}$/;

function sourceDigest(pathname) {
  const source = readFileSync(pathname, 'utf8').replace(/\r\n?/g, '\n');
  return createHash('sha256').update(source).digest('hex');
}

function sourcePath(value) {
  if (typeof value !== 'string' || !value.startsWith('packages/')
    || value.includes('\\') || value.split('/').some(part => part === '' || part === '.' || part === '..')) {
    throw new Error(`invalid coverage source path: ${String(value)}`);
  }
  return value;
}

function uniquePaths(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('coverage source inventory is empty');
  const paths = values.map(sourcePath);
  if (new Set(paths).size !== paths.length) throw new Error('duplicate coverage source inventory path');
  return paths.sort();
}

/** Inventory from the exact include/exclude arrays supplied to Vitest. */
function sourceInventoryFromGlobs({ projectRoot, include, exclude, glob = globSync }) {
  if (!path.isAbsolute(projectRoot) || !Array.isArray(include) || include.length === 0 || !Array.isArray(exclude)) {
    throw new Error('coverage source globs require an absolute root and include/exclude arrays');
  }
  const paths = new Set();
  for (const pattern of include) {
    if (typeof pattern !== 'string' || pattern.length === 0) throw new Error('invalid coverage include glob');
    for (const file of glob(pattern, { cwd: projectRoot, exclude })) {
      paths.add(sourcePath(file.replaceAll('\\', '/')));
    }
  }
  return uniquePaths([...paths]);
}

function selectPlatformBaseline(baselines, platform) {
  if (!PLATFORMS.includes(platform)) throw new Error(`unsupported coverage baseline platform: ${platform}`);
  const baseline = baselines && baselines[platform];
  if (!baseline) throw new Error(`missing ${platform} coverage debt baseline`);
  const selected = typeof baseline === 'string' ? JSON.parse(readFileSync(baseline, 'utf8')) : baseline;
  if (selected?.schema !== 1 || selected.platform !== platform || !selected.files
    || typeof selected.files !== 'object' || Array.isArray(selected.files)) {
    throw new Error(`invalid ${platform} coverage debt baseline`);
  }
  return selected;
}

/** Multiset difference: identical Istanbul locations can appear more than once. */
function difference(left, right) {
  const counts = new Map();
  for (const item of right) counts.set(item, (counts.get(item) || 0) + 1);
  return left.filter((item) => {
    const remaining = counts.get(item) || 0;
    if (remaining === 0) return true;
    counts.set(item, remaining - 1);
    return false;
  });
}

/** Compare all source files in both directions, then reject debt beyond the reviewed ceiling. */
function compareCoverage({ baseline, expectedSources, current }) {
  if (baseline?.schema !== 1 || !PLATFORMS.includes(baseline.platform) || !baseline.files
    || typeof baseline.files !== 'object' || Array.isArray(baseline.files)) {
    throw new Error('invalid coverage debt baseline');
  }
  const expected = new Set(uniquePaths(expectedSources));
  const actual = new Set(Object.keys(current).map(sourcePath));
  const debt = new Set(Object.keys(baseline.files).map(sourcePath));
  const errors = [];

  for (const file of expected) if (!actual.has(file)) errors.push(`${file}: source is missing from coverage map`);
  for (const file of actual) if (!expected.has(file)) errors.push(`${file}: unexpected coverage source`);
  for (const file of debt) if (!expected.has(file)) errors.push(`${file}: stale debt path is absent from source inventory`);

  for (const file of expected) {
    const observed = current[file];
    if (!observed) continue;
    const allowed = baseline.files[file];
    for (const metric of METRICS) {
      const stats = observed.summary?.[metric];
      if (!stats || !Number.isSafeInteger(stats.total) || !Number.isSafeInteger(stats.covered)
        || stats.total < 0 || stats.covered < 0 || stats.covered > stats.total) {
        errors.push(`${file}: missing or invalid ${metric} coverage summary`);
        continue;
      }
      const gap = stats.total - stats.covered;
      if (!allowed) {
        if (gap !== 0) errors.push(`${file}: new ${metric} coverage gap (${gap})`);
      }
    }
    if (!Array.isArray(observed.uncovered)) {
      errors.push(`${file}: uncovered locations were not reported`);
      continue;
    }
    if (!allowed) {
      if (observed.uncovered.length !== 0) errors.push(`${file}: uncovered locations contradict 100% summary`);
      continue;
    }
    if (typeof allowed.sourceSha256 !== 'string' || !SHA256.test(allowed.sourceSha256)
      || observed.sourceSha256 !== allowed.sourceSha256) {
      errors.push(`${file}: reviewed debt source digest changed`);
    }
    if (!Array.isArray(allowed.uncovered) || allowed.uncovered.length === 0
      || allowed.uncovered.some(item => typeof item !== 'string')) {
      errors.push(`${file}: stale or invalid debt location list`);
      continue;
    }
    const added = difference(observed.uncovered, allowed.uncovered);
    if (added.length) errors.push(`${file}: ${added.length} new uncovered location(s)`);
  }
  return errors;
}

/** Use the same clickable records as the CI log; reject omitted invalid locations. */
function uncoveredLocations(fc, projectRoot) {
  const file = sourcePath(path.relative(projectRoot, fc.path).split(path.sep).join('/'));
  const zeros = [
    ...Object.values(fc.s),
    ...Object.values(fc.f),
    ...Object.values(fc.b).flat(),
  ].filter((hits) => {
    if (!Number.isSafeInteger(hits) || hits < 0) throw new Error(`${file}: invalid coverage hit count`);
    return hits === 0;
  }).length;
  const records = uncoveredRecords(fc, projectRoot);
  if (records.length !== zeros || records.some(record => !record.startsWith(`${file}:`))) {
    throw new Error(`${file}: uncovered location inventory is incomplete`);
  }
  return records.map(record => record.slice(file.length + 1)).sort();
}

class CoverageDebtGate extends ReportBase {
  constructor(options = {}) {
    super(options);
    this.projectRoot = options.projectRoot || process.cwd();
    this.platform = options.platform || process.platform;
    this.baselines = options.baselines;
    this.sourceGlobs = options.sourceGlobs;
    this.expectedSources = options.expectedSources;
    this.current = Object.create(null);
    this.failures = [];
  }

  onStart() {
    this.current = Object.create(null);
    this.failures = [];
  }

  onDetail(node) {
    try {
      const fc = node.getFileCoverage();
      const file = sourcePath(path.relative(this.projectRoot, fc.path).split(path.sep).join('/'));
      if (this.current[file]) throw new Error(`${file}: duplicate file coverage`);
      const summary = fc.toSummary().data;
      this.current[file] = {
        summary: Object.fromEntries(METRICS.map(metric => [metric, {
          total: summary[metric].total,
          covered: summary[metric].covered,
        }])),
        sourceSha256: sourceDigest(fc.path),
        uncovered: uncoveredLocations(fc, this.projectRoot),
      };
    } catch (error) {
      this.failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  onEnd() {
    const errors = [...this.failures];
    try {
      const baseline = selectPlatformBaseline(this.baselines, this.platform);
      const expectedSources = this.expectedSources
        ? (typeof this.expectedSources === 'function' ? this.expectedSources() : this.expectedSources)
        : sourceInventoryFromGlobs({ projectRoot: this.projectRoot, ...this.sourceGlobs });
      errors.push(...compareCoverage({ baseline, expectedSources, current: this.current }));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    if (errors.length === 0) return;
    for (const error of errors) console.error(`coverage-debt: ${error}`);
    if (!process.exitCode) process.exitCode = 1;
  }
}

module.exports = CoverageDebtGate;
module.exports.compareCoverage = compareCoverage;
module.exports.selectPlatformBaseline = selectPlatformBaseline;
module.exports.sourceInventoryFromGlobs = sourceInventoryFromGlobs;
module.exports.uncoveredLocations = uncoveredLocations;
