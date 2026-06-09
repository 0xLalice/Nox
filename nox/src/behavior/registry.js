import { walkAction } from '../actions/walk.js';
import { runAction } from '../actions/run.js';
import { flipAtWallAction } from '../actions/flip-at-wall.js';
import { DecisionType, ActionMode } from '../core/types.js';

export const ACTION_CONTRACTS = Object.freeze({
    [DecisionType.WALK]: Object.freeze({
        mode: ActionMode.INSTANT,
        returnsBodyUpdate: true,
        returnsLocomotionUpdate: true,
        mutatesContext: false,
    }),
    [DecisionType.FLIP_AT_WALL]: Object.freeze({
        mode: ActionMode.INSTANT,
        returnsBodyUpdate: true,
        returnsLocomotionUpdate: true,
        returnsMotionUpdate: true,
        mutatesContext: false,
    }),
    [DecisionType.RUN]: Object.freeze({
        mode: ActionMode.ACTIVE,
        returnsBodyUpdate: true,
        returnsLocomotionUpdate: true,
        returnsMotionUpdate: true,
        returnsActionUpdate: true,
        mutatesContext: false,
    }),
});

export const ACTION_REGISTRY = Object.freeze({
    [DecisionType.WALK]: walkAction,
    [DecisionType.RUN]: runAction,
    [DecisionType.FLIP_AT_WALL]: flipAtWallAction,
});

export function validateRegistry(tree) {
    for (const node of tree) {
        if (!ACTION_REGISTRY[node.action])
            throw new Error(`missing action executor for ${node.id}`);
        if (!ACTION_CONTRACTS[node.action])
            throw new Error(`missing action contract for ${node.id}`);
        if (!Number.isFinite(node.weight) || node.weight <= 0)
            throw new Error(`invalid weight for ${node.id}`);
    }
    return true;
}
