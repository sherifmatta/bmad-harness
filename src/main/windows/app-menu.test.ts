import { beforeEach, describe, expect, it, vi } from 'vitest'

const setApplicationMenu = vi.fn()
const buildFromTemplate = vi.fn((template: unknown) => ({ template }))
const focusHandlers: ((event: unknown, window: { webContents: { id: number } }) => void)[] = []
const isDocWindow = vi.fn<(webContents: { id: number }) => boolean>(() => false)
const isWelcomeWindow = vi.fn<(webContents: { id: number }) => boolean>(() => false)

vi.mock('electron', () => ({
  Menu: { setApplicationMenu, buildFromTemplate },
  app: {
    on: (event: string, handler: (event: unknown, window: { webContents: { id: number } }) => void) => {
      if (event === 'browser-window-focus') {
        focusHandlers.push(handler)
      }
    }
  }
}))
vi.mock('./doc-window', () => ({ isDocWindow: (webContents: { id: number }) => isDocWindow(webContents) }))
vi.mock('./welcome-window', () => ({
  isWelcomeWindow: (webContents: { id: number }) => isWelcomeWindow(webContents)
}))

const { buildMenuTemplate, installApplicationMenu } = await import('./app-menu')

type Item = { role?: string; label?: string; accelerator?: string; click?: () => void; submenu?: Item[] }
type Focus = 'project' | 'document' | 'welcome'

/** A template as data: a click is a closure made at each build, so builds are compared by shape. */
const shape = (value: unknown): unknown => JSON.parse(JSON.stringify(value))

function items(packaged: boolean, focus: Focus): Item[] {
  return (buildMenuTemplate({ packaged, focus }) as Item[]).flatMap((menu) => [menu, ...(menu.submenu ?? [])])
}

function roles(packaged: boolean, focus: Focus): string[] {
  return items(packaged, focus).flatMap(({ role }) => (role === undefined ? [] : [role]))
}

function viewRoles(focus: Focus): string[] {
  const view = (buildMenuTemplate({ packaged: true, focus }) as Item[]).find(({ label }) => label === 'View')
  return (view?.submenu ?? []).flatMap(({ role }) => (role === undefined ? [] : [role]))
}

beforeEach(() => {
  setApplicationMenu.mockClear()
  buildFromTemplate.mockClear()
  isDocWindow.mockReset()
  isDocWindow.mockReturnValue(false)
  isWelcomeWindow.mockReset()
  isWelcomeWindow.mockReturnValue(false)
  focusHandlers.length = 0
})

describe('the application menu', () => {
  it('is app, Edit, View and Window, from roles alone', () => {
    const top = (buildMenuTemplate({ packaged: true, focus: 'project' }) as Item[]).map(({ label }) => label)

    expect(top).toEqual(['bmad-harness', 'Edit', 'View', 'Window'])
    expect(roles(true, 'project')).toEqual([
      'hide',
      'hideOthers',
      'unhide',
      'quit',
      'copy',
      'selectAll',
      'reload',
      'zoomIn',
      'zoomOut',
      'resetZoom',
      'minimize',
      'close'
    ])
  })

  it('gives the project window reload and all three zooms, so the room can be reloaded and enlarged', () => {
    expect(viewRoles('project')).toEqual(['reload', 'zoomIn', 'zoomOut', 'resetZoom'])
  })

  it('gives the document window the zooms and no reload entry at all, so it can never be refreshed', () => {
    expect(viewRoles('document')).toEqual(['zoomIn', 'zoomOut', 'resetZoom'])
    expect(roles(true, 'document')).not.toContain('reload')
    expect(roles(false, 'document')).not.toContain('reload')
  })

  it.each([
    [true, 'project'],
    [false, 'project'],
    [true, 'document'],
    [false, 'document']
  ] as const)(
    'has no force reload, find, help, undo, redo, cut, paste, save or spelled accelerator (packaged: %s, focus: %s)',
    (packaged, focus) => {
      for (const item of items(packaged, focus)) {
        expect(item.role ?? '', item.role).not.toMatch(/forceReload|find|help|undo|redo|cut|paste/i)
        expect(item.label ?? '', item.label).not.toMatch(/save|reload|zoom|find|help/i)
        expect(item.accelerator).toBeUndefined()
      }
    }
  )

  it.each(['project', 'document'] as const)('offers Toggle Developer Tools only when not packaged (%s)', (focus) => {
    expect(roles(true, focus)).not.toContain('toggleDevTools')
    expect(roles(false, focus)).toContain('toggleDevTools')
  })
})

