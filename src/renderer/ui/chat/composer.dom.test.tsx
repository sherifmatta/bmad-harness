// @vitest-environment jsdom
import { createElement, createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { Composer } from './composer'

let mounted: Mounted | null
let sent: string[]

function render(withHandler = true): {
  field: HTMLTextAreaElement
  button: HTMLButtonElement
} {
  const onSend = withHandler ? (text: string): void => void sent.push(text) : undefined
  mounted = mount(createElement(Composer, { agentName: 'John', onSend }))
  return {
    field: mounted.container.querySelector('textarea') as HTMLTextAreaElement,
    button: mounted.container.querySelector('button') as HTMLButtonElement
  }
}

/** React's controlled input listens for the native setter, not for `.value =`. */
function type(field: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    setter?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function press(field: HTMLTextAreaElement, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init })
  act(() => void field.dispatchEvent(event))
  return event
}

beforeEach(() => {
  mounted = null
  sent = []
})

afterEach(() => {
  mounted?.unmount()
})

describe('Enter', () => {
  it('sends the text, clears the field and keeps focus in it', () => {
    const { field } = render()
    field.focus()
    type(field, 'hi')

    const event = press(field, {})

    expect(sent).toEqual(['hi'])
    expect(event.defaultPrevented).toBe(true)
    expect(field.value).toBe('')
    expect(document.activeElement).toBe(field)
  })

  it('sends the text trimmed and nothing else changed', () => {
    const { field } = render()
    type(field, '  hello\nthere  \n')
    press(field, {})

    expect(sent).toEqual(['hello\nthere'])
  })
})

