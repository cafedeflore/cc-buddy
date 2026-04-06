import { describe, expect, it } from 'vitest'

import { clipFileName } from './videoPath'

describe('clipFileName', () => {
  it('maps idle loop variants directly to .webm assets', () => {
    expect(clipFileName('idle-to-idle')).toBe('idle-to-idle.webm')
    expect(clipFileName('idle-to-idle-v2')).toBe('idle-to-idle-v2.webm')
    expect(clipFileName('idle-to-idle-v3')).toBe('idle-to-idle-v3.webm')
  })

  it('maps idle petting to its dedicated asset', () => {
    expect(clipFileName('idle-petpet')).toBe('idle-petpet.webm')
  })
})
