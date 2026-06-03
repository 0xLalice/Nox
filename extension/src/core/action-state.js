export const ActionStateId = Object.freeze({
    RUN: 'run',
});

export const ActionPhase = Object.freeze({
    RUNNING: 'running',
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
