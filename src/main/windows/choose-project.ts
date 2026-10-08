import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { dialog } from 'electron'

/**
 * A project path was supplied on the command line but does not name an existing
 * directory. Named startup failure — never a silent fallback to the Welcome.
 */
export class ProjectPathError extends Error {
  readonly code = 'startup/project-path-not-a-directory'
  readonly givenPath: string

  constructor(givenPath: string) {
    super(`not a directory · ${givenPath}`)
    this.name = 'ProjectPathError'
    this.givenPath = givenPath
  }
}

/**
 * The first positional argument, if one was supplied.
 *
 * `npm run dev -- <path>` reaches here as `electron . <path>`: the `dev` script
 * ends in `--` so that electron-vite treats the path as an argument to forward
 * rather than as the Vite root. A packaged run is `<app> <path>`, from
 * `open -a <app> --args <path>`.
 *
 * The dev entry placeholder is dropped by *position* - it is always argv[1] -
 * rather than by value, so `npm run dev -- .` opens the current directory
 * instead of silently falling through to the Welcome.
 *
 * Switches are not project paths: Electron appends its own
 * (`--remote-debugging-port`, and macOS `-psn_...` when launched from Finder).
 * A directory whose name begins with `-` is spelled `./-name`.
 */
export function projectPathArgument(argv: readonly string[], isPackaged: boolean): string | null {
  const positional = (isPackaged ? argv.slice(1) : argv.slice(2)).filter(
    (argument) => !argument.startsWith('-')
  )
  return positional.length > 0 ? positional[0] : null
}

/**
 * Absolute path for a supplied argument, or `ProjectPathError` if it does not
 * name a reachable directory.
 *
 * The empty string is rejected rather than resolved: `resolve('')` is the
 * harness's own working directory, so `npm run dev -- ""` would otherwise open
 * a project nobody asked for. A filesystem failure (EACCES on a directory the
 * user cannot stat, a broken symlink) is wrapped too - a raw errno escaping
 * here would reach the user as a stack trace instead of a named startup error.
 */
export function directoryFromArgument(argument: string): string {
  if (argument.length === 0) {
    throw new ProjectPathError(argument)
  }

  const absolute = resolve(argument)
  let isDirectory: boolean
  try {
    isDirectory = statSync(absolute).isDirectory()
  } catch {
    throw new ProjectPathError(argument)
  }

  if (!isDirectory) {
    throw new ProjectPathError(argument)
  }
  return absolute
}

/** The native macOS folder chooser. `null` means the user cancelled. */
export async function chooseProjectDirectory(): Promise<string | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'open a bmad project',
    buttonLabel: 'open',
    properties: ['openDirectory', 'createDirectory']
  })
  return canceled || filePaths.length === 0 ? null : filePaths[0]
}

/**
 * The project the command line names, if it names one: `null` is none, and the
 * Welcome is what opens. There is no chooser fallback here any more: choosing a
 * project is the Welcome's, and a native dialog never opens before a window.
 *
 * @throws ProjectPathError when the supplied argument is not a directory.
 */
export function resolveProjectPath(options: {
  argv: readonly string[]
  isPackaged: boolean
}): string | null {
  const argument = projectPathArgument(options.argv, options.isPackaged)
  return argument === null ? null : directoryFromArgument(argument)
}
