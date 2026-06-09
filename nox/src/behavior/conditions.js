import { wallHit } from '../core/geometry.js';
import { isRunAction } from '../core/action-state.js';

export const CONDITIONS = Object.freeze({
    canWalk: context => context.config.walkSpeed > 0,
    canRun: context => context.config.walkSpeed > 0 && isRunAction(context.activeAction),
    willHitWall: context => Boolean(wallHit(context.body, context.screen)),
});
