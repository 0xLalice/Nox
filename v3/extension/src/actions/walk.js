import { clampX, projectedX } from '../core/geometry.js';
import { nextWalkRampTick, walkRampSpeed } from '../core/locomotion.js';
import { createRestHoldActionState, walkStopActionState } from '../core/action-state.js';
import { FATIGUE_MAX, FATIGUE_WALK_DRAIN, REST_DECELERATION_TICKS } from '../core/constants.js';
import { MotionMode } from '../core/types.js';
import { bodyOnSupport } from '../world/support.js';

export function walkAction(context) {
    const direction = context.body.direction || 1;
    const rampTick = context.locomotion.walkRampTick || 0;
    const velocityX = direction * walkRampSpeed(context.config, rampTick);
    const body = { ...context.body, direction, velocityX };
    return Object.freeze({
        finished: true,
        body: bodyOnSupport(Object.freeze({
            ...context.body,
            x: clampX(projectedX(body), context.screen, body),
            direction,
            velocityX,
        }), context.support),
        locomotion: Object.freeze({
            walkRampTick: nextWalkRampTick(context.config, rampTick),
        }),
        needs: Object.freeze({
            fatigue: (context.needs?.fatigue ?? FATIGUE_MAX) - FATIGUE_WALK_DRAIN,
        }),
    });
}

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
            ? createRestHoldActionState(context.support, body)
            : walkStopActionState(actionState, actionState.phaseTick + 1),
    });
}
