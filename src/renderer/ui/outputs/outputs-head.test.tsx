import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OutputsFolder, OutputsState } from './outputs-head'

describe('OutputsFolder', () => {
  it('is the folder watched, then `change…` as one native button', () => {
    expect(renderToStaticMarkup(<OutputsFolder folder="docs/out/" onChange={() => {}} />)).toBe(
      '<span class="outputs-where">docs/out/</span><button type="button" class="outputs-change">change…</button>'
    )
  })

  it('draws the folder as text, whatever it holds', () => {
    expect(renderToStaticMarkup(<OutputsFolder folder="<b>x</b>/" onChange={() => {}} />)).toContain(
      '&lt;b&gt;x&lt;/b&gt;/'
    )
  })

  it('has no tab stop, role, title, icon or colour of its own: the button is one native stop', () => {
    const markup = renderToStaticMarkup(<OutputsFolder folder="_bmad/" onChange={() => {}} />)

    expect(markup).not.toMatch(/tabindex|role=|title=|style=|<svg|<img|aria-/i)
  })
})

describe('OutputsState', () => {
  it('is one plain line of text', () => {
    expect(renderToStaticMarkup(<OutputsState line="bmad writes to · _bmad/" />)).toBe(
      '<p class="outputs-state">bmad writes to · _bmad/</p>'
    )
  })

  it('is no live region, alert or status: the window’s one polite region speaks, and not this', () => {
    expect(renderToStaticMarkup(<OutputsState line="not changed · inside .git" />)).not.toMatch(
      /aria-\w+|role=/
    )
  })
})
