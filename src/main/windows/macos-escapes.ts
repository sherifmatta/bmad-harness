import { execFile } from 'node:child_process'
import { shell } from 'electron'

/**
 * The document window's two ways out of the window and into the OS (FR57):
 * *Reveal in Finder* and *Open in editor*. They act on main's own record of
 * the file a window is showing — never on a path the renderer supplied — and a
 * `refused` document (one that resolved outside the output folder) gets neither.
 *
 * *Open in editor* is `open -t`, the default **text** editor, and never
 * Electron's open-path call: that hands the file to LaunchServices, which would run a
 * `.command`, a script or an app bundle found under the output folder. `execFile` takes
 * an argument vector, so the path is never parsed by a shell.
 *
 * A failure is one line to the developer's terminal and nothing else; it is
 * never thrown toward the renderer.
 */

export type EscapeTarget = { fullPath: string; refused: boolean }

export type EscapeDeps = {
  showItemInFolder?: (fullPath: string) => void
  execFile?: (file: string, args: string[], callback: (error: Error | null) => void) => void
  writeDiagnostic?: (line: string) => void
}

const writeToStderr = (line: string): void => void process.stderr.write(`${line}\n`)

/** The command and arguments for *Open in editor*. Exported so a test can pin them. */
export function openInEditorCommand(fullPath: string): { file: string; args: string[] } {
  return { file: 'open', args: ['-t', fullPath] }
}

/** Show the file in Finder. Returns whether it was attempted. */
export function revealInFinder(target: EscapeTarget, deps: EscapeDeps = {}): boolean {
  if (target.refused) {
    return false
  }
  const show = deps.showItemInFolder ?? ((fullPath: string) => shell.showItemInFolder(fullPath))
  const writeDiagnostic = deps.writeDiagnostic ?? writeToStderr
  try {
    show(target.fullPath)
  } catch (error) {
    writeDiagnostic(`doc/reveal · ${error instanceof Error ? error.message : String(error)}`)
  }
  return true
}

/** Open the file in the default text editor. Returns whether it was attempted. */
export function openInEditor(target: EscapeTarget, deps: EscapeDeps = {}): boolean {
  if (target.refused) {
    return false
  }
  const run = deps.execFile ?? ((file, args, callback) => void execFile(file, args, callback))
  const writeDiagnostic = deps.writeDiagnostic ?? writeToStderr
  const { file, args } = openInEditorCommand(target.fullPath)
  try {
    run(file, args, (error) => {
      if (error !== null) {
        writeDiagnostic(`doc/open-in-editor · ${error.message}`)
      }
    })
  } catch (error) {
    writeDiagnostic(`doc/open-in-editor · ${error instanceof Error ? error.message : String(error)}`)
  }
  return true
}
