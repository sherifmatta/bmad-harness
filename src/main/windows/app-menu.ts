import { app, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { isDocWindow } from './doc-window'
import { isWelcomeWindow } from './welcome-window'

/**
 * The application menu, ours rather than Electron's default.
 *
 * With no menu set, Electron installs a default one that gives every window
 * reload (⌘R), force reload, zoom and DevTools. The document window's promise
 * is that it is read-only and cannot be refreshed, and that is only true if the
 * menu is ours. So the template is built here, from roles alone: a role carries
 * its own platform label and its own default key, so nothing below spells an
 * accelerator and no item can be a save, a find or a help link. *Copy* and
 * *Select All* stay because reading is the product.
 *
 * *View* gives zoom to every window, because reading at a size you can see is
 * not optional, and *Reload* to the project window only. A menu is static once
 * built, so the one that is current is rebuilt for whichever window kind has
 * focus: the document window's menu has no reload entry at all, rather than a
 * disabled one.
 *
 * The Welcome has its own menu, because it has its own job: *File ▸ Open Project
 * Folder…* with `⌘O` is the one accelerator the product spells, and it exists
 * only while the Welcome has focus, so no project window's or document
 * window's menu changes. Its View is the zooms alone: the Welcome is not
 * reloaded.
 *
 * Toggle Developer Tools is the developer's, and only in an unpackaged build.
 */

/** Which kind of window the menu is being built for. */
export type MenuFocus = 'project' | 'document' | 'welcome'

/** The template for a build. Pure, so a test can read every role in it. */
export function buildMenuTemplate({
  packaged,
  focus,
  openProjectFolder
}: {
  packaged: boolean
  focus: MenuFocus
  /** What *Open Project Folder…* does; only the Welcome's menu carries it. */
  openProjectFolder?: () => void
}): MenuItemConstructorOptions[] {
  const view: MenuItemConstructorOptions[] = []
  if (focus === 'project') {
    view.push({ role: 'reload' }, { type: 'separator' })
  }
  view.push({ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' })

  const window: MenuItemConstructorOptions[] = [{ role: 'minimize' }, { role: 'close' }]
  if (!packaged) {
    window.push({ type: 'separator' }, { role: 'toggleDevTools' })
  }

  const menus: MenuItemConstructorOptions[] = [
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
    { label: 'View', submenu: view },
    { label: 'Window', submenu: window }
  ]
  if (focus === 'welcome') {
    menus.splice(1, 0, {
      label: 'File',
      submenu: [
        {
          label: 'Open Project Folder…',
          accelerator: 'CmdOrCtrl+O',
          click: () => openProjectFolder?.()
        }
      ]
    })
  }
  return menus
}

/**
 * Install it at startup, and rebuild it whenever a window of the other kind
 * gains focus. Before any window exists the project's menu is the one shown.
 */
export function installApplicationMenu(
  packaged: boolean,
  openProjectFolder?: () => void
): void {
  let installed: MenuFocus | null = null

  const install = (focus: MenuFocus): void => {
    if (focus === installed) {
      return
    }
    installed = focus
    Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate({ packaged, focus, openProjectFolder })))
  }

  install('project')
  app.on('browser-window-focus', (_event, window) => {
    install(
      isWelcomeWindow(window.webContents)
        ? 'welcome'
        : isDocWindow(window.webContents)
          ? 'document'
          : 'project'
    )
  })
}
