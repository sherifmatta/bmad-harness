import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

//
// The layer rule is an error, not a convention.
//
// Layers in dependency order - each may depend only on what sits below it:
//   View         src/renderer/ui/
//   Design       src/renderer/design/
//   Bridge       src/shared/
//   Projections  src/main/projections/
//   Fold         src/main/fold/
//   Sources      src/main/sources/
//
// Two process-wide floors sit under the six layers, so that no file under
// `src/` is unconstrained merely because nobody named its directory:
//
//   src/main/**      may reach the main side freely - that is the composition
//                    root's job - but never the renderer half and never the
//                    preload bundle, which are separate build targets it can
//                    only address by file path.
//   src/renderer/**  may never reach the main process at all. That absence is
//                    the security posture, not a style preference.
//
// The per-layer blocks below come *after* the floors and override them for
// their own directories, so each layer is constrained at least as tightly as
// its process. A new directory nobody thought about inherits its floor rather
// than escaping.
//
//   src/preload/     the bridge surface, loaded into the renderer's process.
//                    Its own bundle, so it reaches into neither half.
//   src/main/windows/  the macOS-aware shell: main side yes, renderer half no.
//
// Each rule is scoped to its own layer's `files` glob, so the configuration
// reads as the dependency graph rather than as a list of exceptions. The graph
// is exported as LAYER_GRAPH so tests/layering.test.ts can probe every pair it
// generates, instead of asserting a hand-picked two.
//
// Spellings. A cross-layer import is caught however it is written, because the
// patterns are regular expressions over the import specifier rather than globs
// at a fixed nesting depth:
//
//   src/main/sources/x        root-qualified
//   ../../main/sources/x      parent-qualified relative
//   @scope/main/sources/x     aliased (nothing today; the hole is closed in
//                             advance so introducing an alias cannot open one)
//   ../sources/x              sibling-relative - the spelling a neighbouring
//                             layer actually writes
//   ../../../../sources/x     the same, from any nesting depth
//
// The sibling-relative alternative is anchored to a leading `../`, so it can
// only ever match a relative specifier and never a package name. For a
// single-segment directory (`preload`, `shared`) the qualified alternative is
// anchored to `src/` for the same reason - `@electron-toolkit/preload` is a
// package, not this project's preload.
//
// Dynamic `import()` is covered by `no-restricted-syntax` over the same source,
// because `no-restricted-imports` sees only static imports. `require()` is
// covered by `@typescript-eslint/no-require-imports`, which tseslint's
// recommended config already errors on for every specifier.
//

const VIEW = 'src/renderer/ui'
const DESIGN = 'src/renderer/design'
const BRIDGE = 'src/shared'
const PROJECTIONS = 'src/main/projections'
const FOLD = 'src/main/fold'
const SOURCES = 'src/main/sources'
const WINDOWS = 'src/main/windows'
const PRELOAD = 'src/preload'

/**
 * The two processes. Naming a process rather than each of its layers is what
 * makes the floors total: `src/main` matches `../../main/sources/x` and
 * `../../main/anything-added-later/x` alike.
 */
const MAIN = 'src/main'
const RENDERER = 'src/renderer'

/**
 * The dependency graph. `files` is where the rule applies, `dir` is where a
 * probe for that layer is written, `forbidden` is what it may not reach.
 * Anything not listed in `forbidden` is permitted - Bridge (`src/shared/`) is
 * below everything and so appears in no `forbidden` list.
 */
export const LAYER_GRAPH = [
  // The floors, first so the layers below can override them.
  {
    name: 'Main process',
    dir: MAIN,
    files: [`${MAIN}/**`],
    forbidden: [RENDERER, PRELOAD]
  },
  {
    name: 'Renderer process',
    dir: RENDERER,
    files: [`${RENDERER}/**`],
    forbidden: [MAIN, PRELOAD]
  },

  // The six layers, in dependency order.
  {
    name: 'View',
    dir: VIEW,
    files: [`${VIEW}/**`],
    forbidden: [MAIN, PRELOAD]
  },
  {
    name: 'Design',
    dir: DESIGN,
    files: [`${DESIGN}/**`],
    forbidden: [VIEW, MAIN, PRELOAD]
  },
  {
    name: 'Bridge',
    dir: BRIDGE,
    files: [`${BRIDGE}/**`],
    forbidden: [MAIN, RENDERER, PRELOAD]
  },
  {
    name: 'Projections',
    dir: PROJECTIONS,
    files: [`${PROJECTIONS}/**`],
    forbidden: [WINDOWS, RENDERER, PRELOAD]
  },
  {
    name: 'Fold',
    dir: FOLD,
    files: [`${FOLD}/**`],
    forbidden: [SOURCES, PROJECTIONS, WINDOWS, RENDERER, PRELOAD]
  },
  {
    name: 'Sources',
    dir: SOURCES,
    files: [`${SOURCES}/**`],
    forbidden: [FOLD, PROJECTIONS, WINDOWS, RENDERER, PRELOAD]
  },

  // Outside the stack.
  {
    name: 'Windows',
    dir: WINDOWS,
    files: [`${WINDOWS}/**`],
    forbidden: [RENDERER, PRELOAD]
  },
  {
    name: 'Preload',
    dir: PRELOAD,
    files: [`${PRELOAD}/**`],
    forbidden: [MAIN, RENDERER]
  }
]

const MESSAGE =
  'layering violation - this layer may depend only on the layers below it (see eslint.config.mjs)'

function escapeForRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The two spellings of one forbidden directory, as regular-expression sources. */
function layerAlternatives(directory) {
  const withoutSrc = directory.replace(/^src\//, '')
  const segments = withoutSrc.split('/')
  const basename = segments[segments.length - 1]
  // A single-segment name is too common to match unanchored: `preload` and
  // `shared` are qualified with `src/` so a package subpath cannot collide.
  const qualified = segments.length > 1 ? withoutSrc : `src/${withoutSrc}`

  return [
    `(?:^|/)${escapeForRegex(qualified)}(?:/|$)`,
    `^(?:\\.\\./)+${escapeForRegex(basename)}(?:/|$)`
  ]
}

/** One regular-expression source matching any reach into any forbidden layer. */
export function forbiddenSpecifierPattern(forbidden) {
  return forbidden.flatMap(layerAlternatives).join('|')
}

function layerConfig({ files, forbidden }) {
  const pattern = forbiddenSpecifierPattern(forbidden)

  return {
    files,
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ regex: pattern, message: MESSAGE }] }],
      'no-restricted-syntax': [
        'error',
        {
          // esquery delimits the regular expression with `/`, so every `/` in
          // the source is escaped for the selector and only for the selector.
          selector: `ImportExpression[source.value=/${pattern.replace(/\//g, '\\/')}/]`,
          message: MESSAGE
        }
      ]
    }
  }
}

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**'] },

  ...tseslint.configs.recommended,

  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended
  },

  ...LAYER_GRAPH.map(layerConfig)
)
