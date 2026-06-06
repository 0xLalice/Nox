import {
    JUMP_REACH_DISTANCE,
    JUMP_RECEPTION_TICKS,
    JUMP_TAKEOFF_TICKS,
    JUMP_TRAJECTORY_GRAVITY,
    JumpAnimationVariant,
} from '../core/constants.js';
import { SurfaceKind } from './surface.js';

const MIN_FLIGHT_TICKS = 18;
const MAX_FLIGHT_TICKS = 50;

export function reachableJumps(world, body, support, config, options = {}) {
    if (!world || !body || !support)
        return [];
    const variant = options.animationVariant || JumpAnimationVariant.V1;
    const candidates = [];
    for (const surface of world.surfaces) {
        if (!surface.walkable || surface.id === support.surfaceId)
            continue;
        const candidate = candidateForSurface(world, body, support, config, surface, variant);
        if (candidate)
            candidates.push(candidate);
    }
    return candidates.sort(compareCandidates);
}

export function affordableJumpCandidates(candidates, fatigue, minFatigue) {
    return candidates.filter(candidate => fatigue >= minFatigue && fatigue - candidate.fatigueCost >= minFatigue);
}

function candidateForSurface(world, body, support, config, surface, animationVariant) {
    if (surface.kind !== SurfaceKind.PLATFORM || surface.topY >= support.topY)
        return null;
    const landingX = nearestLandingX(body, surface);
    const horizontalDistance = Math.abs(landingX - body.x);
    const upwardDistance = Math.max(0, support.topY - surface.topY);
    const distance = Math.hypot(horizontalDistance, upwardDistance);
    if (distance > jumpReachDistance(config))
        return null;
    const targetY = surface.topY - body.height;
    const airTicks = flightTicksForDistance(distance);
    const launchVelocity = launchVelocityForTarget(body, landingX, targetY, airTicks);
    return Object.freeze({
        targetSurfaceId: surface.id,
        kind: 'up',
        landingX,
        targetY,
        distance,
        horizontalDistance,
        upwardDistance,
        direction: launchVelocity.x === 0 ? body.direction || 1 : launchVelocity.x > 0 ? 1 : -1,
        launchVelocity,
        animationVariant,
        airTicks,
        animationTicks: JUMP_TAKEOFF_TICKS + airTicks + JUMP_RECEPTION_TICKS,
        fatigueCost: jumpFatigueCost(distance, upwardDistance),
    });
}

function nearestLandingX(body, surface) {
    const minX = surface.rect.x;
    const maxX = surface.rect.x + surface.rect.width - body.width;
    if (maxX < minX)
        return surface.rect.x + (surface.rect.width - body.width) / 2;
    return Math.max(minX, Math.min(maxX, body.x));
}

function flightTicksForDistance(distance) {
    return Math.max(MIN_FLIGHT_TICKS, Math.min(MAX_FLIGHT_TICKS, Math.round(24 + distance / 10)));
}

function launchVelocityForTarget(body, targetX, targetY, ticks) {
    const x = (targetX - body.x) / ticks;
    const y = (targetY - body.y - JUMP_TRAJECTORY_GRAVITY * ticks * (ticks + 1) / 2) / ticks;
    return Object.freeze({
        x: roundVelocity(x),
        y: roundVelocity(y),
    });
}

function jumpFatigueCost(distance, upwardDistance) {
    return Math.round((4 + distance * 0.025 + upwardDistance * 0.05) * 10) / 10;
}

function compareCandidates(a, b) {
    return a.distance - b.distance
        || a.fatigueCost - b.fatigueCost
        || a.horizontalDistance - b.horizontalDistance
        || a.targetSurfaceId.localeCompare(b.targetSurfaceId);
}

function jumpReachDistance(config) {
    return Number.isFinite(config.jumpReachDistance) ? config.jumpReachDistance : JUMP_REACH_DISTANCE;
}

function roundVelocity(value) {
    return Math.round(value * 1000) / 1000;
}
