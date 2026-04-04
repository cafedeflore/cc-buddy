import type { TailState } from './types'

export function consumeJsonlChunk(state: TailState, chunk: string) {
  const combined = `${state.remainder}${chunk}`
  const parts = combined.split('\n')
  const remainder = parts.pop() ?? ''
  const events = parts.filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>)

  return {
    state: {
      offset: state.offset + chunk.length,
      remainder,
    },
    events,
  }
}
