import { clampX, projectedX } from '../core/geometry.js';
import { RUN_SPEED_MULTIPLIER } from '../core/constants.js';
import { MotionMode } from '../core/types.js';

export function runSpeed(config) {
    return config.walkSpeed * RUN_SPEED_MULTIPLIER;
}

export function runAction(context) {
    const direction = context.body.direction || 1;
    const ticksRemaining = Math.max(0, context.motion.runTicksRemaining || 0);
    const nextTicks = Math.max(0, ticksRemaining - 1);
    const runningVelocityX = direction * runSpeed(context.config);
    const finished = nextTicks <= 0;
    const body = {
        ...context.body,
        direction,
        velocityX: runningVelocityX,
    };
    return Object.freeze({
        finished,
        body: Object.freeze({
            ...context.body,
            x: clampX(projectedX(body), context.screen, body),
            direction,
            velocityX: finished ? direction * context.config.walkSpeed : runningVelocityX,
        }),
        locomotion: Object.freeze({
            walkRampTick: context.config.walkAccelerationTicks,
        }),
        motion: Object.freeze({
            mode: finished ? MotionMode.GROUNDED : MotionMode.RUNNING,
            runTicksRemaining: nextTicks,
        }),
    });
}
