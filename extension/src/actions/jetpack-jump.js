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
    const frame = actionState.animationTick || 0;
    const plan = poweredPhasePlan(frame);
    const desiredX = horizontalCruiseVelocity(body, actionState);
    return Object.freeze({
        ...body,
        velocityX: approachHorizontal(body.velocityX || 0, desiredX, plan.horizontalAcceleration),
        velocityY: approach(body.velocityY || 0, plan.verticalSpeed, plan.verticalAcceleration),
    });
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

function horizontalCruiseVelocity(body, actionState) {
    const targetX = actionState.landingX ?? body.x;
    const distance = targetX - body.x;
    const sign = Math.sign(distance);
    if (sign === 0)
        return 0;
    const brakingDistance = Math.max(18, Math.abs(body.velocityX || 0) * 8);
    if (Math.abs(distance) <= brakingDistance)
        return 0;
    return clamp(sign * Math.max(1.6, Math.abs(distance) / 18), -JETPACK_MAX_HORIZONTAL_SPEED, JETPACK_MAX_HORIZONTAL_SPEED);
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
