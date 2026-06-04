import { horizontalBounds } from '../core/geometry.js';
import { walkRampSpeed } from '../core/locomotion.js';
import { MotionMode } from '../core/types.js';
import { bodyOnSupport } from '../world/support.js';

export function flipAtWallAction(context) {
    const bounds = horizontalBounds(context.screen, context.body);
    const hitRight = context.body.direction > 0;
    const direction = hitRight ? -1 : 1;
    const velocityX = direction * walkRampSpeed(context.config, 0);
    return Object.freeze({
        finished: true,
        body: bodyOnSupport(Object.freeze({
            ...context.body,
            x: hitRight ? bounds.maxX : bounds.minX,
            direction,
            velocityX,
        }), context.support),
        locomotion: Object.freeze({
            walkRampTick: 0,
        }),
        motion: Object.freeze({
            mode: MotionMode.GROUNDED,
        }),
    });
}
