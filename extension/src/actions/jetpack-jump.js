import { jetpackAirborneConfig, jetpackPoweredBody } from '../core/jetpack-motion.js';
import { directionFromVelocity, stepAirborne } from '../core/physics.js';
import { MotionMode } from '../core/types.js';
import { findSurface } from '../world/world.js';
import { createSupportContact, surfaceTopBlockedAt } from '../world/support.js';

const JETPACK_FIXED_TARGET_CAPTURE_TOLERANCE = 36;
const JETPACK_FIXED_TARGET_FOOT_TOLERANCE = 2;
const JETPACK_FIXED_TARGET_UPWARD_CAPTURE_SPEED = -0.05;

export function stepJetpackAirborne(screen, body, actionState, config, world) {
    const targetSurface = fixedJetpackTargetSurface(world, actionState);
    const targetValid = Boolean(targetSurface);
    const update = stepAirborne(
        screen,
        jetpackPoweredBody(body, actionState, targetValid),
        jetpackAirborneConfig(config, targetValid),
        world
    );
    if (update.landed)
        return update;
    return captureFixedJetpackTarget(update, actionState, config, targetSurface) || update;
}

function fixedJetpackTargetSurface(world, actionState) {
    const surface = findSurface(world, actionState.targetSurfaceId);
    if (!surface || surface.topY !== actionState.targetTopY)
        return null;
    if (!Number.isFinite(actionState.targetFootX) || !Number.isFinite(actionState.targetTopY))
        return null;
    if (actionState.targetFootX < surface.rect.x - JETPACK_FIXED_TARGET_FOOT_TOLERANCE
        || actionState.targetFootX > surface.rect.x + surface.rect.width + JETPACK_FIXED_TARGET_FOOT_TOLERANCE
        || surfaceTopBlockedAt(surface, actionState.targetFootX))
        return null;
    return surface;
}

function captureFixedJetpackTarget(update, actionState, config, surface) {
    if (!surface)
        return null;
    const body = update.body;
    const footX = body.x + body.width / 2;
    const bottomY = body.y + body.height;
    const topDelta = bottomY - actionState.targetTopY;
    if (body.velocityY < JETPACK_FIXED_TARGET_UPWARD_CAPTURE_SPEED
        || topDelta < 0
        || topDelta > JETPACK_FIXED_TARGET_CAPTURE_TOLERANCE)
        return null;
    if (footX < surface.rect.x - JETPACK_FIXED_TARGET_FOOT_TOLERANCE
        || footX > surface.rect.x + surface.rect.width + JETPACK_FIXED_TARGET_FOOT_TOLERANCE
        || surfaceTopBlockedAt(surface, footX))
        return null;

    const direction = directionFromVelocity(body.velocityX, body.direction);
    const landedBody = Object.freeze({
        ...body,
        y: actionState.targetTopY - body.height,
        direction,
        velocityX: direction * config.walkSpeed,
        velocityY: 0,
    });
    return Object.freeze({
        body: landedBody,
        motion: Object.freeze({
            mode: MotionMode.GROUNDED,
        }),
        support: createSupportContact(surface, landedBody),
        landed: true,
    });
}
