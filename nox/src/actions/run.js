import { clampX, projectedX } from '../core/geometry.js';
import { nextRunRampTick, runRampSpeed } from '../core/locomotion.js';
import { nextRunActionState } from '../core/action-state.js';
import { FATIGUE_MAX, FATIGUE_RUN_DRAIN } from '../core/constants.js';
import { MotionMode } from '../core/types.js';
import { bodyOnSupport } from '../world/support.js';

export function runSpeed(config) {
    return config.runSpeed;
}

export function runAction(context) {
    const direction = context.body.direction || 1;
    const nextAction = nextRunActionState(context.activeAction);
    const rampTick = context.locomotion.runRampTick || 0;
    const runningVelocityX = direction * runRampSpeed(context.config, rampTick);
    const finished = !nextAction;
    const body = {
        ...context.body,
        direction,
        velocityX: runningVelocityX,
    };
    return Object.freeze({
        finished,
        body: bodyOnSupport(Object.freeze({
            ...context.body,
            x: clampX(projectedX(body), context.screen, body),
            direction,
            velocityX: finished ? direction * context.config.walkSpeed : runningVelocityX,
        }), context.support),
        locomotion: Object.freeze({
            walkRampTick: context.config.walkAccelerationTicks,
            runRampTick: nextRunRampTick(context.config, rampTick),
        }),
        needs: Object.freeze({
            fatigue: (context.needs?.fatigue ?? FATIGUE_MAX) - FATIGUE_RUN_DRAIN,
        }),
        motion: Object.freeze({
            mode: finished ? MotionMode.GROUNDED : MotionMode.RUNNING,
        }),
        activeAction: nextAction,
    });
}
