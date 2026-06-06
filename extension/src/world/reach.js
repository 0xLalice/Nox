import {
    JUMP_IMPULSE_VELOCITY,
    JUMP_HORIZONTAL_SPEED,
    JUMP_REACH_SIMULATION_TICKS,
    JUMP_RECEPTION_TICKS,
    JUMP_TAKEOFF_TICKS,
    JUMP_TRAJECTORY_GRAVITY,
    JumpAnimationVariant,
} from '../core/constants.js';
import { startAirborne, stepAirborne } from '../core/physics.js';

const MIN_HORIZONTAL_VELOCITY = 0.4;

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
    const attempts = [];
    for (const launchVelocity of launchVelocities(body, config)) {
        const attempt = simulateBallisticJump(world, body, config, surface, launchVelocity);
        if (attempt)
            attempts.push(candidateForAttempt(body, support, surface, animationVariant, launchVelocity, attempt));
    }
    attempts.sort(compareCandidates);
    return attempts[0] || null;
}

function candidateForAttempt(body, support, surface, animationVariant, launchVelocity, attempt) {
    const horizontalDistance = Math.abs(attempt.body.x - body.x);
    const upwardDistance = Math.max(0, support.topY - surface.topY);
    const downwardDistance = Math.max(0, surface.topY - support.topY);
    const kind = upwardDistance > 0 ? 'up' : downwardDistance > 0 ? 'down' : 'level';
    return Object.freeze({
        targetSurfaceId: surface.id,
        kind,
        landingX: attempt.body.x,
        horizontalDistance,
        direction: launchVelocity.x >= 0 ? 1 : -1,
        launchVelocity,
        animationVariant,
        airTicks: attempt.airTicks,
        animationTicks: JUMP_TAKEOFF_TICKS + attempt.airTicks + JUMP_RECEPTION_TICKS,
        fatigueCost: jumpFatigueCost(horizontalDistance, upwardDistance, downwardDistance),
    });
}

function launchVelocities(body, config) {
    const speeds = uniqueNumbers([
        Math.abs(body.velocityX || 0),
        config.walkSpeed,
        JUMP_HORIZONTAL_SPEED / 2,
        JUMP_HORIZONTAL_SPEED,
    ]).filter(speed => speed >= MIN_HORIZONTAL_VELOCITY && speed <= JUMP_HORIZONTAL_SPEED);
    const preferredDirection = body.direction || 1;
    const values = [];
    if (Math.abs(body.velocityX || 0) >= MIN_HORIZONTAL_VELOCITY)
        values.push(body.velocityX);
    for (const direction of uniqueNumbers([preferredDirection, -preferredDirection, 1, -1])) {
        for (const speed of speeds)
            values.push(direction * speed);
    }
    return uniqueNumbers(values).map(velocityX => Object.freeze({
        x: velocityX,
        y: JUMP_IMPULSE_VELOCITY,
    }));
}

function simulateBallisticJump(world, body, config, targetSurface, launchVelocity) {
    let previous = startAirborne(world.screen, body, launchVelocity).body;
    const trajectoryConfig = jumpConfig(config);
    for (let tick = 1; tick <= JUMP_REACH_SIMULATION_TICKS; tick++) {
        const update = stepAirborne(world.screen, previous, trajectoryConfig, world);
        if (update.landed) {
            if (update.support?.surfaceId !== targetSurface.id)
                return null;
            return Object.freeze({
                body: update.body,
                support: update.support,
                airTicks: tick,
            });
        }
        previous = update.body;
    }
    return null;
}

function jumpFatigueCost(horizontalDistance, upwardDistance, downwardDistance) {
    return Math.round((4 + horizontalDistance * 0.025 + upwardDistance * 0.07 + downwardDistance * 0.008) * 10) / 10;
}

function compareCandidates(a, b) {
    return a.fatigueCost - b.fatigueCost
        || a.horizontalDistance - b.horizontalDistance
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
