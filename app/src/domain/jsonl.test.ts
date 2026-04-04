import { describe, expect, it } from 'vitest'

import { consumeJsonlChunk } from './jsonl'

describe('consumeJsonlChunk', () => {
  it('emits only complete JSON lines and keeps the partial tail buffered', () => {
    const first = consumeJsonlChunk(
      { offset: 0, remainder: '' },
      '{"type":"assistant"}\n{"type":"tool_use"',
    )

    expect(first.events).toEqual([{ type: 'assistant' }])
    expect(first.state).toEqual({
      offset: 39,
      remainder: '{"type":"tool_use"',
    })
  })

  it('parses the buffered remainder when the next chunk arrives', () => {
    const first = consumeJsonlChunk(
      { offset: 0, remainder: '' },
      '{"type":"tool_use"',
    )

    const second = consumeJsonlChunk(first.state, ',"toolName":"Read"}\n')

    expect(second.events).toEqual([{ type: 'tool_use', toolName: 'Read' }])
    expect(second.state).toEqual({
      offset: 38,
      remainder: '',
    })
  })
})
