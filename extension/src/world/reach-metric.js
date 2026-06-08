export function jumpReachOrigin(body, support) {
    return Object.freeze({
        x: body.x + body.width / 2,
        y: support.topY,
    });
}

export function jumpReachTarget(body, landingX, surface) {
    return Object.freeze({
        x: landingX + body.width / 2,
        y: surface.topY,
    });
}

export function jumpReachMetric(origin, target) {
    return Object.freeze({
        horizontalDistance: Math.abs(target.x - origin.x),
        upwardDistance: Math.max(0, origin.y - target.y),
        distance: Math.hypot(target.x - origin.x, target.y - origin.y),
    });
}
