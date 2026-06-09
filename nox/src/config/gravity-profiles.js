export const GRAVITY_PROFILES = Object.freeze({
    earth: Object.freeze({ gravity: 2.4 }),
    moon: Object.freeze({ gravity: 0.45 }),
});

export const DEFAULT_GRAVITY_PROFILE = 'earth';

export function resolveGravityProfile(profileName) {
    return GRAVITY_PROFILES[profileName] || GRAVITY_PROFILES[DEFAULT_GRAVITY_PROFILE];
}

export function normalizeGravityProfile(profileName) {
    return GRAVITY_PROFILES[profileName] ? profileName : DEFAULT_GRAVITY_PROFILE;
}
