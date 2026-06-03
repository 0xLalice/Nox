import { DEFAULT_MOVEMENT_PROFILE, normalizeMovementProfile, resolveMovementProfile } from './movement-profiles.js';
import { DEFAULT_GRAVITY_PROFILE, normalizeGravityProfile, resolveGravityProfile } from './gravity-profiles.js';

export const DEFAULT_RUNTIME_CONFIG = Object.freeze({
    scalePercent: 100,
    movementProfile: DEFAULT_MOVEMENT_PROFILE,
    gravityProfile: DEFAULT_GRAVITY_PROFILE,
    walkingSpeedPercent: 100,
    walkSpeed: 4,
    walkFrameTicks: 3,
    walkAccelerationTicks: 18,
    walkStartSpeedFactor: 0.35,
    gravity: 1.2,
    maxFallSpeed: 24,
});

export function readRuntimeConfig(settings) {
    return normalizeRuntimeConfig({
        scalePercent: readInt(settings, 'nox-scale-percent', DEFAULT_RUNTIME_CONFIG.scalePercent),
        movementProfile: readString(settings, 'movement-profile', DEFAULT_RUNTIME_CONFIG.movementProfile),
        gravityProfile: readString(settings, 'gravity-profile', DEFAULT_RUNTIME_CONFIG.gravityProfile),
        walkingSpeedPercent: readInt(settings, 'walking-speed-percent', DEFAULT_RUNTIME_CONFIG.walkingSpeedPercent),
    });
}

export function normalizeRuntimeConfig(raw = {}) {
    const movementProfile = normalizeMovementProfile(raw.movementProfile || DEFAULT_RUNTIME_CONFIG.movementProfile);
    const profile = resolveMovementProfile(movementProfile);
    const gravityProfile = normalizeGravityProfile(raw.gravityProfile || DEFAULT_RUNTIME_CONFIG.gravityProfile);
    const gravity = resolveGravityProfile(gravityProfile);
    const scalePercent = clampInt(raw.scalePercent, 20, 200, DEFAULT_RUNTIME_CONFIG.scalePercent);
    const walkingSpeedPercent = clampInt(raw.walkingSpeedPercent, 40, 160, DEFAULT_RUNTIME_CONFIG.walkingSpeedPercent);
    return Object.freeze({
        scalePercent,
        movementProfile,
        gravityProfile,
        walkingSpeedPercent,
        walkSpeed: profile.walkSpeed * walkingSpeedPercent / 100,
        walkFrameTicks: profile.walkFrameTicks,
        walkAccelerationTicks: DEFAULT_RUNTIME_CONFIG.walkAccelerationTicks,
        walkStartSpeedFactor: DEFAULT_RUNTIME_CONFIG.walkStartSpeedFactor,
        gravity: gravity.gravity,
        maxFallSpeed: DEFAULT_RUNTIME_CONFIG.maxFallSpeed,
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

function clampInt(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric))
        return fallback;
    return Math.max(min, Math.min(max, Math.round(numeric)));
}
