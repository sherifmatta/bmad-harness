import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { guardedStylesheets, literalsIn, withoutComments, withoutLightTheme } from './literal-guard'

/**
 * Story 2.3's turn and composer, asserted from the stylesheets and sources as
 * text. The behaviour (keys, focus, growth) is held by the DOM tests beside the
 * components; what only the files can show is that the values are tokens, that
 * the grounds and radii are the ones DESIGN.md names, and that the sources
 * carry none of the things the story forbids.
 */

const ROOT = resolve(import.meta.dirname, '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

/** Source with block comments and whole-line `//` comments removed. */
const code = (path: string): string => withoutComments(read(path)).replace(/^\s*\/\/.*$/gm, '')

const CHAT = 'src/renderer/ui/chat/'
const TURN_CSS = `${CHAT}turn.css`
const COMPOSER_CSS = `${CHAT}composer.css`
const SHELL_CSS = 'src/renderer/ui/shell/shell.css'
const TOKENS_CSS = 'src/renderer/design/tokens.css'
const DESIGN_MD = '_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/DESIGN.md'

const turnCss = withoutComments(read(TURN_CSS))
const composerCss = withoutComments(read(COMPOSER_CSS))
const shellCss = withoutComments(read(SHELL_CSS))
// The dark theme's declarations: the light twins restate them and are the theme tests' own.
const tokensCss = withoutLightTheme(withoutComments(read(TOKENS_CSS)))

/** The declaration block of the first rule whose selector list holds exactly `selector`. */
function ruleBody(css: string, selector: string): string {
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.split(',').some((candidate) => candidate.trim() === selector)) {
      return body
    }
  }
  throw new Error(`no rule for ${selector}`)
}

const declared = new Map(
  [...tokensCss.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])
)

const chatSources = readdirSync(join(ROOT, CHAT))
  .filter((name) => !/\.test\./.test(name))
  .map((name) => `${CHAT}${name}`)

describe('the stylesheets', () => {
  it('are governed by the literal guard and reach every value through a declared token', () => {
    for (const path of [TURN_CSS, COMPOSER_CSS]) {
      expect(guardedStylesheets(), path).toContain(path)
      expect(literalsIn(path, read(path)), path).toEqual([])

      const used = [...withoutComments(read(path)).matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name]) => name)
      expect(used.length, path).toBeGreaterThan(0)
      expect(
        used.filter((name) => !declared.has(name)),
        path
      ).toEqual([])
    }
  })

  it('hold no focus rule, no outline, no motion, no stacking and no media query', () => {
    for (const css of [turnCss, composerCss]) {
      expect(css).not.toMatch(/:focus(?!-within)|outline|transition|animation|@keyframes|z-index|@media|!important/)
    }
  })
})

describe('the turn', () => {
  it('is a card-radius container', () => {
    expect(ruleBody(turnCss, '.turn')).toContain('border-radius: var(--radius-card)')
    expect(declared.get('--radius-card')).toBe('6px')
  })

  it('puts the user turn on the accent wash with the inset accent-edge rule', () => {
    const body = ruleBody(turnCss, '.turn--user')

    expect(body).toContain('background: var(--accent-wash)')
    expect(body).toContain('box-shadow: var(--inset-turn-user)')
    expect(declared.get('--inset-turn-user')).toBe('inset 2px 0 0 var(--accent-edge)')
  })

  it('sets the header at the name, ident and meta rungs and the words at the base size, the mockup’s inherited 13px', () => {
    expect(ruleBody(turnCss, '.turn-name')).toMatch(/font-size: var\(--fs-name\)[\s\S]*font-weight: var\(--weight-strong\)/)
    expect(declared.get('--fs-name')).toBe('12.5px')

    const role = ruleBody(turnCss, '.turn-role')
    expect(role).toContain('font-family: var(--sans)')
    expect(role).toContain('font-size: var(--fs-ident)')
    expect(role).toContain('color: var(--faint)')

    const time = ruleBody(turnCss, '.turn-time')
    expect(time).toContain('font-family: var(--mono)')
    expect(time).toContain('font-size: var(--fs-meta)')
    expect(time).toContain('color: var(--meta)')
    expect(time).toContain('margin-left: auto')

    const words = ruleBody(turnCss, '.turn-words')
    expect(words).toContain('font-family: var(--sans)')
    expect(words).toContain('font-size: var(--fs-base)')
    expect(words).toContain('line-height: var(--lh-base)')
    expect(ruleBody(turnCss, '.turn-words p')).toContain('white-space: pre-wrap')
  })

  it('takes the padding and gap the mockup tunes', () => {
    expect(declared.get('--turn-padding')).toBe('12px 10px')
    expect(declared.get('--turn-gap')).toBe('12px')
    expect(declared.get('--initials-size-user')).toBe('32px')
  })
})

