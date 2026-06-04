export const ActionStateId = Object.freeze({
    RUN: 'run',
    WALK_STOP: 'walk-stop',
    REST_HOLD: 'rest-hold',
    MESSAGE_HOLD: 'message-hold',
});

export const ActionPhase = Object.freeze({
    RUNNING: 'running',
    DECELERATING: 'decelerating',
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

export function createWalkStopActionState(support, nextActionId = ActionStateId.REST_HOLD) {
    return Object.freeze({
        id: ActionStateId.WALK_STOP,
        phase: ActionPhase.DECELERATING,
        phaseTick: 0,
        nextActionId,
        startedOnSupportId: support?.surfaceId || null,
    });
}

export function walkStopActionState(actionState, phaseTick = 0) {
    if (!isWalkStopAction(actionState))
        return null;
    return Object.freeze({
        ...actionState,
        phaseTick,
    });
}

export function isWalkStopAction(actionState) {
    return actionState?.id === ActionStateId.WALK_STOP;
}

export function createRestHoldActionState(support, body) {
    return Object.freeze({
        id: ActionStateId.REST_HOLD,
        phaseTick: 0,
        startedOnSupportId: support?.surfaceId || null,
        anchorX: body.x,
        anchorY: body.y,
    });
}

export function restHoldActionState(actionState, phaseTick = 0) {
    if (!isRestHoldAction(actionState))
        return null;
    return Object.freeze({
        ...actionState,
        phaseTick,
    });
}

export function isRestHoldAction(actionState) {
    return actionState?.id === ActionStateId.REST_HOLD;
}

export function createMessageHoldActionState(support, body) {
    return Object.freeze({
        id: ActionStateId.MESSAGE_HOLD,
        phaseTick: 0,
        startedOnSupportId: support?.surfaceId || null,
        anchorX: body.x,
        anchorY: body.y,
    });
}

export function messageHoldActionState(actionState, phaseTick = 0) {
    if (!isMessageHoldAction(actionState))
        return null;
    return Object.freeze({
        ...actionState,
        phaseTick,
    });
}

export function isMessageHoldAction(actionState) {
    return actionState?.id === ActionStateId.MESSAGE_HOLD;
}

export function isLifecycleAction(actionState) {
    return isWalkStopAction(actionState) || isRestHoldAction(actionState) || isMessageHoldAction(actionState);
}
