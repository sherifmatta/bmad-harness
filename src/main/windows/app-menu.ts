import { app, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import type { ThemeChoice } from '../../shared/theme'
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
 * *View ▸ Theme* is in the menu of every kind of window: three radio items,
 * *System*, *Light* and *Dark*, with the check on the current choice and no
 * accelerator. The choice is main's, so the menu is handed it and what choosing
 * does, and is rebuilt (for the window kind in force) whenever a choice is made,
 * wherever it was made.
 *
 * Toggle Developer Tools is the developer's, and only in an unpackaged build.
 */

/** Which kind of window the menu is being built for. */
export type MenuFocus = 'project' | 'document' | 'welcome'

/** What the theme submenu needs of main's choice: the one in force, and how to make another. */
export type ThemeMenu = {
  choice(): ThemeChoice
  choose(choice: ThemeChoice): void
  /** Hear each choice made, so the menu's check can follow it. */
  onChosen(listener: (choice: ThemeChoice) => void): void
}

/** The three radio items, in the order the choice lists them. Labels are the OS's register. */
const THEME_ITEMS: readonly { choice: ThemeChoice; label: string }[] = [
  { choice: 'system', label: 'System' },
  { choice: 'light', label: 'Light' },
  { choice: 'dark', label: 'Dark' }
]

/** The template for a build. Pure, so a test can read every role in it. */
export function buildMenuTemplate({
  packaged,
  focus,
  openProjectFolder,
  theme = { choice: 'system', choose: () => {} }
}: {
  packaged: boolean
  focus: MenuFocus
  /** What *Open Project Folder…* does; only the Welcome's menu carries it. */
  openProjectFolder?: () => void
  /** The choice in force and what choosing another does; *System* and nothing when not given. */
  theme?: { choice: ThemeChoice; choose: (choice: ThemeChoice) => void }
}): MenuItemConstructorOptions[] {
  const view: MenuItemConstructorOptions[] = []
  if (focus === 'project') {
    view.push({ role: 'reload' }, { type: 'separator' })
  }
  view.push({ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' })
  view.push(
    { type: 'separator' },
    {
      label: 'Theme',
      submenu: THEME_ITEMS.map(({ choice, label }) => ({
        label,
        type: 'radio' as const,
        checked: theme.choice === choice,
        click: () => theme.choose(choice)
      }))
    }
  )

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
  openProjectFolder?: () => void,
  theme?: ThemeMenu
): void {
  let installed: MenuFocus | null = null

  const build = (focus: MenuFocus): void => {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        buildMenuTemplate({
          packaged,
          focus,
          openProjectFolder,
          theme: theme === undefined ? undefined : { choice: theme.choice(), choose: theme.choose }
        })
      )
    )
  }

  const install = (focus: MenuFocus): void => {
    if (focus === installed) {
      return
    }
    installed = focus
    build(focus)
  }

  install('project')
  // A choice rebuilds the menu that is installed, so its check follows.
  theme?.onChosen(() => {
    if (installed !== null) {
      build(installed)
    }
  })
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
