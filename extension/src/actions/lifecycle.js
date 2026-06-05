import { clampX, projectedX } from '../core/geometry.js';
import {
    ActionStateId,
    createMessageHoldActionState,
    createRestHoldActionState,
    messageHoldActionState,
    restHoldActionState,
    walkStopActionState,
} from '../core/action-state.js';
import { jumpAction } from './jump.js';
import { FATIGUE_MAX, FATIGUE_REST_RESTORE, REST_DECELERATION_TICKS } from '../core/constants.js';
import { MotionMode } from '../core/types.js';
import { bodyOnSupport } from '../world/support.js';

export function walkStopAction(context) {
    const actionState = context.activeAction;
    const direction = context.body.direction || 1;
    const speed = Math.abs(context.body.velocityX || 0);
    const nextSpeed = Math.max(0, speed - context.config.walkSpeed / REST_DECELERATION_TICKS);
    const velocityX = direction * nextSpeed;
    const stoppingBody = {
        ...context.body,
        direction,
        velocityX,
    };
    const body = bodyOnSupport(Object.freeze({
        ...context.body,
        x: clampX(projectedX(stoppingBody), context.screen, stoppingBody),
        direction,
        velocityX,
    }), context.support);
    return Object.freeze({
        finished: false,
        body,
        locomotion: Object.freeze({
            walkRampTick: 0,
            runRampTick: 0,
        }),
        motion: Object.freeze({
            mode: MotionMode.GROUNDED,
        }),
        activeAction: nextSpeed <= 0 && actionState.nextActionId
            ? nextHoldAction(actionState.nextActionId, context.support, body)
            : walkStopActionState(actionState, actionState.phaseTick + 1),
    });
}

export function restHoldAction(context) {
    const actionState = context.activeAction;
    const nextFatigue = context.needs.fatigue + FATIGUE_REST_RESTORE;
    const finished = nextFatigue >= FATIGUE_MAX;
    return Object.freeze({
        finished,
        body: bodyOnSupport(Object.freeze({
            ...context.body,
            x: actionState.anchorX,
            velocityX: 0,
            velocityY: 0,
        }), context.support),
        needs: Object.freeze({
            fatigue: nextFatigue,
            restCheckTicks: 0,
        }),
        locomotion: Object.freeze({
            walkRampTick: 0,
            runRampTick: 0,
        }),
        motion: Object.freeze({
            mode: MotionMode.GROUNDED,
        }),
        activeAction: finished ? null : restHoldActionState(actionState, actionState.phaseTick + 1),
    });
}

export function messageHoldAction(context) {
    const actionState = context.activeAction;
    return Object.freeze({
        finished: false,
        body: bodyOnSupport(Object.freeze({
            ...context.body,
            x: actionState.anchorX,
            velocityX: 0,
            velocityY: 0,
        }), context.support),
        locomotion: Object.freeze({
            walkRampTick: 0,
            runRampTick: 0,
        }),
        motion: Object.freeze({
            mode: MotionMode.GROUNDED,
        }),
        activeAction: messageHoldActionState(actionState, actionState.phaseTick + 1),
    });
}

export const LIFECYCLE_ACTIONS = Object.freeze({
    [ActionStateId.JUMP]: jumpAction,
    [ActionStateId.WALK_STOP]: walkStopAction,
    [ActionStateId.REST_HOLD]: restHoldAction,
    [ActionStateId.MESSAGE_HOLD]: messageHoldAction,
});

export function lifecycleActionFor(activeAction) {
    return LIFECYCLE_ACTIONS[activeAction?.id] || null;
}

function nextHoldAction(actionId, support, body) {
    if (actionId === ActionStateId.MESSAGE_HOLD)
        return createMessageHoldActionState(support, body);
    return createRestHoldActionState(support, body);
}
