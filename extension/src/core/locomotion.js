export function createLocomotion() {
    return {
        walkRampTick: 0,
    };
}

export function walkRampSpeed(config, rampTick) {
    const ticks = Math.max(1, config.walkAccelerationTicks);
    const factor = config.walkStartSpeedFactor +
        (1 - config.walkStartSpeedFactor) * Math.min(Math.max(rampTick, 0), ticks) / ticks;
    return config.walkSpeed * factor;
}

export function nextWalkRampTick(config, rampTick) {
    return Math.min(Math.max(rampTick, 0) + 1, Math.max(1, config.walkAccelerationTicks));
}
