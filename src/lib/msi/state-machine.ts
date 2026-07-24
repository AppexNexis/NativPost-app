// Generic finite-state-machine helper for Managed Social Infrastructure.
// See docs/managed-social-infrastructure.md §5 (lifecycle) and §7 (jobs).
//
// Design: transitions are declared as a two-level adjacency map. An edge's
// value is either `true` (always allowed) or a Guard — a pure function of a
// context object that returns `true` to allow or a `string` explaining why it
// is blocked. This keeps every legal/illegal transition statically declared
// and cheaply testable.

/** Thrown when no edge is declared between two states. */
export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Illegal transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

/** Thrown when an edge exists but its guard rejected the transition. */
export class GuardFailedError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly reason: string,
  ) {
    super(`Guard failed for ${from} → ${to}: ${reason}`);
    this.name = 'GuardFailedError';
  }
}

/**
 * Returns `true` to allow the transition, or a `string` describing why it is
 * blocked. Guards MUST be pure functions of `ctx`.
 */
export type Guard<Ctx> = (ctx: Ctx) => true | string;

export type TransitionMap<S extends string, Ctx> = {
  [From in S]?: Partial<Record<S, true | Guard<Ctx>>>;
};

export type MachineConfig<S extends string, Ctx> = {
  states: readonly S[];
  initial: S;
  terminal?: readonly S[];
  transitions: TransitionMap<S, Ctx>;
};

export type StateMachine<S extends string, Ctx> = {
  readonly states: readonly S[];
  readonly initial: S;
  readonly terminal: ReadonlySet<S>;
  isTerminal: (state: S) => boolean;
  /** Adjacency only — ignores guards. */
  can: (from: S, to: S) => boolean;
  /** Every state reachable from `from` in one hop (adjacency only). */
  nextStates: (from: S) => S[];
  /**
   * Validate adjacency + run the guard. Returns `to` on success; throws
   * {@link InvalidTransitionError} or {@link GuardFailedError} otherwise.
   */
  transition: (from: S, to: S, ctx: Ctx) => S;
};

export function createMachine<S extends string, Ctx>(
  config: MachineConfig<S, Ctx>,
): StateMachine<S, Ctx> {
  const terminal = new Set<S>(config.terminal ?? []);

  const edge = (from: S, to: S): true | Guard<Ctx> | undefined =>
    config.transitions[from]?.[to];

  return {
    states: config.states,
    initial: config.initial,
    terminal,
    isTerminal: state => terminal.has(state),
    can: (from, to) => edge(from, to) !== undefined,
    nextStates: from => Object.keys(config.transitions[from] ?? {}) as S[],
    transition: (from, to, ctx) => {
      const guard = edge(from, to);
      if (guard === undefined) {
        throw new InvalidTransitionError(from, to);
      }
      if (guard !== true) {
        const result = guard(ctx);
        if (result !== true) {
          throw new GuardFailedError(from, to, result);
        }
      }
      return to;
    },
  };
}
