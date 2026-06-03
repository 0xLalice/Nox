export const ActionStateId = Object.freeze({
    RUN: 'run',
    REST: 'rest',
});

export const ActionPhase = Object.freeze({
    RUNNING: 'running',
    DECELERATING: 'decelerating',
    RESTING: 'resting',
    RESUMING: 'resuming',
});

export function createRunActionState(config, support) {
    return Object.freeze({
        id: ActionStateId.RUN,
        phase: ActionPhase.RUNNING,
        ticksRemaining: config.runDurationTicks,
        startedOnSupportId: support?.surfaceId || null,
    });
}

export function nextRunActionState(actionState) {
    if (!isRunAction(actionState))
        return null;
    const ticksRemaining = Math.max(0, actionState.ticksRemaining - 1);
    if (ticksRemaining <= 0)
        return null;
    return Object.freeze({
        ...actionState,
        ticksRemaining,
    });
}

export function isRunAction(actionState) {
    return actionState?.id === ActionStateId.RUN;
}

export function createRestActionState(support) {
    return Object.freeze({
        id: ActionStateId.REST,
        phase: ActionPhase.DECELERATING,
        phaseTick: 0,
        startedOnSupportId: support?.surfaceId || null,
    });
}

export function restActionState(actionState, phase, phaseTick = 0) {
    if (!isRestAction(actionState))
        return null;
    return Object.freeze({
        ...actionState,
        phase,
        phaseTick,
    });
}

export function isRestAction(actionState) {
    return actionState?.id === ActionStateId.REST;
}
