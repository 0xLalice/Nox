import { DEFAULT_MOVEMENT_PROFILE, normalizeMovementProfile, resolveMovementProfile } from './movement-profiles.js';

export const DEFAULT_RUNTIME_CONFIG = Object.freeze({
    scalePercent: 100,
    movementProfile: DEFAULT_MOVEMENT_PROFILE,
    walkingSpeedPercent: 100,
    walkSpeed: 4,
    walkFrameTicks: 3,
});

export function readRuntimeConfig(settings) {
    return normalizeRuntimeConfig({
        scalePercent: readInt(settings, 'nox-scale-percent', DEFAULT_RUNTIME_CONFIG.scalePercent),
        movementProfile: readString(settings, 'movement-profile', DEFAULT_RUNTIME_CONFIG.movementProfile),
        walkingSpeedPercent: readInt(settings, 'walking-speed-percent', DEFAULT_RUNTIME_CONFIG.walkingSpeedPercent),
    });
}

export function normalizeRuntimeConfig(raw = {}) {
    const movementProfile = normalizeMovementProfile(raw.movementProfile || DEFAULT_RUNTIME_CONFIG.movementProfile);
    const profile = resolveMovementProfile(movementProfile);
    const scalePercent = clampInt(raw.scalePercent, 50, 200, DEFAULT_RUNTIME_CONFIG.scalePercent);
    const walkingSpeedPercent = clampInt(raw.walkingSpeedPercent, 40, 160, DEFAULT_RUNTIME_CONFIG.walkingSpeedPercent);
    return Object.freeze({
        scalePercent,
        movementProfile,
        walkingSpeedPercent,
        walkSpeed: profile.walkSpeed * walkingSpeedPercent / 100,
        walkFrameTicks: profile.walkFrameTicks,
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
