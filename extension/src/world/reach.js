import {
    JUMP_REACH_DISTANCE,
    JUMP_RECEPTION_TICKS,
    JUMP_TAKEOFF_TICKS,
    JUMP_TRAJECTORY_GRAVITY,
    JumpAnimationVariant,
} from '../core/constants.js';
import { SurfaceKind } from './surface.js';
import { surfaceTopBlockedAt } from './support.js';
import { jumpReachMetric, jumpReachOrigin, jumpReachTarget } from './reach-metric.js';

const MIN_FLIGHT_TICKS = 18;
const MAX_FLIGHT_TICKS = 50;

export function reachableJumps(world, body, support, config, options = {}) {
    if (!world || !body || !support)
        return [];
    const candidates = [];
    for (const surface of world.surfaces) {
        if (!surface.walkable || surface.id === support.surfaceId)
            continue;
        const candidate = candidateForSurface(world, body, support, config, surface, options.animationVariant || null);
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
    if (!Number.isFinite(landingX))
        return null;
    const metric = jumpReachMetric(
        jumpReachOrigin(body, support),
        jumpReachTarget(body, landingX, surface)
    );
    const { horizontalDistance, upwardDistance, distance } = metric;
    if (distance > jumpReachDistance(config))
        return null;
    const variant = animationVariant || JumpAnimationVariant.V1;
    const targetY = surface.topY - body.height;
    const airTicks = flightTicksForDistance(distance, upwardDistance);
    const launchVelocity = launchVelocityForTarget(body, landingX, targetY, airTicks);
    const candidate = Object.freeze({
        targetSurfaceId: surface.id,
        kind: 'up',
        landingX,
        targetY,
        distance,
        horizontalDistance,
        upwardDistance,
        direction: launchVelocity.x === 0 ? body.direction || 1 : launchVelocity.x > 0 ? 1 : -1,
        launchVelocity,
        animationVariant: variant,
        airTicks,
        animationTicks: JUMP_TAKEOFF_TICKS + airTicks + JUMP_RECEPTION_TICKS,
        fatigueCost: jumpFatigueCost(distance, upwardDistance),
    });
    return candidate;
}

function nearestLandingX(body, surface) {
    const minX = surface.rect.x;
    const maxX = surface.rect.x + surface.rect.width - body.width;
    if (maxX < minX)
        return surface.rect.x + (surface.rect.width - body.width) / 2;
    const preferred = Math.max(minX, Math.min(maxX, body.x));
    if (!surfaceTopBlockedAt(surface, preferred + body.width / 2))
        return preferred;
    return nearestUnblockedLandingX(body, surface, minX, maxX, preferred);
}

function nearestUnblockedLandingX(body, surface, minX, maxX, preferred) {
    const candidates = [];
    for (const edge of unblockedEdges(surface)) {
        candidates.push(edge - body.width / 2);
    }
    candidates.push(minX, maxX);
    return candidates
        .map(x => Math.max(minX, Math.min(maxX, x)))
        .filter(x => !surfaceTopBlockedAt(surface, x + body.width / 2))
        .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || a - b)[0] ?? Number.NaN;
}

function unblockedEdges(surface) {
    const edges = [surface.rect.x, surface.rect.x + surface.rect.width];
    for (const interval of surface.blockedTopIntervals || []) {
        edges.push(interval.left - 1, interval.left, interval.right, interval.right + 1);
    }
    return edges;
}

function flightTicksForDistance(distance, upwardDistance) {
    return Math.max(
        MIN_FLIGHT_TICKS,
        Math.min(MAX_FLIGHT_TICKS, Math.round(14 + distance / 12 + upwardDistance / 20))
    );
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
