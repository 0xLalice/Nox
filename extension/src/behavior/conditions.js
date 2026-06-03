import { wallHit } from '../core/geometry.js';

export const CONDITIONS = Object.freeze({
    canWalk: context => context.config.walkSpeed > 0,
    canRun: context => context.config.walkSpeed > 0 && context.motion.runTicksRemaining > 0,
    willHitWall: context => Boolean(wallHit(context.body, context.screen)),
});
