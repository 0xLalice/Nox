export function createLocomotion() {
    return {
        walkRampTick: 0,
        runRampTick: 0,
    };
}

export function walkRampSpeed(config, rampTick) {
    return rampSpeed(config.walkSpeed, config.walkAccelerationTicks, config.walkStartSpeedFactor, rampTick);
}

export function nextWalkRampTick(config, rampTick) {
    return Math.min(Math.max(rampTick, 0) + 1, Math.max(1, config.walkAccelerationTicks));
}

export function runRampSpeed(config, rampTick) {
    return rampSpeed(config.runSpeed, config.walkAccelerationTicks, config.walkStartSpeedFactor, rampTick);
}

export function nextRunRampTick(config, rampTick) {
    return Math.min(Math.max(rampTick, 0) + 1, Math.max(1, config.walkAccelerationTicks));
}

function rampSpeed(maxSpeed, accelerationTicks, startSpeedFactor, rampTick) {
    const ticks = Math.max(1, accelerationTicks);
    const factor = startSpeedFactor +
        (1 - startSpeedFactor) * Math.min(Math.max(rampTick, 0), ticks) / ticks;
    return maxSpeed * factor;
}
