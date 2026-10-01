import { Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

/**
 * The application menu, ours rather than Electron's default.
 *
 * With no menu set, Electron installs a default one that gives every window
 * reload (⌘R), force reload, zoom and DevTools. The document window's promise
 * is that it is read-only and cannot be refreshed, and that is only true if the
 * menu is ours. So the template is built here, from roles alone: a role carries
 * its own platform label and its own default key, so nothing below spells an
 * accelerator and no item can be a reload, a save, a zoom, a find or a help
 * link. *Copy* and *Select All* stay because reading is the product.
 *
 * Toggle Developer Tools is the developer's, and only in an unpackaged build.
 */

/** The template for a build. Pure, so a test can read every role in it. */
export function buildMenuTemplate({ packaged }: { packaged: boolean }): MenuItemConstructorOptions[] {
  const window: MenuItemConstructorOptions[] = [{ role: 'minimize' }, { role: 'close' }]
  if (!packaged) {
    window.push({ type: 'separator' }, { role: 'toggleDevTools' })
  }

  return [
    {
      label: 'bmad-harness',
      submenu: [
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { label: 'Edit', submenu: [{ role: 'copy' }, { role: 'selectAll' }] },
    { label: 'Window', submenu: window }
  ]
}

/** Install it, once, at startup. */
export function installApplicationMenu(packaged: boolean): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate({ packaged })))
}
