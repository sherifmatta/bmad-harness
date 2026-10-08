import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  themeSource: 'system',
  shouldUseDarkColors: true,
  on: vi.fn<(event: string, listener: () => void) => void>()
}))
vi.mock('electron', () => ({ nativeTheme: native }))

const { appliedNativeTheme, onNativeThemeUpdated, setNativeTheme } = await import('./native-theme')

beforeEach(() => {
  native.themeSource = 'system'
  native.shouldUseDarkColors = true
  native.on.mockClear()
})

describe('native chrome', () => {
  it.each(['system', 'light', 'dark'] as const)('follows the choice by taking its word as the theme source: %s', (choice) => {
    setNativeTheme(choice)

    expect(native.themeSource).toBe(choice)
  })

  it('resolves to what the OS reports it is painting in, which System makes the OS appearance', () => {
    native.shouldUseDarkColors = true
    expect(appliedNativeTheme()).toBe('dark')

    native.shouldUseDarkColors = false
    expect(appliedNativeTheme()).toBe('light')
  })

  it('hears the OS appearance change on the one `updated` event', () => {
    const listener = vi.fn()

    onNativeThemeUpdated(listener)

    expect(native.on).toHaveBeenCalledWith('updated', listener)
  })
})
