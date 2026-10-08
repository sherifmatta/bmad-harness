import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent, JSX, Ref } from 'react'

import './welcome.css'
import type { RecentRow } from '../../../shared/welcome'
import { Announcer } from '../a11y/announcer'
import { LiveRegion } from '../a11y/live-region'
import { notFolderLine, refusedName } from './drop'
import { Lanes } from './lanes'
import { RecentList } from './recent-list'

/** The folder glyph, drawn the way the rail row's file icon is: one inline stroked path. */
function FolderGlyph(): JSX.Element {
  return (
    <svg className="welcome-open-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.4 1.6H13c.7 0 1.2.5 1.2 1.2v6.2c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2z" />
    </svg>
  )
}

/**
 * The Welcome's page, drawn: the topbar, the head, the one action beside its
 * drop zone, the recent rows and the team. Everything it needs is an argument,
 * so every state of it is a thing a test can render; `WelcomeApp` is what
 * connects it to the bridge.
 *
 * The drop hint and the line that refuses a drop are one place: `notice`
 * stands where `drop a project folder here` does, and nothing else on the page
 * says a drop went wrong. The page tells the user nothing about what to do next.
 */
export function WelcomeView({
  rows,
  now,
  notice,
  dragging,
  openRef,
  onChoose,
  onOpenRecent,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  announcer
}: {
  rows: readonly RecentRow[]
  now: number
  notice: string | null
  dragging: boolean
  openRef?: Ref<HTMLButtonElement>
  onChoose: () => void
  onOpenRecent: (row: RecentRow) => void
  onDragEnter: (event: DragEvent<HTMLElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  announcer: Announcer
}): JSX.Element {
  return (
    <div
      className="welcome-root"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="welcome-topbar">
        <div className="welcome-brand">
          <span className="welcome-brand-mark" aria-hidden="true" />
          <span className="welcome-brand-name">BMad Harness</span>
        </div>
        <span className="welcome-topbar-sep" aria-hidden="true">
          │
        </span>
        <span className="welcome-topbar-state">no project open</span>
      </header>
      <main className="welcome-stage">
        <div className="welcome-column">
          <div className="welcome-head">
            <span className="welcome-mark" aria-hidden="true" />
            <div>
              <h1 className="welcome-title">BMad Harness</h1>
              <p className="welcome-tagline">a visual harness for bmad projects</p>
            </div>
          </div>
          <div className={dragging ? 'welcome-drop welcome-drop--over' : 'welcome-drop'}>
            <span className="welcome-drop-hint">{notice ?? 'drop a project folder here'}</span>
            <button type="button" className="welcome-open" ref={openRef} onClick={onChoose}>
              <FolderGlyph />
              open project folder…
              <span className="welcome-open-chord">⌘O</span>
            </button>
          </div>
          <RecentList rows={rows} now={now} onOpen={onOpenRecent} />
        </div>
        <Lanes />
      </main>
      <LiveRegion announcer={announcer} />
    </div>
  )
}

/** Whether a drag carries files: a dragged selection of text is not a drop this page takes. */
function carriesFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

/**
 * The page's root: it connects to the bridge, takes focus on the open button,
 * asks for the recent rows once, and owns the window's one announcer.
 *
 * It never touches the filesystem and never reads a path: a dropped file goes to
 * the preload as a `File`, and main says whether it was a folder. A refused drop
 * is said once in the drop hint's place and announced once; the next drop or
 * choice clears it. Opening a project closes this window, so a success has
 * nothing to show.
 */
export function WelcomeApp(): JSX.Element {
  const available =
    typeof window.welcome?.getRecent === 'function' &&
    typeof window.welcome?.chooseFolder === 'function' &&
    typeof window.welcome?.openRecent === 'function' &&
    typeof window.welcome?.openDropped === 'function'

  const [rows, setRows] = useState<RecentRow[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [announcer] = useState(() => new Announcer())
  const openButton = useRef<HTMLButtonElement>(null)

  // A list that cannot be had is no list: the section is not rendered, and
  // nothing is surfaced as an error.
  const refresh = useCallback(() => {
    window.welcome.getRecent().then(
      (fetched) => {
        setRows(fetched)
        setNow(Date.now())
      },
      () => setRows([])
    )
  }, [])

  useEffect(() => {
    openButton.current?.focus()
    if (available) {
      refresh()
    }
  }, [available, refresh])

  // A preload that failed to load leaves no bridge at all.
  if (!available) {
    return <p className="welcome-unavailable">bridge/unavailable · the preload did not load</p>
  }

  function choose(): void {
    setNotice(null)
    // A cancelled chooser leaves the page as it was, with the focus on the button.
    const back = (): void => openButton.current?.focus()
    window.welcome.chooseFolder().then((ack) => (ack.ok ? undefined : back()), back)
  }

  function openRecent(row: RecentRow): void {
    setNotice(null)
    // A folder that went missing since the list was drawn is drawn missing.
    window.welcome.openRecent(row.path).then((ack) => (ack.ok ? undefined : refresh()), refresh)
  }

  function onDragOver(event: DragEvent<HTMLElement>): void {
    // The default is to navigate to what was dropped.
    event.preventDefault()
    if (carriesFiles(event)) {
      event.dataTransfer.dropEffect = 'copy'
      setDragging(true)
    }
  }

  function onDragLeave(event: DragEvent<HTMLElement>): void {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragging(false)
    }
  }

  function onDrop(event: DragEvent<HTMLElement>): void {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length === 0) {
      return
    }
    setNotice(null)
    window.welcome.openDropped(files).then(
      (ack) => {
        if (ack.ok) {
          return
        }
        const name = refusedName(ack.name, files)
        if (name !== null) {
          const line = notFolderLine(name)
          setNotice(line)
          announcer.announce(line, performance.now())
        }
      },
      () => {}
    )
  }

  return (
    <WelcomeView
      rows={rows}
      now={now}
      notice={notice}
      dragging={dragging}
      openRef={openButton}
      onChoose={choose}
      onOpenRecent={openRecent}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      announcer={announcer}
    />
  )
}
