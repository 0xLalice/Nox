import {
    JETPACK_APPROACH_DESCENT_SPEED,
    JETPACK_APPROACH_HORIZONTAL_ACCELERATION,
    JETPACK_CRUISE_END_FRAME,
    JETPACK_CRUISE_HORIZONTAL_ACCELERATION,
    JETPACK_CRUISE_UPWARD_SPEED,
    JETPACK_HORIZONTAL_BRAKE_ACCELERATION,
    JETPACK_LIFT_END_FRAME,
    JETPACK_LIFT_HORIZONTAL_ACCELERATION,
    JETPACK_LIFT_SPEED,
    JETPACK_MAX_DESCENT_SPEED,
    JETPACK_MAX_HORIZONTAL_SPEED,
    JETPACK_POWERED_END_FRAME,
    JETPACK_POWERED_GRAVITY,
    JUMP_TRAJECTORY_GRAVITY,
} from './constants.js';

export function jetpackAirborneConfig(config, animationTick) {
    return Object.freeze({
        ...config,
        gravity: isJetpackPoweredFrame(animationTick) ? JETPACK_POWERED_GRAVITY : JUMP_TRAJECTORY_GRAVITY,
    });
}

export function jetpackPoweredBody(body, actionState) {
    if (!isJetpackPoweredFrame(actionState.animationTick || 0))
        return body;
    const frame = actionState.animationTick || 0;
    const plan = poweredPhasePlan(frame);
    const desiredX = targetAwareHorizontalVelocity(body, actionState, frame);
    const desiredY = targetAwareVerticalVelocity(body, actionState, frame, plan.verticalSpeed);
    return Object.freeze({
        ...body,
        velocityX: frame <= JETPACK_LIFT_END_FRAME
            ? approachHorizontal(body.velocityX || 0, desiredX, plan.horizontalAcceleration)
            : desiredX,
        velocityY: frame <= JETPACK_LIFT_END_FRAME
            ? approach(body.velocityY || 0, desiredY, plan.verticalAcceleration)
            : desiredY,
    });
}

export function isJetpackPoweredFrame(animationTick) {
    return (animationTick || 0) <= JETPACK_POWERED_END_FRAME;
}

function poweredPhasePlan(frame) {
    if (frame <= JETPACK_LIFT_END_FRAME)
        return {
            horizontalAcceleration: JETPACK_LIFT_HORIZONTAL_ACCELERATION,
            verticalAcceleration: 0.5,
            verticalSpeed: JETPACK_LIFT_SPEED,
        };
    if (frame <= JETPACK_CRUISE_END_FRAME)
        return {
            horizontalAcceleration: JETPACK_CRUISE_HORIZONTAL_ACCELERATION,
            verticalAcceleration: 0.28,
            verticalSpeed: JETPACK_CRUISE_UPWARD_SPEED,
        };
    return {
        horizontalAcceleration: JETPACK_APPROACH_HORIZONTAL_ACCELERATION,
        verticalAcceleration: 0.42,
        verticalSpeed: JETPACK_APPROACH_DESCENT_SPEED,
    };
}

function targetAwareHorizontalVelocity(body, actionState, frame) {
    const targetX = actionState.landingX ?? body.x;
    const distance = targetX - body.x;
    if (distance === 0)
        return 0;
    return clamp(distance / Math.max(1, poweredFramesRemaining(frame)), -JETPACK_MAX_HORIZONTAL_SPEED, JETPACK_MAX_HORIZONTAL_SPEED);
}

function targetAwareVerticalVelocity(body, actionState, frame, fallbackSpeed) {
    if (!Number.isFinite(actionState.targetY))
        return fallbackSpeed;
    const remaining = poweredFramesRemaining(frame);
    const desired = (actionState.targetY - body.y) / remaining - JETPACK_POWERED_GRAVITY;
    return clamp(desired, JETPACK_LIFT_SPEED, JETPACK_MAX_DESCENT_SPEED);
}

function poweredFramesRemaining(frame) {
    return Math.max(1, JETPACK_POWERED_END_FRAME - frame + 1);
}

function approachHorizontal(current, target, amount) {
    if (target === 0)
        return approach(current, target, JETPACK_HORIZONTAL_BRAKE_ACCELERATION);
    return approach(current, target, amount);
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