describe('the composer', () => {
  it('is a panel field with a 1px line and a card radius, whose border does not change on focus', () => {
    const body = ruleBody(composerCss, '.composer-field')

    expect(body).toContain('background: var(--panel)')
    expect(body).toContain('border: var(--rule-width) solid var(--line)')
    expect(body).toContain('border-radius: var(--radius-card)')
    expect(declared.get('--rule-width')).toBe('1px')
    // The mockup's focus-within border is not carried: no rule, no token.
    expect(composerCss).not.toMatch(/:focus/)
    expect(declared.has('--composer-focus-line')).toBe(false)
  })

  it('grows from --composer-min to --composer-max and takes its placeholder from a token', () => {
    const body = ruleBody(composerCss, '.composer-input')

    // The height is set from scrollHeight, which includes the padding.
    expect(body).toContain('box-sizing: border-box')
    expect(body).toContain('min-height: var(--composer-min)')
    expect(body).toContain('max-height: var(--composer-max)')
    expect(body).toContain('overflow-y: auto')
    expect(declared.get('--composer-min')).toBe('20px')
    expect(declared.get('--composer-max')).toBe('120px')
    expect(ruleBody(composerCss, '.composer-input::placeholder')).toContain('color: var(--composer-placeholder)')
    expect(declared.get('--composer-placeholder')).toBe('#636363')
  })

  it('gives the send button its own ground, border, glyph and hover, at the control radius', () => {
    const body = ruleBody(composerCss, '.composer-send')

    expect(body).toContain('background: var(--send-bg)')
    expect(body).toContain('var(--send-line)')
    expect(body).toContain('color: var(--send-ink)')
    expect(body).toContain('border-radius: var(--radius-control)')
    expect(ruleBody(composerCss, '.composer-send:hover')).toContain('background: var(--send-hover)')
    expect([
      declared.get('--send-bg'),
      declared.get('--send-line'),
      declared.get('--send-ink'),
      declared.get('--send-hover')
    ]).toEqual(['#393939', '#4b4b4b', '#dedede', '#424242'])
  })

  it('sets the hint at the label rung in meta, mono', () => {
    const body = ruleBody(composerCss, '.composer-hint')

    expect(body).toContain('font-size: var(--fs-label)')
    expect(body).toContain('color: var(--meta)')
    expect(body).toContain('font-family: var(--mono)')
  })
})

describe('the caps', () => {
  it('holds .thread and .composer-inner to --thread-max, which is 940px', () => {
    expect(ruleBody(shellCss, '.thread')).toContain('max-width: var(--thread-max)')
    expect(ruleBody(composerCss, '.composer-inner')).toContain('max-width: var(--thread-max)')
    expect(declared.get('--thread-max')).toBe('940px')
  })

  it('keeps the chat header’s second line at --chat-sub-max', () => {
    expect(ruleBody(withoutComments(read(`${CHAT}chat-header.css`)), '.chat-head-sub')).toContain(
      'max-width: var(--chat-sub-max)'
    )
    expect(declared.get('--chat-sub-max')).toBe('72ch')
  })
})

