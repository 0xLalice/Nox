import { clampX, projectedX } from '../core/geometry.js';
import { nextWalkRampTick, walkRampSpeed } from '../core/locomotion.js';

export function walkAction(context) {
    const direction = context.body.direction || 1;
    const rampTick = context.locomotion.walkRampTick || 0;
    const velocityX = direction * walkRampSpeed(context.config, rampTick);
    const body = { ...context.body, direction, velocityX };
    return Object.freeze({
        finished: true,
        body: Object.freeze({
            ...context.body,
            x: clampX(projectedX(body), context.screen, body),
            direction,
            velocityX,
        }),
        locomotion: Object.freeze({
            walkRampTick: nextWalkRampTick(context.config, rampTick),
        }),
    });
}
