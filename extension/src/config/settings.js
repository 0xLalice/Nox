import { resolveMovementProfile } from './movement-profiles.js';
import { DEFAULT_GRAVITY_PROFILE, normalizeGravityProfile, resolveGravityProfile } from './gravity-profiles.js';
import { JUMP_HORIZONTAL_SPEED, JUMP_IMPULSE_VELOCITY, RUN_SPEED_MULTIPLIER } from '../core/constants.js';

const FIXED_SCALE_PERCENT = 32;
const FIXED_MOVEMENT_PROFILE = 'smooth';
const FIXED_WALKING_SPEED_PERCENT = 42;
const FIXED_RUN_DURATION_TICKS = 55;
const FIXED_RUN_SPEED_PERCENT = 120;
const DEFAULT_JUMP_HEIGHT_PERCENT = 100;
const DEFAULT_JUMP_HORIZONTAL_PERCENT = 100;

export const DEFAULT_RUNTIME_CONFIG = Object.freeze({
    scalePercent: FIXED_SCALE_PERCENT,
    movementProfile: FIXED_MOVEMENT_PROFILE,
    gravityProfile: DEFAULT_GRAVITY_PROFILE,
    walkingSpeedPercent: FIXED_WALKING_SPEED_PERCENT,
    runSpeedPercent: FIXED_RUN_SPEED_PERCENT,
    runDurationTicks: FIXED_RUN_DURATION_TICKS,
    walkSpeed: 6 * FIXED_WALKING_SPEED_PERCENT / 100,
    runSpeed: 6 * FIXED_WALKING_SPEED_PERCENT / 100 * RUN_SPEED_MULTIPLIER * FIXED_RUN_SPEED_PERCENT / 100,
    walkFrameTicks: 1,
    walkAccelerationTicks: 18,
    walkStartSpeedFactor: 0.35,
    gravity: 2.4,
    maxFallSpeed: 24,
    jumpHeightPercent: DEFAULT_JUMP_HEIGHT_PERCENT,
    jumpHorizontalPercent: DEFAULT_JUMP_HORIZONTAL_PERCENT,
    jumpImpulseVelocity: JUMP_IMPULSE_VELOCITY,
    jumpHorizontalSpeed: JUMP_HORIZONTAL_SPEED,
});

export function readRuntimeConfig(settings) {
    return normalizeRuntimeConfig({
        gravityProfile: readString(settings, 'gravity-profile', DEFAULT_RUNTIME_CONFIG.gravityProfile),
        jumpHeightPercent: readInt(settings, 'jump-height-percent', DEFAULT_RUNTIME_CONFIG.jumpHeightPercent),
        jumpHorizontalPercent: readInt(settings, 'jump-horizontal-percent', DEFAULT_RUNTIME_CONFIG.jumpHorizontalPercent),
    });
}

export function normalizeRuntimeConfig(raw = {}) {
    const movementProfile = FIXED_MOVEMENT_PROFILE;
    const profile = resolveMovementProfile(movementProfile);
    const gravityProfile = normalizeGravityProfile(raw.gravityProfile || DEFAULT_RUNTIME_CONFIG.gravityProfile);
    const gravity = resolveGravityProfile(gravityProfile);
    const scalePercent = FIXED_SCALE_PERCENT;
    const walkingSpeedPercent = FIXED_WALKING_SPEED_PERCENT;
    const runSpeedPercent = FIXED_RUN_SPEED_PERCENT;
    const runDurationTicks = FIXED_RUN_DURATION_TICKS;
    const walkSpeed = profile.walkSpeed * walkingSpeedPercent / 100;
    const jumpHeightPercent = clampPercent(raw.jumpHeightPercent, 50, 180, DEFAULT_RUNTIME_CONFIG.jumpHeightPercent);
    const jumpHorizontalPercent = clampPercent(raw.jumpHorizontalPercent, 50, 220, DEFAULT_RUNTIME_CONFIG.jumpHorizontalPercent);
    return Object.freeze({
        scalePercent,
        movementProfile,
        gravityProfile,
        walkingSpeedPercent,
        runSpeedPercent,
        runDurationTicks,
        walkSpeed,
        runSpeed: walkSpeed * RUN_SPEED_MULTIPLIER * runSpeedPercent / 100,
        walkFrameTicks: profile.walkFrameTicks,
        walkAccelerationTicks: DEFAULT_RUNTIME_CONFIG.walkAccelerationTicks,
        walkStartSpeedFactor: DEFAULT_RUNTIME_CONFIG.walkStartSpeedFactor,
        gravity: gravity.gravity,
        maxFallSpeed: DEFAULT_RUNTIME_CONFIG.maxFallSpeed,
        jumpHeightPercent,
        jumpHorizontalPercent,
        jumpImpulseVelocity: JUMP_IMPULSE_VELOCITY * jumpHeightPercent / 100,
        jumpHorizontalSpeed: JUMP_HORIZONTAL_SPEED * jumpHorizontalPercent / 100,
    });
}

function readInt(settings, key, fallback) {
    try {
        return settings.get_int(key);
    } catch (e) {
        return fallback;
    }
}

function readString(settings, key, fallback) {
    try {
        return settings.get_string(key);
    } catch (e) {
        return fallback;
    }
}

function clampPercent(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
}
