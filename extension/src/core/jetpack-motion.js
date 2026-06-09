import {
    JETPACK_HORIZONTAL_BRAKE_ACCELERATION,
    JETPACK_LIFT_SPEED,
    JETPACK_MAX_DESCENT_SPEED,
    JETPACK_MAX_HORIZONTAL_SPEED,
    JETPACK_POWERED_GRAVITY,
    JUMP_TRAJECTORY_GRAVITY,
} from './constants.js';

const JETPACK_HORIZONTAL_ACCELERATION = 0.55;
const JETPACK_VERTICAL_ACCELERATION = 0.7;
const JETPACK_HORIZONTAL_GAIN = 0.2;
const JETPACK_VERTICAL_GAIN = 0.16;
const JETPACK_VERTICAL_DAMPING = 0.32;
const JETPACK_FOOT_ALIGNMENT_TOLERANCE = 2;
const JETPACK_MIN_HOVER_MARGIN = 10;
const JETPACK_MAX_HOVER_MARGIN = 72;
const JETPACK_HOVER_MARGIN_PER_PIXEL = 1.5;

export function jetpackAirborneConfig(config, powered = true) {
    return Object.freeze({
        ...config,
        gravity: powered ? JETPACK_POWERED_GRAVITY : JUMP_TRAJECTORY_GRAVITY,
    });
}

export function jetpackPoweredBody(body, actionState, powered = true) {
    if (!powered)
        return body;
    const desiredX = targetAwareHorizontalVelocity(body, actionState);
    const desiredY = targetAwareVerticalVelocity(body, actionState);
    return Object.freeze({
        ...body,
        velocityX: approachHorizontal(body.velocityX || 0, desiredX, JETPACK_HORIZONTAL_ACCELERATION),
        velocityY: approach(body.velocityY || 0, desiredY, JETPACK_VERTICAL_ACCELERATION),
    });
}

function targetAwareHorizontalVelocity(body, actionState) {
    const targetX = actionState.landingX ?? body.x;
    const distance = targetX - body.x;
    if (Math.abs(distance) <= JETPACK_FOOT_ALIGNMENT_TOLERANCE)
        return 0;
    return clamp(distance * JETPACK_HORIZONTAL_GAIN, -JETPACK_MAX_HORIZONTAL_SPEED, JETPACK_MAX_HORIZONTAL_SPEED);
}

function targetAwareVerticalVelocity(body, actionState) {
    if (!Number.isFinite(actionState.targetY))
        return 0;
    const desiredTargetY = jetpackVerticalTargetY(body, actionState);
    const desired = (desiredTargetY - body.y) * JETPACK_VERTICAL_GAIN - (body.velocityY || 0) * JETPACK_VERTICAL_DAMPING;
    return clamp(desired, JETPACK_LIFT_SPEED, JETPACK_MAX_DESCENT_SPEED);
}

function jetpackVerticalTargetY(body, actionState) {
    if (!Number.isFinite(actionState.targetFootX))
        return actionState.targetY;
    const footX = body.x + body.width / 2;
    const horizontalError = Math.abs(actionState.targetFootX - footX);
    if (horizontalError <= JETPACK_FOOT_ALIGNMENT_TOLERANCE)
        return actionState.targetY;
    return actionState.targetY - Math.min(
        JETPACK_MAX_HOVER_MARGIN,
        Math.max(JETPACK_MIN_HOVER_MARGIN, horizontalError * JETPACK_HOVER_MARGIN_PER_PIXEL)
    );
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
