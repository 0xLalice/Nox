import { wallHit } from '../core/geometry.js';

export const CONDITIONS = Object.freeze({
    canWalk: context => context.config.walkSpeed > 0,
    willHitWall: context => Boolean(wallHit(context.body, context.screen)),
});