describe('the chords that do not send', () => {
  it('leaves Shift+Enter to insert a newline', () => {
    const { field } = render()
    type(field, 'hi')

    const event = press(field, { shiftKey: true })

    expect(sent).toEqual([])
    expect(event.defaultPrevented).toBe(false)
    expect(field.value).toBe('hi')
  })

  it.each([
    ['Meta', { metaKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['Alt', { altKey: true }]
  ])('does not send on %s+Enter and keeps the draft', (_name, init) => {
    const { field } = render()
    type(field, 'hi')

    press(field, init)

    expect(sent).toEqual([])
    expect(field.value).toBe('hi')
  })

  it('never sends while an input method is composing', () => {
    const { field } = render()
    type(field, 'hi')

    press(field, { isComposing: true })
    press(field, { keyCode: 229 })

    expect(sent).toEqual([])
    expect(field.value).toBe('hi')
  })

  it('ignores every other key', () => {
    const { field } = render()
    type(field, 'hi')

    const event = press(field, { key: 'a' })

    expect(sent).toEqual([])
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('a blank draft', () => {
  it.each(['', '   ', '\n \t\n'])('sends nothing for %j on Enter or on click, and keeps it', (draft) => {
    const { field, button } = render()
    type(field, draft)

    press(field, {})
    act(() => button.click())

    expect(sent).toEqual([])
    expect(field.value).toBe(draft)
  })
})

describe('with no handler', () => {
  it('keeps the draft on Enter and on click', () => {
    const { field, button } = render(false)
    type(field, 'hi')

    press(field, {})
    act(() => button.click())

    expect(field.value).toBe('hi')
  })
})

describe('the send button', () => {
  it('sends the draft and returns focus to the field', () => {
    const { field, button } = render()
    type(field, 'hi')
    button.focus()

    act(() => button.click())

    expect(sent).toEqual(['hi'])
    expect(field.value).toBe('')
    expect(document.activeElement).toBe(field)
  })
})

describe('never locked', () => {
  it('carries no disabled, read-only or aria-disabled before, during or after a send', () => {
    const { field, button } = render()
    const locked = (): boolean =>
      [field, button].some(
        (element) =>
          element.hasAttribute('disabled') ||
          element.hasAttribute('readonly') ||
          element.hasAttribute('aria-disabled')
      )

    expect(locked()).toBe(false)
    type(field, 'hi')
    expect(locked()).toBe(false)
    press(field, {})
    expect(locked()).toBe(false)
    type(field, '')
    expect(locked()).toBe(false)
  })

  it('has the field and the button as the only tab stops, with no tabindex override', () => {
    const { field, button } = render()
    const stops = mounted?.container.querySelectorAll('[tabindex], button, textarea, a, input, select')

    expect([...(stops ?? [])]).toEqual([field, button])
    expect(field.hasAttribute('tabindex')).toBe(false)
    expect(button.hasAttribute('tabindex')).toBe(false)
  })
})

describe('autogrow', () => {
  beforeEach(() => {
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
      this: HTMLTextAreaElement
    ) {
      return 20 * (this.value.split('\n').length || 1)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('takes its height from the content, and gives it back when cleared', () => {
    const { field } = render()

    expect(field.style.height).toBe('20px')
    type(field, 'a\nb\nc')
    expect(field.style.height).toBe('60px')
    type(field, 'a\nb\nc\nd\ne\nf\ng\nh')
    // The component reports the content's height; the clamp is the stylesheet's.
    expect(field.style.height).toBe('160px')
    press(field, {})
    expect(field.style.height).toBe('20px')
  })
})

describe('focusOnMount', () => {
  function mountComposer(focusOnMount?: boolean): HTMLTextAreaElement {
    mounted = mount(
      createElement(Composer, { agentName: 'John', ...(focusOnMount === undefined ? {} : { focusOnMount }) })
    )
    return mounted.container.querySelector('textarea') as HTMLTextAreaElement
  }

  it('takes focus when it appears if asked to', () => {
    const field = mountComposer(true)

    expect(document.activeElement).toBe(field)
  })

  it('never takes focus otherwise: a composer that appears by default or by a tile leaves it where it was', () => {
    const before = document.createElement('button')
    document.body.append(before)
    before.focus()
    try {
      mountComposer()
      expect(document.activeElement).toBe(before)
      mounted?.unmount()
      mountComposer(false)
      expect(document.activeElement).toBe(before)
    } finally {
      before.remove()
    }
  })
})

describe('refocus', () => {
  it('takes focus when the number moves to a positive one, mounted already, and again for the next', () => {
    const before = document.createElement('button')
    const host = document.createElement('div')
    document.body.append(before, host)
    const root = createRoot(host)
    const show = (refocus: number): void =>
      act(() => root.render(createElement(Composer, { agentName: 'John', refocus })))
    try {
      show(0)
      const field = host.querySelector('textarea') as HTMLTextAreaElement
      before.focus()
      expect(document.activeElement).toBe(before)

      show(1)
      expect(document.activeElement).toBe(field)

      before.focus()
      show(1)
      expect(document.activeElement).toBe(before)

      show(2)
      expect(document.activeElement).toBe(field)
    } finally {
      act(() => root.unmount())
      before.remove()
      host.remove()
    }
  })
})

describe('returned (Story 4.8)', () => {
  function show(root: ReturnType<typeof createRoot>, returned?: { key: number; text: string }): void {
    act(() => root.render(createElement(Composer, { agentName: 'the room', returned })))
  }
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })
  const field = (): HTMLTextAreaElement => host.querySelector('textarea') as HTMLTextAreaElement

  it('puts the words in an empty field once for a new key, and sends nothing', () => {
    const onSend = vi.fn()
    act(() => root.render(createElement(Composer, { agentName: 'the room', onSend })))
    expect(field().value).toBe('')
    act(() => root.render(createElement(Composer, { agentName: 'the room', onSend, returned: { key: 3, text: 'x' } })))

    expect(field().value).toBe('x')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not take the words it holds on mount', () => {
    show(root, { key: 3, text: 'old' })

    expect(field().value).toBe('')
  })

  it('leaves a draft alone, and does not take the refused words later when the field has emptied', () => {
    show(root)
    type(field(), 'my draft')
    show(root, { key: 4, text: 'x' })
    expect(field().value).toBe('my draft')

    type(field(), '')
    show(root, { key: 4, text: 'x' })
    expect(field().value).toBe('')
  })

  it('takes the next key after the first was taken and sent', () => {
    show(root)
    show(root, { key: 1, text: 'one' })
    type(field(), '')
    show(root, { key: 2, text: 'two' })

    expect(field().value).toBe('two')
  })

  it('does not take the words again when the same key renders again', () => {
    show(root)
    show(root, { key: 1, text: 'one' })
    type(field(), '')
    show(root, { key: 1, text: 'one' })

    expect(field().value).toBe('')
  })
})

describe('fieldRef (Story 5.3)', () => {
  it('holds the field while the composer is mounted, and lets go of it when it goes', () => {
    const fieldRef = createRef<HTMLTextAreaElement>()
    mounted = mount(createElement(Composer, { agentName: 'John', fieldRef }))

    expect(fieldRef.current).toBe(mounted.container.querySelector('textarea'))

    mounted.unmount()
    expect(fieldRef.current).toBeNull()
  })

  it('changes nothing for a composer given none', () => {
    const { field } = render()

    type(field, 'hello')
    press(field, {})

    expect(sent).toEqual(['hello'])
    expect(document.activeElement).toBe(field)
  })
})

describe('a send that can be refused (Story 7.5)', () => {
  const settled = async (): Promise<void> => void (await act(async () => void (await Promise.resolve())))

  function mountWith(onSend: (text: string) => void | Promise<boolean>, extra: Record<string, unknown> = {}): HTMLTextAreaElement {
    mounted = mount(createElement(Composer, { agentName: 'John', onSend, ...extra }))
    return mounted.container.querySelector('textarea') as HTMLTextAreaElement
  }

  it('keeps the text when the handler answers that it was refused, and clears it when it was taken', async () => {
    const answers = [false, true]
    const field = mountWith(() => Promise.resolve(answers.shift() as boolean))

    type(field, 'hello there')
    press(field, {})
    await settled()
    expect(field.value).toBe('hello there')

    press(field, {})
    await settled()
    expect(field.value).toBe('')
  })

  it('holds a second send until the first is answered, so one message is not sent twice', async () => {
    let calls = 0
    let answer: (took: boolean) => void = () => {}
    const field = mountWith(() => {
      calls += 1
      return new Promise<boolean>((resolve) => void (answer = resolve))
    })

    type(field, 'once')
    press(field, {})
    press(field, {})
    expect(calls).toBe(1)
    answer(true)
    await settled()
    expect(field.value).toBe('')
  })

  it('keeps the text and holds no later send when the handler fails: a failure is a send that was not taken', async () => {
    let calls = 0
    const field = mountWith(() => {
      calls += 1
      return calls === 1 ? Promise.reject(new Error('refused')) : Promise.resolve(true)
    })

    type(field, 'try me')
    press(field, {})
    await settled()
    await settled()
    expect(field.value).toBe('try me')

    press(field, {})
    await settled()
    expect(calls).toBe(2)
    expect(field.value).toBe('')
  })

  it('clears at once for a handler that answers nothing, as it always did', () => {
    const field = mountWith(() => {})

    type(field, 'plain')
    press(field, {})

    expect(field.value).toBe('')
  })

  it('has no placeholder and is named `message` when it is for nobody in particular, and is named for the persona otherwise', () => {
    const nobody = mountWith(() => {}, { agentName: undefined })
    expect(nobody.hasAttribute('placeholder')).toBe(false)
    expect(nobody.getAttribute('aria-label')).toBe('message')
    mounted?.unmount()

    const john = mountWith(() => {})
    expect(john.getAttribute('placeholder')).toBe('message John')
    expect(john.getAttribute('aria-label')).toBe('Message John')
  })

  it('starts from the draft it is given and tells every change of it, so a surface that keeps one can', () => {
    const told: string[] = []
    const onTextChange = (text: string): void => void told.push(text)
    const field = mountWith(() => {}, { initialText: 'half', onTextChange })

    expect(field.value).toBe('half')
    type(field, 'half a')
    expect(told).toEqual(['half', 'half a'])
  })
})
