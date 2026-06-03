import { ActionId, DecisionType, PlannerContext } from '../core/types.js';

export const BEHAVIOR_TREE = Object.freeze([
    Object.freeze({
        id: ActionId.FLIP_AT_WALL,
        context: PlannerContext.GROUND,
        priority: 100,
        weight: 1,
        conditions: Object.freeze(['willHitWall']),
        action: DecisionType.FLIP_AT_WALL,
    }),
    Object.freeze({
        id: ActionId.WALK,
        context: PlannerContext.GROUND,
        priority: 0,
        weight: 1,
        conditions: Object.freeze(['canWalk']),
        action: DecisionType.WALK,
    }),
]);
