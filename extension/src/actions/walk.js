import { clampX, projectedX } from '../core/geometry.js';

export function walkAction(context) {
    const direction = context.body.direction || 1;
    const velocityX = direction * context.body.speed;
    const body = { ...context.body, direction, velocityX };
    return Object.freeze({
        finished: true,
        body: Object.freeze({
            ...context.body,
            x: clampX(projectedX(body), context.screen, body),
            direction,
            velocityX,
        }),
    });
}
