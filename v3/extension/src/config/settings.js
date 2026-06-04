import { resolveMovementProfile } from './movement-profiles.js';
import { DEFAULT_GRAVITY_PROFILE, normalizeGravityProfile, resolveGravityProfile } from './gravity-profiles.js';
import { RUN_SPEED_MULTIPLIER } from '../core/constants.js';

const FIXED_SCALE_PERCENT = 32;
const FIXED_MOVEMENT_PROFILE = 'smooth';
const FIXED_WALKING_SPEED_PERCENT = 42;
const FIXED_RUN_DURATION_TICKS = 55;
const FIXED_RUN_SPEED_PERCENT = 120;

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
    gravity: 1.2,
    maxFallSpeed: 24,
});

export function readRuntimeConfig(settings) {
    return normalizeRuntimeConfig({
        gravityProfile: readString(settings, 'gravity-profile', DEFAULT_RUNTIME_CONFIG.gravityProfile),
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
    });
}

function readString(settings, key, fallback) {
    try {
        return settings.get_string(key);
    } catch (e) {
        return fallback;
    }
}
