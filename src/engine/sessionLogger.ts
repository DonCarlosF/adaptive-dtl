import { SessionRecord, SessionState } from "./types";
import { accuracy } from "./adaptiveEngine";

/**
 * Pure helper: shapes a finished SessionState into a persistable record.
 * The DB layer handles actual writes; keeping this pure makes it easy
 * to test and reason about.
 */
export function buildSessionRecord(
  state: SessionState,
  startedAt: number,
  endedEarly: boolean,
): SessionRecord {
  return {
    id: cryptoId(),
    studentId: state.studentId,
    domain: state.domain,
    startedAt,
    endedAt: Date.now(),
    trials: state.trials,
    adaptations: state.adaptations,
    endedEarly,
    accuracy: accuracy(state.trials),
  };
}

function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}