describe('the Welcome’s menu', () => {
  const top = (): Item[] => buildMenuTemplate({ packaged: true, focus: 'welcome' }) as Item[]

  it('is app, File, Edit, View and Window, with File first after the app', () => {
    expect(top().map(({ label }) => label)).toEqual(['bmad-harness', 'File', 'Edit', 'View', 'Window'])
  })

  it('has Open Project Folder… with ⌘O in File, and nothing else in File', () => {
    const file = top().find(({ label }) => label === 'File')

    expect(file?.submenu).toEqual([
      { label: 'Open Project Folder…', accelerator: 'CmdOrCtrl+O', click: expect.any(Function) }
    ])
  })

  it('runs what it is given when Open Project Folder… is chosen', () => {
    const openProjectFolder = vi.fn()
    const menus = buildMenuTemplate({ packaged: true, focus: 'welcome', openProjectFolder }) as Item[]

    menus.find(({ label }) => label === 'File')?.submenu?.[0].click?.()

    expect(openProjectFolder).toHaveBeenCalledTimes(1)
  })

  it('gives the zooms and no reload, and the same roles otherwise as the document window’s', () => {
    expect(viewRoles('welcome')).toEqual(['zoomIn', 'zoomOut', 'resetZoom'])
    expect(roles(true, 'welcome')).toEqual(roles(true, 'document'))
  })

  it('is the one menu with an accelerator: the project and document menus are unchanged', () => {
    for (const focus of ['project', 'document'] as const) {
      const labels = (buildMenuTemplate({ packaged: true, focus }) as Item[]).map(({ label }) => label)
      expect(labels, focus).toEqual(['bmad-harness', 'Edit', 'View', 'Window'])
      expect(JSON.stringify(buildMenuTemplate({ packaged: true, focus })), focus).not.toMatch(/accelerator|Open Project/)
    }
  })

  it('offers Toggle Developer Tools only when not packaged', () => {
    expect(roles(true, 'welcome')).not.toContain('toggleDevTools')
    expect(roles(false, 'welcome')).toContain('toggleDevTools')
  })
})

describe('installing the menu', () => {
  it('installs the project menu before any window has focus', () => {
    installApplicationMenu(true)

    expect(setApplicationMenu).toHaveBeenCalledTimes(1)
    expect(shape(setApplicationMenu.mock.lastCall?.[0])).toEqual(
      shape({ template: buildMenuTemplate({ packaged: true, focus: 'project' }) })
    )
  })

  it('rebuilds with no reload when the document window gains focus, and restores it when the project window does', () => {
    installApplicationMenu(true)
    expect(focusHandlers).toHaveLength(1)
    isDocWindow.mockImplementation(({ id }) => id === 2)

    focusHandlers[0]({}, { webContents: { id: 2 } })
    expect(shape(setApplicationMenu.mock.lastCall?.[0])).toEqual(
      shape({ template: buildMenuTemplate({ packaged: true, focus: 'document' }) })
    )

    focusHandlers[0]({}, { webContents: { id: 1 } })
    expect(shape(setApplicationMenu.mock.lastCall?.[0])).toEqual(
      shape({ template: buildMenuTemplate({ packaged: true, focus: 'project' }) })
    )
    expect(setApplicationMenu).toHaveBeenCalledTimes(3)
  })

  it('rebuilds with the Welcome’s menu when the Welcome gains focus, and hands it the action', () => {
    const openProjectFolder = vi.fn()
    installApplicationMenu(true, openProjectFolder)
    isWelcomeWindow.mockImplementation(({ id }) => id === 4)

    focusHandlers[0]({}, { webContents: { id: 4 } })

    // A click is a closure made at each build, so the menu is read rather than compared.
    const template = buildFromTemplate.mock.lastCall?.[0] as Item[]
    expect(template.map(({ label }) => label)).toEqual(['bmad-harness', 'File', 'Edit', 'View', 'Window'])
    template.find(({ label }) => label === 'File')?.submenu?.[0].click?.()
    expect(openProjectFolder).toHaveBeenCalledTimes(1)

    focusHandlers[0]({}, { webContents: { id: 1 } })
    expect(shape(setApplicationMenu.mock.lastCall?.[0])).toEqual(
      shape({ template: buildMenuTemplate({ packaged: true, focus: 'project' }) })
    )
  })

  it('does not rebuild when focus moves between windows of the same kind', () => {
    installApplicationMenu(true)

    focusHandlers[0]({}, { webContents: { id: 1 } })
    focusHandlers[0]({}, { webContents: { id: 3 } })

    expect(setApplicationMenu).toHaveBeenCalledTimes(1)
  })
})

