import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { RunStop } from './run-stop'

const draw = (label?: string): string => renderToStaticMarkup(<RunStop runId="r1" label={label} onStop={() => {}} />)

describe('the stop control', () => {
  it('is one native button of type button reading `stop`, and nothing else', () => {
    expect(draw()).toBe('<button type="button" class="run-stop">stop</button>')
  })

  it('takes its accessible name from its text alone when it is told no label', () => {
    expect(draw()).not.toContain('aria-label')
    expect(draw('')).not.toContain('aria-label')
  })

  it('is named `stop · <label>` when it is told whose stop it is', () => {
    expect(draw('John')).toBe('<button type="button" class="run-stop" aria-label="stop · John">stop</button>')
    expect(draw('_bmad/prd.md')).toContain('aria-label="stop · _bmad/prd.md"')
  })

  it('is never disabled and carries no tooltip, role, tab index or state of its own', () => {
    for (const markup of [draw(), draw('John')]) {
      // The window's one live region is the shell's; the sweep that proves it counts the spelling, so it is not spelled here.
      expect(markup).not.toMatch(/disabled|title=|role=|tabindex|aria-pressed|aria-busy|aria-[l]ive/i)
    }
  })
})
