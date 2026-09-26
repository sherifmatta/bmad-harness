import { readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * The NFR23 literal guard, extracted so that exactly one definition of
 * "literal" exists and both suites that need it can import it.
 *
 * It lives in a plain module rather than in `tests/tokens.test.ts` because
 * Vitest re-registers an imported test module's suites in the importing file:
 * a second suite importing the guard from there would run every tokens test
 * twice and inflate the suite count. A non-`.test.ts` file in `tests/` is
 * typechecked by `tsconfig.node.json` but never collected as a suite, so the
 * guard is shared without being re-run.
 */

const ROOT = resolve(import.meta.dirname, '..')
const TOKENS = join(ROOT, 'src/renderer/design/tokens.css')
const RENDERER = join(ROOT, 'src/renderer')

/** CSS comments blanked out, line structure preserved, so line numbers survive. */
export function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
}

/**
 * NFR23's enforcement arm. Scoped to stylesheets on purpose: scanning `.tsx`
 * would fire on Story 1.6's portrait palettes, which are literal hex in source
 * by design. Every `.css` under `src/renderer/` except `design/tokens.css` —
 * the one file entitled to literals — must reach its values through `var()`.
 */
const LITERAL_RULES = [
  { kind: 'hex colour', pattern: /#[0-9a-fA-F]{3,8}\b/g },
  // Eleven of tokens.css's own colours are written as rgba(), so this is the
  // spelling a component is most likely to paste — the guard missed it entirely
  // while claiming to detect literal colour.
  {
    kind: 'colour function',
    pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((?![^)]*var\()[^)]*\)/g
  },
  // Every unit the design system could be restated in, and negatives: the
  // inset rules DESIGN.md names are written `inset 0 -2px 0 …`, so a lookbehind
  // that excluded a leading `-` excluded exactly the values most at risk.
  {
    kind: 'dimension',
    pattern: /(?<![\w.#])-?\d*\.?\d+(?:px|ch|rem|em|pt|vh|vw|vmin|vmax|%)(?![\w-])/g
  },
  {
    kind: 'font stack',
    pattern: /font(?:-family)?\s*:\s*[^;}]*[a-zA-Z][^;}]*/g
  },
  // Longhand corners match neither the shorthand rule nor the dimension rule
  // when the value is a percentage of a keyword.
  {
    kind: 'radius',
    pattern: /border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*[^;}]+/g
  }
]

/** A declaration's literal half, with every `var(…)` reference removed. */
function withoutReferences(value: string): string {
  return value.replace(/var\(\s*--[\w-]+\s*(?:,[^()]*(?:\([^()]*\))?)?\)/g, ' ')
}

type Literal = { file: string; line: number; kind: string; text: string }

export function literalsIn(file: string, css: string): Literal[] {
  const source = withoutComments(css)
  const found: Literal[] = []

  for (const { kind, pattern } of LITERAL_RULES) {
    for (const match of source.matchAll(pattern)) {
      // The exemption is per value, not per declaration: `font-family:
      // var(--mono), Menlo` and `border-radius: 4px var(--r)` each carry a
      // literal that a whole-declaration lookahead waved through.
      const remainder = withoutReferences(match[0])
      const carriesLiteral =
        kind === 'font stack' || kind === 'radius'
          ? /[a-zA-Z0-9#]/.test(remainder.replace(/^[^:]*:/, ''))
          : true
      if (!carriesLiteral) {
        continue
      }

      found.push({
        file,
        line: source.slice(0, match.index).split('\n').length,
        kind,
        text: match[0].trim()
      })
    }
  }

  return found.sort((a, b) => a.line - b.line)
}

function stylesheetsUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return stylesheetsUnder(path)
    }
    return entry.name.endsWith('.css') ? [path] : []
  })
}

/** Every stylesheet under `src/renderer/`, tokens.css included, repo-relative. */
export function allStylesheets(): string[] {
  return stylesheetsUnder(RENDERER).map((path) => relative(ROOT, path))
}

/** Every stylesheet the guard governs — tokens.css is the one exemption. */
export function guardedStylesheets(): string[] {
  return stylesheetsUnder(RENDERER)
    .filter((path) => path !== TOKENS)
    .map((path) => relative(ROOT, path))
}

/**
 * The contents of every `style={{ … }}` prop, brace-balanced so a nested object
 * or a template expression inside the prop does not end the block early.
 */
function inlineStyleBlocks(source: string): { body: string; index: number }[] {
  const blocks: { body: string; index: number }[] = []
  const opener = /style\s*=\s*\{\{/g
  let match: RegExpExecArray | null

  while ((match = opener.exec(source)) !== null) {
    const from = match.index + match[0].length
    let depth = 2
    let at = from

    while (at < source.length && depth > 0) {
      if (source[at] === '{') {
        depth += 1
      } else if (source[at] === '}') {
        depth -= 1
      }
      at += 1
    }

    // An unbalanced prop runs to end-of-file; report what there is rather than
    // skipping it, so a typo cannot hide a literal from the sweep.
    blocks.push({ body: source.slice(from, depth === 0 ? at - 2 : at), index: from })
    opener.lastIndex = at
  }

  return blocks
}

/**
 * Literals restated inside a component's `style` props. Deliberately *not* a
 * scan of the whole file: curated palettes elsewhere in a `.tsx` are literal
 * hex by design, and a blanket scan would make those unwritable.
 */
export function inlineStyleLiteralsIn(file: string, source: string): Literal[] {
  const text = withoutComments(source).replace(/^\s*\/\/.*$/gm, '')

  return inlineStyleBlocks(text).flatMap(({ body, index }) => {
    const before = text.slice(0, index).split('\n').length - 1
    return literalsIn(file, body).map((literal) => ({
      ...literal,
      line: literal.line + before
    }))
  })
}

/** Every component the inline-style guard governs, repo-relative. */
export function componentsUnder(): string[] {
  return sourcesUnder(RENDERER)
    .filter((path) => path.endsWith('.tsx'))
    .map((path) => relative(ROOT, path))
}

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? sourcesUnder(path) : [path]
  })
}
