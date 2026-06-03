import { clampX, projectedX } from '../core/geometry.js';
import { walkRampSpeed } from '../core/locomotion.js';
import {
    ActionPhase,
    restActionState,
} from '../core/action-state.js';
import {
    FATIGUE_MAX,
    FATIGUE_REST_RESTORE,
    REST_DECELERATION_TICKS,
    REST_RESUME_TICKS,
} from '../core/constants.js';
import { MotionMode } from '../core/types.js';
import { bodyOnSupport } from '../world/support.js';

export function restAction(context) {
    const actionState = context.activeAction;
    if (actionState.phase === ActionPhase.DECELERATING)
        return decelerateRest(context, actionState);
    if (actionState.phase === ActionPhase.RESTING)
        return holdRest(context, actionState);
    return resumeRest(context, actionState);
}

function decelerateRest(context, actionState) {
    const direction = context.body.direction || 1;
    const speed = Math.abs(context.body.velocityX || 0);
    const nextSpeed = Math.max(0, speed - context.config.walkSpeed / REST_DECELERATION_TICKS);
    const velocityX = direction * nextSpeed;
    const body = {
        ...context.body,
        direction,
        velocityX,
    };
    const nextAction = nextSpeed <= 0
        ? restActionState(actionState, ActionPhase.RESTING, 0)
        : restActionState(actionState, ActionPhase.DECELERATING, actionState.phaseTick + 1);
    return Object.freeze({
        finished: false,
        body: bodyOnSupport(Object.freeze({
            ...context.body,
            x: clampX(projectedX(body), context.screen, body),
            direction,
            velocityX,
        }), context.support),
        locomotion: Object.freeze({
            walkRampTick: 0,
            runRampTick: 0,
        }),
        motion: Object.freeze({
            mode: MotionMode.GROUNDED,
        }),
        activeAction: nextAction,
    });
}

function holdRest(context, actionState) {
    const nextFatigue = context.needs.fatigue + FATIGUE_REST_RESTORE;
    const nextAction = nextFatigue >= FATIGUE_MAX
        ? restActionState(actionState, ActionPhase.RESUMING, 0)
        : restActionState(actionState, ActionPhase.RESTING, actionState.phaseTick + 1);
    return Object.freeze({
        finished: false,
        body: bodyOnSupport(Object.freeze({
            ...context.body,
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
        activeAction: nextAction,
    });
}

function resumeRest(context, actionState) {
    const direction = context.body.direction || 1;
    const phaseTick = actionState.phaseTick + 1;
    const rampTick = Math.min(phaseTick, REST_RESUME_TICKS);
    const velocityX = direction * walkRampSpeed({
        ...context.config,
        walkAccelerationTicks: REST_RESUME_TICKS,
    }, rampTick);
    const finished = phaseTick >= REST_RESUME_TICKS;
    const body = {
        ...context.body,
        direction,
        velocityX: finished ? direction * context.config.walkSpeed : velocityX,
    };
    return Object.freeze({
        finished,
        body: bodyOnSupport(Object.freeze({
            ...context.body,
            x: clampX(projectedX(body), context.screen, body),
            direction,
            velocityX: body.velocityX,
        }), context.support),
        locomotion: Object.freeze({
            walkRampTick: finished ? context.config.walkAccelerationTicks : rampTick,
            runRampTick: 0,
        }),
        motion: Object.freeze({
            mode: MotionMode.GROUNDED,
        }),
        activeAction: finished ? null : restActionState(actionState, ActionPhase.RESUMING, phaseTick),
    });
}
