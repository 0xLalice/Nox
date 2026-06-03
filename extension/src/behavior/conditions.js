import { wallHit } from '../core/geometry.js';

export const CONDITIONS = Object.freeze({
    canWalk: context => context.body.speed > 0,
    willHitWall: context => Boolean(wallHit(context.body, context.screen)),
});
