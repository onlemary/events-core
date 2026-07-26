// =============================================================================
// events-core — barrel (public API)
// =============================================================================

// Public API: record-system-event side
export {
  recordSystemEvent,
  type RecordResult,
} from './buffered-event/record.js'

// RecordInput type comes from the schemas module (where Zod validates it).
export { type RecordInput } from './buffered-event/schemas.js'

// Public API: input validation schemas
export {
  RecordInputSchema,
  EventContextSchema,
  isKnownEventKind,
  type EventContext,
  type EventKind,
} from './buffered-event/schemas.js'

// Public API: policy evaluation + mutation
export {
  evaluatePolicy,
  type EvaluateInput,
  type EvaluateContext,
  type PolicySnapshotEntry,
  type Decision,
  type DispatchPlan,
  setMuted,
  type SetMutedInput,
  type SetMutedResult,
  getDefaultMessage,
} from './policy/index.js'

// Public API: read-side query
export {
  getBufferedEvents,
  getActiveMutePolicies,
  type GetBufferedEventsQuery,
  type GetBufferedEventsCtx,
  type BufferedEventRow,
} from './storage/queries.js'

// Public API: dispatch-fn type (NO concrete implementation)
export type {
  DispatchFn,
  DispatchFnStatus,
  DispatchFnResult,
  DispatchFnMeta,
} from './dispatch-fn.js'

// Public API: typed errors
export {
  BufferedEventValidationError,
  BufferedEventWriteError,
  PolicyEvaluationError,
} from './errors.js'
