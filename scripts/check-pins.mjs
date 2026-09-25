#!/usr/bin/env node
/**
 * The pinned stack is verifiable by command, not by reading.
 *
 * Asserts that every NFR11 row resolves in package-lock.json to its exact
 * pinned version, and that package.json declares it as an exact version rather
 * than a range. Exits non-zero on any drift, printing nothing when clean.
 *
 * The set is bumped together or not at all — see DEPENDENCIES.md. Changing a
 * version here without changing it there is the drift this script exists to
 * catch.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The twelve NFR11 rows, verified against the npm registry on 2026-09-23. */
const PINS = {
  electron: '44.4.5',
  react: '19.3.0',
  typescript: '6.0.3',
  vite: '7.3.6',
  'electron-vite': '5.0.0',
  '@vitejs/plugin-react-swc': '4.3.3',
  'electron-builder': '26.15.3',
  vitest: '5.0.1',
  'typescript-eslint': '8.70.1',
  chokidar: '4.0.3',
  'markdown-it': '15.0.2',
  dompurify: '3.4.16'
}

/** Declared alongside React and moved with it. */
const COMPANIONS = { 'react-dom': '19.3.0' }

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repositoryRoot, relativePath), 'utf8'))
}

const packageJson = readJson('package.json')
const lockfile = readJson('package-lock.json')

const declared = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies
}

const problems = []

for (const [name, expected] of Object.entries({ ...PINS, ...COMPANIONS })) {
  const declaredRange = declared[name]
  if (declaredRange === undefined) {
    problems.push(`${name}: not declared in package.json`)
    continue
  }
  if (!EXACT_VERSION.test(declaredRange)) {
    problems.push(`${name}: package.json declares "${declaredRange}", not an exact version`)
  }
  if (declaredRange !== expected) {
    problems.push(`${name}: package.json declares "${declaredRange}", expected "${expected}"`)
  }

  const entry = lockfile.packages?.[`node_modules/${name}`]
  if (entry === undefined) {
    problems.push(`${name}: absent from package-lock.json`)
    continue
  }
  if (entry.version !== expected) {
    problems.push(`${name}: package-lock.json resolves ${entry.version}, expected ${expected}`)
  }
}

if (problems.length > 0) {
  console.error('pinned stack has drifted from NFR11:')
  for (const problem of problems) {
    console.error(`  - ${problem}`)
  }
  console.error('\nthe set is bumped together or not at all — see DEPENDENCIES.md')
  process.exit(1)
}
