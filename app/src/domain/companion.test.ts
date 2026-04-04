import { describe, expect, it, vi } from 'vitest'

import { syncCompanion } from './companion'

describe('syncCompanion', () => {
  it('computes companion age in whole days from hatchedAt', () => {
    vi.setSystemTime(new Date('2026-04-03T00:00:00.000Z'))

    expect(
      syncCompanion({
        name: 'Siltpaw',
        personality: 'curious, protective',
        hatchedAt: '2026-03-30T06:00:00.000Z',
      }),
    ).toEqual({
      name: 'Siltpaw',
      personality: 'curious, protective',
      ageDays: 3,
      hatchedAt: '2026-03-30T06:00:00.000Z',
    })
  })
})
