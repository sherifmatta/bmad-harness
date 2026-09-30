import { beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: { sender: { id: number } }) => Promise<unknown>

const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) }
}))

const { PROJECT_BRANCH_CHANNEL, registerProjectBridge } = await import('./project-bridge')

let asked: string[]
let answer: () => Promise<string | null>

beforeEach(() => {
  handlers.clear()
  asked = []
  answer = async () => 'feat/payouts-prd'
  registerProjectBridge({
    projectPathFor: (id) => (id < 100 ? `/project-${id}` : undefined),
    readBranch: (root) => {
      asked.push(root)
      return answer()
    }
  })
})

const ask = (id: number) => handlers.get(PROJECT_BRANCH_CHANNEL)?.({ sender: { id } })

describe('project:branch', () => {
  it('registers on its own channel and reads nothing at registration', () => {
    expect(PROJECT_BRANCH_CHANNEL).toBe('project:branch')
    expect(handlers.has(PROJECT_BRANCH_CHANNEL)).toBe(true)
    expect(asked).toEqual([])
  })

  it('answers a window with the branch of its own project', async () => {
    await expect(ask(3)).resolves.toBe('feat/payouts-prd')
    expect(asked).toEqual(['/project-3'])
  })

  it('answers null for a window it does not know, and reads nothing', async () => {
    await expect(ask(500)).resolves.toBeNull()
    expect(asked).toEqual([])
  })

  it('answers null when the source has no answer', async () => {
    answer = async () => null

    await expect(ask(1)).resolves.toBeNull()
  })

  it('never throws to the renderer, and the reply carries no path', async () => {
    answer = async () => {
      throw new Error('EACCES /secret/path')
    }

    const reply = await ask(1)

    expect(reply).toBeNull()
    expect(JSON.stringify(reply)).not.toContain('/')
  })
})
