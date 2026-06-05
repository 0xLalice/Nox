import { Direction, MotionMode } from './types.js';
import { clampX, clampY, horizontalBounds, verticalBounds } from './geometry.js';
import { createWorldSnapshot } from '../world/world.js';
import { bodyOnSupport, landingSupport } from '../world/support.js';

export function createMotion() {
    return {
        mode: MotionMode.GROUNDED,
    };
}

export function clampBodyToScreen(screen, body) {
    return Object.freeze({
        ...body,
        x: clampX(body.x, screen, body),
        y: clampY(body.y, screen, body),
    });
}

export function startAirborne(screen, body, velocity) {
    const direction = directionFromVelocity(velocity.x, body.direction);
    return Object.freeze({
        body: Object.freeze({
            ...clampBodyToScreen(screen, body),
            direction,
            velocityX: velocity.x,
            velocityY: velocity.y,
        }),
        motion: Object.freeze({
            mode: MotionMode.AIRBORNE,
        }),
    });
}

export function stepAirborne(screen, body, config, world = createWorldSnapshot(screen)) {
    const trajectory = stepAirborneTrajectory(screen, body, config);
    const support = landingSupport(world, body, trajectory);
    if (support) {
        const direction = directionFromVelocity(trajectory.velocityX, trajectory.direction);
        return Object.freeze({
            body: bodyOnSupport({
                ...trajectory,
                direction,
                velocityX: direction * config.walkSpeed,
                velocityY: 0,
            }, support),
            motion: Object.freeze({
                mode: MotionMode.GROUNDED,
            }),
            support,
            landed: true,
        });
    }

    return Object.freeze({
        body: trajectory,
        motion: Object.freeze({
            mode: MotionMode.AIRBORNE,
        }),
        landed: false,
    });
}

export function stepAirborneTrajectory(screen, body, config) {
    const falling = {
        ...body,
        velocityY: Math.min(body.velocityY + config.gravity, config.maxFallSpeed),
    };
    const next = {
        ...falling,
        x: falling.x + falling.velocityX,
        y: falling.y + falling.velocityY,
    };
    const xBounds = horizontalBounds(screen, next);
    const yBounds = verticalBounds(screen, next);
    let velocityX = next.velocityX;
    let x = next.x;
    if (x <= xBounds.minX) {
        x = xBounds.minX;
        velocityX = 0;
    } else if (x >= xBounds.maxX) {
        x = xBounds.maxX;
        velocityX = 0;
    }

    return Object.freeze({
        ...next,
        x,
        y: Math.max(yBounds.minY, next.y),
        velocityX,
    });
}

export function directionFromVelocity(velocityX, fallbackDirection) {
    if (velocityX > 0)
        return Direction.RIGHT;
    if (velocityX < 0)
        return Direction.LEFT;
    return fallbackDirection || Direction.RIGHT;
}
