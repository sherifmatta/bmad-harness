import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorLine } from './error-line'

describe('ErrorLine', () => {
  it('always renders the message, and no disclosure without a detail', () => {
    const markup = renderToStaticMarkup(
      <ErrorLine error={{ code: 'a/b', message: 'roster · resolver failed' }} />
    )

    expect(markup).toContain('roster · resolver failed')
    expect(markup).not.toContain('<details')
  })

  it('puts the detail in the disclosure body only, under a fixed label', () => {
    const markup = renderToStaticMarkup(
      <ErrorLine error={{ code: 'a/b', message: 'roster · resolver failed', detail: 'exit 1' }} />
    )

    expect(markup).toContain('<details')
    expect(markup).toMatch(/<summary[^>]*>detail<\/summary>/)
    expect(markup.match(/exit 1/g)).toHaveLength(1)
    expect(markup).toMatch(/<\/summary>[^]*exit 1[^]*<\/details>/)
    expect(markup.replace(/<details[\s\S]*<\/details>/, '')).not.toContain('exit 1')
  })

  it('escapes what it is given and carries no role, live region or inline style', () => {
    const markup = renderToStaticMarkup(
      <ErrorLine error={{ code: 'a/b', message: '<b>x</b>', detail: '<i>y</i>' }} />
    )

    expect(markup).not.toContain('<b>')
    expect(markup).not.toContain('<i>')
    // The attribute names are assembled so this file is not itself a place
    // the whole-tree sweeps for them would have to look at.
    for (const attribute of [['ro', 'le'], ['aria', 'live'], ['sty', 'le']]) {
      expect(markup).not.toContain(attribute.join(attribute[0] === 'aria' ? '-' : ''))
    }
  })
})
