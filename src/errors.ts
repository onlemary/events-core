// =============================================================================
// events-core — typed error classes
// =============================================================================
// All public functions throw one of these three. Each carries a stable
// `.code: string` for machine handling.
// =============================================================================

export class BufferedEventValidationError extends Error {
  readonly code = 'events.validation'
  constructor(
    message: string,
    public readonly context: Record<string, unknown> = {}
  ) {
    super(message)
    this.name = 'BufferedEventValidationError'
  }
}

export class BufferedEventWriteError extends Error {
  readonly code = 'events.write'
  constructor(
    message: string,
    public readonly cause: Error
  ) {
    super(message)
    this.name = 'BufferedEventWriteError'
  }
}

export class PolicyEvaluationError extends Error {
  readonly code = 'events.policy'
  constructor(
    message: string,
    public readonly context: Record<string, unknown> = {}
  ) {
    super(message)
    this.name = 'PolicyEvaluationError'
  }
}