describe('the sources', () => {
  it('carry neither the command glyph nor the return glyph, in code or in comment', () => {
    for (const path of [...chatSources, ...[TURN_CSS, COMPOSER_CSS]]) {
      expect(read(path), path).not.toMatch(/⌘|↵/)
    }
  })

  it('lock nothing, anywhere in the chat components', () => {
    // Story 3.1: the skill row's buttons are disabled while the persona's turn is
    // in flight, by the spec's own words, and they are the only thing that is.
    for (const path of chatSources.filter((name) => name.endsWith('.tsx') && !name.endsWith('/skill-row.tsx'))) {
      expect(code(path), path).not.toMatch(/\bdisabled\b|\breadOnly\b|aria-disabled/)
    }
    const row = chatSources.find((name) => name.endsWith('/skill-row.tsx'))
    expect(row).toBeDefined()
    expect(code(row ?? '')).not.toMatch(/\breadOnly\b|aria-disabled/)
    expect([...code(row ?? '').matchAll(/\bdisabled=\{/g)]).toHaveLength(1)
  })

  it('draw no focus rule or ring suppression in a component either', () => {
    // Story 3.5: the run card's container is the one programmatic focus target, `tabIndex={-1}`
    // and never a tab stop, and only on a card drawn in place of the line the user activated.
    const FOCUS_TARGET = 'src/renderer/ui/chat/run-card.tsx'
    for (const path of chatSources.filter((name) => name.endsWith('.tsx') && name !== FOCUS_TARGET)) {
      expect(code(path), path).not.toMatch(/outline|autoFocus|tabIndex/)
    }
    expect(code(FOCUS_TARGET)).not.toMatch(/outline|autoFocus/)
    expect([...code(FOCUS_TARGET).matchAll(/tabIndex=\{[^}]*\}/g)].map(([hit]) => hit)).toEqual([
      'tabIndex={focusFirst ? -1 : undefined}'
    ])
  })

  it('take no dependency beyond React and the renderer', () => {
    for (const path of chatSources.filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'))) {
      const specifiers = [...read(path).matchAll(/from\s+'([^']+)'/g)].map(([, specifier]) => specifier)

      expect(
        specifiers.filter((specifier) => !specifier.startsWith('.') && specifier !== 'react'),
        path
      ).toEqual([])
    }
  })

  it('are mounted by the app, which hands the shell only a slot for the composer', () => {
    const app = read('src/renderer/ui/app.tsx')
    const shell = read('src/renderer/ui/shell/shell.tsx')

    expect(app).toMatch(/import \{ Composer \} from '\.\/chat\/composer'/)
    expect(app).toMatch(/import \{ pinnedRun, Turns \} from '\.\/chat\/transcript'/)
    expect(app).toContain('<Composer')
    expect(app).toMatch(
      /<Turns entries=\{conversation\.entries\} onCancel=\{conversation\.cancel\} canAnswer=\{conversation\.canAnswer\} onChoose=\{answer\} prose=\{conversation\.prose\} pinnedRunId=\{pinnedEntry\?\.id\} collapse=\{collapse\} onStop=\{conversation\.stopRun\} inFlight=\{inFlight\} \/>/
    )
    // The shell takes a render prop and a callback; it imports no conversation part.
    expect(shell).not.toMatch(/from '\.\.\/chat\/(?:composer|transcript|turn|use-conversation|conversation-state)'/)
  })
})

describe('DESIGN.md', () => {
  const design = read(DESIGN_MD)

  it('names the conversation turn as a component, in the frontmatter and in prose', () => {
    expect(design).toMatch(/^ {2}conversation-turn:\n(?: {4}.+\n)+/m)
    expect(design).toContain('### Conversation turn')
  })

  it('gives it the values the stylesheet spends', () => {
    const block = design.slice(design.indexOf('  conversation-turn:'), design.indexOf('  composer:'))

    expect(block).toContain("radius: '{rounded.card}'")
    expect(block).toContain('portraitSize: 32px')
    expect(block).toContain("userBackground: '{colors.accent-wash}'")
    expect(block).toContain("userRule: 'inset 2px 0 0 {colors.accent-edge}'")
  })
})
