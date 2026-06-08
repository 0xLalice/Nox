import {
    JETPACK_HORIZONTAL_ACCELERATION,
    JETPACK_MAX_DESCENT_SPEED,
    JETPACK_MAX_HORIZONTAL_SPEED,
    JETPACK_MAX_UPWARD_SPEED,
    JETPACK_POWERED_END_FRAME,
    JETPACK_POWERED_GRAVITY,
    JETPACK_VERTICAL_ACCELERATION,
    JUMP_TRAJECTORY_GRAVITY,
} from '../core/constants.js';
import { stepAirborne } from '../core/physics.js';

export function stepJetpackAirborne(screen, body, actionState, config, world) {
    const powered = (actionState.animationTick || 0) <= JETPACK_POWERED_END_FRAME;
    const propelled = powered ? poweredBody(body, actionState) : body;
    return stepAirborne(screen, propelled, {
        ...config,
        gravity: powered ? JETPACK_POWERED_GRAVITY : JUMP_TRAJECTORY_GRAVITY,
    }, world);
}

function poweredBody(body, actionState) {
    const remainingTicks = Math.max(1, JETPACK_POWERED_END_FRAME - (actionState.animationTick || 0) + 1);
    const desiredX = clamp(
        ((actionState.landingX ?? body.x) - body.x) / remainingTicks,
        -JETPACK_MAX_HORIZONTAL_SPEED,
        JETPACK_MAX_HORIZONTAL_SPEED
    );
    const desiredY = clamp(
        ((actionState.targetY ?? body.y) - body.y) / remainingTicks - JETPACK_POWERED_GRAVITY,
        -JETPACK_MAX_UPWARD_SPEED,
        JETPACK_MAX_DESCENT_SPEED
    );
    return Object.freeze({
        ...body,
        velocityX: approach(body.velocityX || 0, desiredX, JETPACK_HORIZONTAL_ACCELERATION),
        velocityY: approach(body.velocityY || 0, desiredY, JETPACK_VERTICAL_ACCELERATION),
    });
}

function approach(current, target, amount) {
    if (current < target)
        return Math.min(target, current + amount);
    if (current > target)
        return Math.max(target, current - amount);
    return current;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
