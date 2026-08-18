#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  PAGE_GROUPS,
  validateNavigation,
  compareOutsideNavigation
} from './lib/site-navigation-contract.mjs';

const root = process.cwd();
const baseIndex = process.argv.indexOf('--base');
const baseRef = baseIndex >= 0
  ? process.argv[baseIndex + 1]
  : execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim();
const failures = [];
const sharedAssets = [
  'assets/css/nav-utilities.css',
  'assets/js/shared/nav-utilities.js'
];

if (!baseRef) {
  console.error('A valid --base Git ref is required.');
  process.exit(1);
}

for (const file of Object.keys(PAGE_GROUPS)) {
  const candidate = fs.readFileSync(path.join(root, file), 'utf8');
  for (const message of validateNavigation(file, candidate)) {
    failures.push(`${file}: ${message}`);
  }

  const base = execFileSync('git', ['show', `${baseRef}:${file}`], {
    cwd: root,
    encoding: 'utf8'
  });
  if (!compareOutsideNavigation(base, candidate)) {
    failures.push(`${file}: content changed outside primary/mobile navigation`);
  }

  for (const asset of sharedAssets) {
    const count = candidate.split(asset).length - 1;
    if (count !== 1) failures.push(`${file}: ${asset} must be included exactly once`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Navigation contract passed for ${Object.keys(PAGE_GROUPS).length} pages against ${baseRef}.`);
