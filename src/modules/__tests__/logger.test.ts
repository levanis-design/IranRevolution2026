import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger } from '../logger'

describe('logger', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('delegates error to console.error', () => {
    logger.error('test error', { detail: '123' })
    expect(consoleErrorSpy).toHaveBeenCalledWith('test error', { detail: '123' })
  })

  it('delegates warn to console.warn', () => {
    logger.warn('test warn', { detail: '123' })
    expect(consoleWarnSpy).toHaveBeenCalledWith('test warn', { detail: '123' })
  })

  it('delegates info to console.info', () => {
    logger.info('test info', { detail: '123' })
    expect(consoleInfoSpy).toHaveBeenCalledWith('test info', { detail: '123' })
  })
})
