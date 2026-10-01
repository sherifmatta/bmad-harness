import { describe, expect, it, vi } from 'vitest'

const setApplicationMenu = vi.fn()
const buildFromTemplate = vi.fn((template: unknown) => ({ template }))

vi.mock('electron', () => ({ Menu: { setApplicationMenu, buildFromTemplate } }))

const { buildMenuTemplate, installApplicationMenu } = await import('./app-menu')

type Item = { role?: string; label?: string; accelerator?: string; submenu?: Item[] }

function items(packaged: boolean): Item[] {
  return (buildMenuTemplate({ packaged }) as Item[]).flatMap((menu) => [menu, ...(menu.submenu ?? [])])
}

function roles(packaged: boolean): string[] {
  return items(packaged).flatMap(({ role }) => (role === undefined ? [] : [role]))
}

describe('the application menu', () => {
  it('is app, Edit and Window, from roles alone', () => {
    const top = (buildMenuTemplate({ packaged: true }) as Item[]).map(({ label }) => label)

    expect(top).toEqual(['bmad-harness', 'Edit', 'Window'])
    expect(roles(true)).toEqual([
      'hide',
      'hideOthers',
      'unhide',
      'quit',
      'copy',
      'selectAll',
      'minimize',
      'close'
    ])
  })

  it.each([true, false])('has no reload, zoom, save or accelerator (packaged: %s)', (packaged) => {
    for (const item of items(packaged)) {
      expect(item.role ?? '', item.role).not.toMatch(/reload|forceReload|zoom|find|help|undo|redo|cut|paste/i)
      expect(item.label ?? '', item.label).not.toMatch(/save|reload|zoom|find|help/i)
      expect(item.accelerator).toBeUndefined()
    }
  })

  it('offers Toggle Developer Tools only when not packaged', () => {
    expect(roles(true)).not.toContain('toggleDevTools')
    expect(roles(false)).toContain('toggleDevTools')
  })

  it('installs the built template as the application menu', () => {
    installApplicationMenu(true)

    expect(setApplicationMenu).toHaveBeenCalledTimes(1)
    expect(setApplicationMenu).toHaveBeenCalledWith({ template: buildMenuTemplate({ packaged: true }) })
  })
})
