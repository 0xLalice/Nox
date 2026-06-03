export const MOVEMENT_PROFILES = Object.freeze({
    calm: Object.freeze({ walkSpeed: 3, walkFrameTicks: 4 }),
    balanced: Object.freeze({ walkSpeed: 4, walkFrameTicks: 3 }),
    snappy: Object.freeze({ walkSpeed: 5, walkFrameTicks: 2 }),
    smooth: Object.freeze({ walkSpeed: 6, walkFrameTicks: 1 }),
});

export const DEFAULT_MOVEMENT_PROFILE = 'balanced';

export function resolveMovementProfile(profileName) {
    return MOVEMENT_PROFILES[profileName] || MOVEMENT_PROFILES[DEFAULT_MOVEMENT_PROFILE];
}

export function normalizeMovementProfile(profileName) {
    return MOVEMENT_PROFILES[profileName] ? profileName : DEFAULT_MOVEMENT_PROFILE;
}
