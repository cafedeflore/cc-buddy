import type { ConversationEvent, PetState, SessionSnapshot } from './types'

const IDLE_AFTER_MS = 30 * 1000

const idleState: PetState = {
  mood: 'idle',
  action: 'sleeping',
  label: 'No active Claude Code sessions',
  intensity: 'low',
}

const toolStateMap: Record<string, PetState> = {
  bash: {
    mood: 'excited',
    action: 'running_command',
    label: 'Running shell commands',
    intensity: 'high',
  },
  read: {
    mood: 'curious',
    action: 'reading',
    label: 'Reading project files',
    intensity: 'medium',
  },
  grep: {
    mood: 'hunting',
    action: 'searching',
    label: 'Searching through the codebase',
    intensity: 'high',
  },
  glob: {
    mood: 'hunting',
    action: 'searching',
    label: 'Searching through the codebase',
    intensity: 'high',
  },
  edit: {
    mood: 'focused',
    action: 'writing_code',
    label: 'Editing source files',
    intensity: 'high',
  },
  write: {
    mood: 'focused',
    action: 'writing_code',
    label: 'Editing source files',
    intensity: 'high',
  },
  agent: {
    mood: 'busy',
    action: 'delegating',
    label: 'Coordinating a sub-agent',
    intensity: 'medium',
  },
}

export function inferPetState(
  session?: SessionSnapshot,
  event?: ConversationEvent,
  now: string = new Date().toISOString(),
): PetState {
  if (!session?.alive) {
    return idleState
  }

  const updatedAt = Date.parse(event?.timestamp ?? session.updatedAt)
  const nowAt = Date.parse(now)
  if (Number.isFinite(updatedAt) && Number.isFinite(nowAt) && nowAt - updatedAt > IDLE_AFTER_MS) {
    return {
      mood: 'idle',
      action: 'sleeping',
      label: 'Session is idle',
      intensity: 'low',
    }
  }

  if (!event) {
    return {
      mood: 'thinking',
      action: 'pondering',
      label: 'Waiting for the next event',
      intensity: 'low',
    }
  }

  if (event.type === 'assistant') {
    return {
      mood: 'thinking',
      action: 'pondering',
      label: 'Assistant is thinking out loud',
      intensity: 'medium',
    }
  }

  if (event.type === 'result') {
    return {
      mood: 'happy',
      action: 'celebrating',
      label: 'Task finished successfully',
      intensity: 'medium',
    }
  }

  if (event.type === 'error') {
    return {
      mood: 'worried',
      action: 'debugging',
      label: 'Recovering from an error',
      intensity: 'high',
    }
  }

  if (event.type === 'tool_use') {
    const toolName = event.toolName?.toLowerCase() ?? ''
    return toolStateMap[toolName] ?? {
      mood: 'curious',
      action: 'reading',
      label: 'Handling a tool invocation',
      intensity: 'medium',
    }
  }

  return {
    mood: 'thinking',
    action: 'pondering',
    label: 'Streaming follow-up output',
    intensity: 'medium',
  }
}
