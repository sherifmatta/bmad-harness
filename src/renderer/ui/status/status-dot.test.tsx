import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { PERSONA_STATES, STATE_TEXT } from './persona-state'
import { StateLine, StatusDot } from './status-dot'

describe('StatusDot', () => {
  it.each(PERSONA_STATES)('renders the %s state as its own class, hidden from assistive tech', (state) => {
    const markup = renderToStaticMarkup(<StatusDot state={state} />)

    expect(markup).toBe(`<span class="status-dot status-dot--${state}" aria-hidden="true"></span>`)
  })

  it('renders five distinct classes for five states', () => {
    const classes = PERSONA_STATES.map(
      (state) => renderToStaticMarkup(<StatusDot state={state} />).match(/class="([^"]*)"/)?.[1]
    )

    expect(new Set(classes).size).toBe(5)
  })
})

describe('StateLine', () => {
  it.each(PERSONA_STATES)('pairs the %s dot with its text', (state) => {
    const markup = renderToStaticMarkup(<StateLine state={state} />)

    expect(markup.match(/class="status-dot /g)).toHaveLength(1)
    expect(markup).toContain(`status-dot--${state}`)
    expect(markup).toContain(`<span class="state-text">${STATE_TEXT[state]}</span>`)
    expect(markup).toContain('aria-hidden="true"')
  })
})