describe('View ▸ Theme', () => {
  const themeMenu = (focus: Focus, choice: 'system' | 'light' | 'dark' = 'system', choose = vi.fn()): Item[] => {
    const view = (buildMenuTemplate({ packaged: true, focus, theme: { choice, choose } }) as Item[]).find(
      ({ label }) => label === 'View'
    )
    return view?.submenu?.find(({ label }) => label === 'Theme')?.submenu ?? []
  }

  it.each(['project', 'document', 'welcome'] as const)(
    'is a submenu of three radio items, System, Light and Dark, in the %s window’s menu',
    (focus) => {
      const items = themeMenu(focus) as (Item & { type?: string })[]

      expect(items.map(({ label, type }) => [label, type])).toEqual([
        ['System', 'radio'],
        ['Light', 'radio'],
        ['Dark', 'radio']
      ])
    }
  )

  it.each(['system', 'light', 'dark'] as const)('puts the check on %s alone when that is the choice', (choice) => {
    const items = themeMenu('project', choice) as (Item & { checked?: boolean })[]

    expect(items.filter(({ checked }) => checked).map(({ label }) => label?.toLowerCase())).toEqual([choice])
  })

  it('carries no accelerator and no role: nothing in the product has a theme shortcut', () => {
    for (const focus of ['project', 'document', 'welcome'] as const) {
      const view = (buildMenuTemplate({ packaged: true, focus }) as Item[]).find(({ label }) => label === 'View')
      const theme = view?.submenu?.find(({ label }) => label === 'Theme')

      expect(JSON.stringify(theme), focus).not.toMatch(/accelerator|role/)
    }
  })

  it('sits after the zooms, behind a separator, and leaves the other items of View as they were', () => {
    const view = (buildMenuTemplate({ packaged: true, focus: 'project' }) as (Item & { type?: string })[]).find(
      ({ label }) => label === 'View'
    )

    expect((view?.submenu as (Item & { type?: string })[]).map((item) => item.role ?? item.type ?? item.label)).toEqual([
      'reload',
      'separator',
      'zoomIn',
      'zoomOut',
      'resetZoom',
      'separator',
      'Theme'
    ])
  })

  it('makes the choice it is handed when an item is chosen', () => {
    const choose = vi.fn()
    const items = themeMenu('welcome', 'system', choose)

    items[1].click?.()
    items[2].click?.()
    items[0].click?.()

    expect(choose.mock.calls).toEqual([['light'], ['dark'], ['system']])
  })

  it('is read from main’s choice when installed, and rebuilt for the window kind in force whenever a choice is made', () => {
    let choice: 'system' | 'light' | 'dark' = 'light'
    const listeners: ((choice: 'system' | 'light' | 'dark') => void)[] = []
    installApplicationMenu(true, undefined, {
      choice: () => choice,
      choose: vi.fn(),
      onChosen: (listener) => listeners.push(listener)
    })
    const checked = (): string[] => {
      const template = buildFromTemplate.mock.lastCall?.[0] as Item[]
      const view = template.find(({ label }) => label === 'View')
      const theme = view?.submenu?.find(({ label }) => label === 'Theme')?.submenu as (Item & { checked?: boolean })[]
      return theme.filter(({ checked }) => checked).map(({ label }) => label ?? '')
    }

    expect(checked()).toEqual(['Light'])
    isDocWindow.mockImplementation(({ id }) => id === 2)
    focusHandlers[0]({}, { webContents: { id: 2 } })
    const builds = buildFromTemplate.mock.calls.length

    choice = 'dark'
    listeners[0](choice)

    // One more build, for the document window's menu (no reload), with the check moved.
    expect(buildFromTemplate.mock.calls.length).toBe(builds + 1)
    expect(checked()).toEqual(['Dark'])
    expect(JSON.stringify(buildFromTemplate.mock.lastCall?.[0])).not.toContain('"reload"')
  })
})
