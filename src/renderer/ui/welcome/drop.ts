/**
 * What the Welcome does with a drop, as pure rules over plain values.
 *
 * The page never reads a dropped file's path and never touches the filesystem:
 * it hands the files to the preload, whose file-path lookup is the only thing
 * that may ask, and main decides whether the one thing dropped is a folder. All
 * that is left here is the line a refusal is said in, and which name it names.
 */

/** The line a refused drop is said in, in the place the drop hint is. */
export function notFolderLine(name: string): string {
  return `not a folder · ${name}`
}

/**
 * The name a refusal names: the one main gave when it checked, else the first
 * dropped item's own, else nothing (a drop that carried no file at all).
 */
export function refusedName(answered: string | undefined, files: readonly { name: string }[]): string | null {
  if (answered !== undefined && answered !== '') {
    return answered
  }
  const first = files[0]?.name
  return first === undefined || first === '' ? null : first
}
