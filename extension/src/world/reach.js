import {
    JUMP_AIRBORNE_TICKS,
    JUMP_CONTACT_FRAME,
    JUMP_RECEPTION_TICKS,
    JUMP_TRAJECTORY_GRAVITY,
} from '../core/constants.js';
import { startAirborne, stepAirborneTrajectory } from '../core/physics.js';
import { supportAtBody } from './support.js';

const MAX_HORIZONTAL_VELOCITY = 28;
const MIN_HORIZONTAL_VELOCITY = 0.4;
const MAX_VERTICAL_VELOCITY = 18;
const CONTACT_SETTLE_PIXELS = 0.5;

export function reachableJumps(world, body, support, config, options = {}) {
    if (!world || !body || !support)
        return [];
    const candidates = [];
    for (const surface of world.surfaces) {
        if (!surface.walkable || surface.id === support.surfaceId)
            continue;
        const target = bestCandidateForSurface(world, body, support, config, surface, options);
        if (target)
            candidates.push(target);
    }
    return candidates.sort(compareCandidates);
}

export function affordableJumpCandidates(candidates, fatigue, minFatigue) {
    return candidates.filter(candidate => fatigue >= minFatigue && fatigue - candidate.fatigueCost >= minFatigue);
}

function bestCandidateForSurface(world, body, support, config, surface, options) {
    const landingXs = landingBodyXs(body, surface);
    const attempts = [];
    for (const landingX of landingXs) {
        const horizontalDistance = landingX - body.x;
        if (Math.abs(horizontalDistance) < MIN_HORIZONTAL_VELOCITY)
            continue;
        const direction = horizontalDistance > 0 ? 1 : -1;
        const launchVelocity = launchVelocityForContact(body, surface, landingX, config);
        if (!launchVelocity)
            continue;
        const attempt = simulateJumpContact(world, body, config, surface, launchVelocity);
        if (!attempt)
            continue;
        attempts.push(candidateForAttempt(body, support, surface, landingX, direction, attempt));
    }
    attempts.sort(compareCandidates);
    return attempts[0] || null;
}

function landingBodyXs(body, surface) {
    const minX = surface.rect.x;
    const maxX = surface.rect.x + surface.rect.width - body.width;
    if (maxX < minX)
        return [];
    const center = surface.rect.x + (surface.rect.width - body.width) / 2;
    return uniqueNumbers([
        clamp(body.x, minX, maxX),
        minX,
        maxX,
        clamp(center, minX, maxX),
        clamp(surface.rect.x + surface.rect.width * 0.25 - body.width / 2, minX, maxX),
        clamp(surface.rect.x + surface.rect.width * 0.75 - body.width / 2, minX, maxX),
    ]);
}

function launchVelocityForContact(body, surface, landingX, config) {
    const velocityX = (landingX - body.x) / JUMP_AIRBORNE_TICKS;
    if (Math.abs(velocityX) > MAX_HORIZONTAL_VELOCITY || Math.abs(velocityX) < MIN_HORIZONTAL_VELOCITY)
        return null;

    const contactY = surface.topY - body.height + CONTACT_SETTLE_PIXELS;
    const gravity = jumpConfig(config).gravity;
    const gravityDistance = gravity * JUMP_AIRBORNE_TICKS * (JUMP_AIRBORNE_TICKS + 1) / 2;
    const velocityY = (contactY - body.y - gravityDistance) / JUMP_AIRBORNE_TICKS;
    if (Math.abs(velocityY) > MAX_VERTICAL_VELOCITY)
        return null;

    return Object.freeze({ x: velocityX, y: velocityY });
}

function simulateJumpContact(world, body, config, targetSurface, launchVelocity) {
    const airborne = startAirborne(world.screen, body, launchVelocity);
    let previous = airborne.body;
    const trajectoryConfig = jumpConfig(config);
    for (let tick = 1; tick <= JUMP_AIRBORNE_TICKS; tick++)
        previous = stepAirborneTrajectory(world.screen, previous, trajectoryConfig);
    const support = supportAtBody(world, previous, targetSurface.id);
    if (support?.surfaceId !== targetSurface.id)
        return null;
    return {
        body: previous,
        launchVelocity,
        estimatedAirTicks: JUMP_AIRBORNE_TICKS,
    };
}

function candidateForAttempt(body, support, surface, landingX, direction, attempt) {
    const horizontalDistance = Math.abs(landingX - body.x);
    const upwardDistance = Math.max(0, support.topY - surface.topY);
    const downwardDistance = Math.max(0, surface.topY - support.topY);
    const kind = upwardDistance > 0 ? 'up' : downwardDistance > 0 ? 'down' : 'level';
    const fatigueCost = jumpFatigueCost(horizontalDistance, upwardDistance, downwardDistance);
    return Object.freeze({
        targetSurfaceId: surface.id,
        kind,
        landingX,
        direction,
        launchVelocity: Object.freeze({
            x: attempt.launchVelocity.x,
            y: attempt.launchVelocity.y,
        }),
        estimatedAirTicks: attempt.estimatedAirTicks,
        animationTicks: JUMP_CONTACT_FRAME + JUMP_RECEPTION_TICKS,
        expectedContactFrame: JUMP_CONTACT_FRAME,
        fatigueCost,
    });
}

function jumpFatigueCost(horizontalDistance, upwardDistance, downwardDistance) {
    return Math.round((4 + horizontalDistance * 0.025 + upwardDistance * 0.07 + downwardDistance * 0.008) * 10) / 10;
}

function compareCandidates(a, b) {
    return a.fatigueCost - b.fatigueCost
        || Math.abs(a.launchVelocity.x) - Math.abs(b.launchVelocity.x)
        || a.targetSurfaceId.localeCompare(b.targetSurfaceId);
}

function jumpConfig(config) {
    return {
        ...config,
        gravity: JUMP_TRAJECTORY_GRAVITY,
    };
}

function uniqueNumbers(values) {
    return [...new Set(values.map(value => Math.round(value * 1000) / 1000))];
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
