import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { Composer } from './composer'

describe('Composer', () => {
  const markup = renderToStaticMarkup(<Composer agentName="John" onSend={() => {}} />)

  it('is a wrapper, an inner column, a field with a textarea and a send button, and a hint', () => {
    expect(markup).toMatch(
      /^<div class="composer"><div class="composer-inner"><div class="composer-field"><textarea[^>]*class="composer-input"[^>]*><\/textarea><button type="button" class="composer-send">Send<\/button><\/div><div class="composer-hint">/
    )
  })

  it('names the persona in the placeholder and the label', () => {
    expect(markup).toContain('placeholder="message John"')
    expect(markup).toContain('aria-label="Message John"')
    expect(markup).toContain('rows="1"')
  })

  it('is never disabled, read-only or aria-disabled, with or without a handler', () => {
    for (const out of [markup, renderToStaticMarkup(<Composer agentName="John" />)]) {
      expect(out).not.toMatch(/disabled|readonly|aria-disabled/i)
    }
  })

  it('states only what is true today: enter sends, shift+enter adds a line', () => {
    expect(markup).toContain(
      '<div class="composer-hint"><span>enter sends</span><span aria-hidden="true">·</span><span>shift+enter adds a line</span></div>'
    )
    expect(markup).not.toMatch(/@|⌘|↵|skill|toml/i)
  })

  it('has no inline style, no title and no tabindex of its own', () => {
    expect(markup).not.toMatch(/style=|title=|tabindex/i)
  })

  it('renders a hostile name as text', () => {
    const out = renderToStaticMarkup(<Composer agentName="<img src=x onerror=1>" />)

    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })
})
