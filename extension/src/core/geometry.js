export function groundY(screen, body) {
    return screen.y + screen.height - body.height;
}

export function horizontalBounds(screen, body) {
    return {
        minX: screen.x,
        maxX: screen.x + screen.width - body.width,
    };
}

export function projectedX(body) {
    return body.x + body.velocityX;
}

export function clampX(x, screen, body) {
    const bounds = horizontalBounds(screen, body);
    return Math.max(bounds.minX, Math.min(bounds.maxX, x));
}

export function wallHit(body, screen) {
    const nextX = projectedX(body);
    const bounds = horizontalBounds(screen, body);
    if (body.direction > 0 && nextX >= bounds.maxX)
        return 'right';
    if (body.direction < 0 && nextX <= bounds.minX)
        return 'left';
    return null;
}
