import { beforeEach, describe, expect, it, vi } from 'vitest'

const setApplicationMenu = vi.fn()
const buildFromTemplate = vi.fn((template: unknown) => ({ template }))
const focusHandlers: ((event: unknown, window: { webContents: { id: number } }) => void)[] = []
const isDocWindow = vi.fn<(webContents: { id: number }) => boolean>(() => false)

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

const { buildMenuTemplate, installApplicationMenu } = await import('./app-menu')

type Item = { role?: string; label?: string; accelerator?: string; submenu?: Item[] }
type Focus = 'project' | 'document'

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

describe('installing the menu', () => {
  it('installs the project menu before any window has focus', () => {
    installApplicationMenu(true)

    expect(setApplicationMenu).toHaveBeenCalledTimes(1)
    expect(setApplicationMenu).toHaveBeenCalledWith({
      template: buildMenuTemplate({ packaged: true, focus: 'project' })
    })
  })

  it('rebuilds with no reload when the document window gains focus, and restores it when the project window does', () => {
    installApplicationMenu(true)
    expect(focusHandlers).toHaveLength(1)
    isDocWindow.mockImplementation(({ id }) => id === 2)

    focusHandlers[0]({}, { webContents: { id: 2 } })
    expect(setApplicationMenu).toHaveBeenLastCalledWith({
      template: buildMenuTemplate({ packaged: true, focus: 'document' })
    })

    focusHandlers[0]({}, { webContents: { id: 1 } })
    expect(setApplicationMenu).toHaveBeenLastCalledWith({
      template: buildMenuTemplate({ packaged: true, focus: 'project' })
    })
    expect(setApplicationMenu).toHaveBeenCalledTimes(3)
  })

  it('does not rebuild when focus moves between windows of the same kind', () => {
    installApplicationMenu(true)

    focusHandlers[0]({}, { webContents: { id: 1 } })
    focusHandlers[0]({}, { webContents: { id: 3 } })

    expect(setApplicationMenu).toHaveBeenCalledTimes(1)
  })
})
