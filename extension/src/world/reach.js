import {
    JUMP_REACH_DISTANCE,
    JUMP_RECEPTION_TICKS,
    JUMP_TAKEOFF_TICKS,
    JUMP_TRAJECTORY_GRAVITY,
    JumpAnimationVariant,
} from '../core/constants.js';
import { SurfaceKind } from './surface.js';
import { surfaceTopBlockedAt } from './support.js';
import { jumpReachCircle, jumpReachMetric } from './reach-metric.js';

const MIN_FLIGHT_TICKS = 8;
const MAX_FLIGHT_TICKS = 50;
const REACH_EPSILON = 0.000001;

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
    const circle = jumpReachCircle(body, support, config, JUMP_REACH_DISTANCE);
    const target = nearestTopBorderPointInCircle(circle, surface);
    if (!target)
        return null;
    const metric = jumpReachMetric(circle.origin, target);
    const { horizontalDistance, upwardDistance, distance } = metric;
    if (distance > circle.radius + REACH_EPSILON)
        return null;
    const variant = animationVariant || JumpAnimationVariant.V1;
    const landingX = target.x - body.width / 2;
    const targetY = surface.topY - body.height;
    const airTicks = flightTicksForDistance(distance, upwardDistance);
    const launchVelocity = launchVelocityForTarget(body, landingX, targetY, airTicks);
    const candidate = Object.freeze({
        targetSurfaceId: surface.id,
        kind: 'up',
        landingX,
        targetFootX: target.x,
        targetTopY: target.y,
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

function nearestTopBorderPointInCircle(circle, surface) {
    const reachableIntervals = unblockedTopIntervals(surface)
        .map(interval => intersectTopIntervalWithCircle(interval, surface.topY, circle))
        .filter(Boolean);
    if (!reachableIntervals.length)
        return null;
    const x = reachableIntervals
        .map(interval => Math.max(interval.left, Math.min(interval.right, circle.origin.x)))
        .sort((a, b) => Math.abs(a - circle.origin.x) - Math.abs(b - circle.origin.x) || a - b)[0];
    return Object.freeze({
        x,
        y: surface.topY,
    });
}

function intersectTopIntervalWithCircle(interval, topY, circle) {
    const dy = topY - circle.origin.y;
    if (Math.abs(dy) > circle.radius + REACH_EPSILON)
        return null;
    const horizontalReach = Math.sqrt(Math.max(0, circle.radius ** 2 - dy ** 2));
    const left = Math.max(interval.left, circle.origin.x - horizontalReach);
    const right = Math.min(interval.right, circle.origin.x + horizontalReach);
    if (right + REACH_EPSILON < left)
        return null;
    return Object.freeze({ left, right });
}

function unblockedTopIntervals(surface) {
    let intervals = [{
        left: surface.rect.x,
        right: surface.rect.x + surface.rect.width,
    }];
    for (const blocked of surface.blockedTopIntervals || []) {
        intervals = intervals.flatMap(interval => subtractInterval(interval, blocked));
    }
    return intervals.filter(interval => interval.right >= interval.left && !surfaceTopBlockedAt(surface, interval.left) && !surfaceTopBlockedAt(surface, interval.right));
}

function subtractInterval(interval, blocked) {
    if (blocked.right < interval.left || blocked.left > interval.right)
        return [interval];
    const result = [];
    if (blocked.left > interval.left)
        result.push({ left: interval.left, right: blocked.left - 1 });
    if (blocked.right < interval.right)
        result.push({ left: blocked.right + 1, right: interval.right });
    return result;
}

function flightTicksForDistance(distance, upwardDistance) {
    return Math.max(
        MIN_FLIGHT_TICKS,
        Math.min(MAX_FLIGHT_TICKS, Math.round(6 + distance / 16 + upwardDistance / 24))
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

function roundVelocity(value) {
    return Math.round(value * 1000) / 1000;
}
