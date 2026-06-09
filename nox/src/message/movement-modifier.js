export const MESSAGE_VISIBLE_WALK_SPEED_FACTOR = 0.35;

export function messageMovementConfig(config, messageVisible) {
    if (!messageVisible)
        return Object.freeze({ ...config });
    return Object.freeze({
        ...config,
        walkSpeed: config.walkSpeed * MESSAGE_VISIBLE_WALK_SPEED_FACTOR,
        runSpeed: config.runSpeed * MESSAGE_VISIBLE_WALK_SPEED_FACTOR,
    });
}
