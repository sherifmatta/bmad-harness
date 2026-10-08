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
 * A project window's menu has a *File* of its own (Story 5.4): *Output Folder…*,
 * which opens the same native chooser as the Outputs head's `change…`, and *Use
 * BMad's Output Folder*, which forgets the project's choice and is dimmed while
 * there is none, then the OS's own Close Window. Neither item has an accelerator,
 * and the Welcome's and the document window's menus have neither. The project
 * the items act on is the focused window's, so the menu is rebuilt when focus
 * moves between project windows and whenever a window's folder changes.
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

/**
 * What the project menu's File needs of main's output folders, by window: whether
 * a window has one to act on yet, whether it has a choice to forget, the two
 * things the items do, and a way to hear that a window's folder has changed so the
 * menu can follow it.
 */
export type OutputFolderMenu = {
  ready(webContentsId: number): boolean
  hasChoice(webContentsId: number): boolean
  choose(webContentsId: number): void
  forget(webContentsId: number): void
  onChanged(listener: (webContentsId: number) => void): void
}

/** What a project window's File menu shows and does for the focused window. */
export type ProjectFolderItems = {
  /** Whether the window has an output folder to act on. */
  enabled: boolean
  /** Whether it has a choice to forget. */
  hasChoice: boolean
  choose: () => void
  forget: () => void
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
  theme = { choice: 'system', choose: () => {} },
  outputFolder = { enabled: false, hasChoice: false, choose: () => {}, forget: () => {} }
}: {
  packaged: boolean
  focus: MenuFocus
  /** What *Open Project Folder…* does; only the Welcome's menu carries it. */
  openProjectFolder?: () => void
  /** The choice in force and what choosing another does; *System* and nothing when not given. */
  theme?: { choice: ThemeChoice; choose: (choice: ThemeChoice) => void }
  /** What the project window's File does; nothing is enabled when not given. */
  outputFolder?: ProjectFolderItems
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
  if (focus === 'project') {
    menus.splice(1, 0, {
      label: 'File',
      submenu: [
        { label: 'Output Folder…', enabled: outputFolder.enabled, click: () => outputFolder.choose() },
        {
          label: "Use BMad's Output Folder",
          enabled: outputFolder.enabled && outputFolder.hasChoice,
          click: () => outputFolder.forget()
        },
        { type: 'separator' },
        { role: 'close' }
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
  theme?: ThemeMenu,
  outputFolders?: OutputFolderMenu
): void {
  let installed: MenuFocus | null = null
  /** The project window with focus, whose output folder File acts on. */
  let focused: number | undefined

  const folderItems = (): ProjectFolderItems | undefined =>
    outputFolders === undefined || focused === undefined
      ? undefined
      : {
          enabled: outputFolders.ready(focused),
          hasChoice: outputFolders.hasChoice(focused),
          choose: () => focused !== undefined && outputFolders.choose(focused),
          forget: () => focused !== undefined && outputFolders.forget(focused)
        }

  const build = (focus: MenuFocus): void => {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        buildMenuTemplate({
          packaged,
          focus,
          openProjectFolder,
          theme: theme === undefined ? undefined : { choice: theme.choice(), choose: theme.choose },
          outputFolder: focus === 'project' ? folderItems() : undefined
        })
      )
    )
  }

  const install = (focus: MenuFocus, windowId?: number): void => {
    // Between project windows the menu is rebuilt only when there are folders to follow.
    const movedProject =
      focus === 'project' && outputFolders !== undefined && windowId !== undefined && windowId !== focused
    if (focus === 'project') {
      focused = windowId
    }
    if (focus === installed && !movedProject) {
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
  // A window's folder moved, or its rail asked: File follows it, for the window it acts on.
  outputFolders?.onChanged((webContentsId) => {
    if (installed === 'project' && webContentsId === focused) {
      build('project')
    }
  })
  app.on('browser-window-focus', (_event, window) => {
    const { webContents } = window
    install(
      isWelcomeWindow(webContents) ? 'welcome' : isDocWindow(webContents) ? 'document' : 'project',
      webContents.id
    )
  })
}
