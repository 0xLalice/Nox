import { horizontalBounds } from '../core/geometry.js';

export function flipAtWallAction(context) {
    const bounds = horizontalBounds(context.screen, context.body);
    const hitRight = context.body.direction > 0;
    const direction = hitRight ? -1 : 1;
    const velocityX = direction * context.config.walkSpeed;
    return Object.freeze({
        finished: true,
        body: Object.freeze({
            ...context.body,
            x: hitRight ? bounds.maxX : bounds.minX,
            direction,
            velocityX,
        }),
    });
}
