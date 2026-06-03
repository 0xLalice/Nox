import { groundY, clampX } from './geometry.js';
import { walkRampSpeed } from './locomotion.js';

export function dragPreviewBody(screen, body, pointerX, pointerY, grabOffset) {
    const nextBody = {
        ...body,
        x: pointerX - grabOffset.x,
        y: pointerY - grabOffset.y,
    };
    return Object.freeze({
        ...nextBody,
        x: clampX(nextBody.x, screen, nextBody),
    });
}

export function dropBodyOnGround(screen, body, config, dragStartX, dropX) {
    const direction = dropDirection(dragStartX, dropX, body.direction);
    const grounded = {
        ...body,
        direction,
    };
    return Object.freeze({
        ...grounded,
        x: clampX(grounded.x, screen, grounded),
        y: groundY(screen, grounded),
        velocityX: direction * walkRampSpeed(config, 0),
    });
}

export function dropDirection(dragStartX, dropX, fallbackDirection) {
    if (dropX > dragStartX)
        return 1;
    if (dropX < dragStartX)
        return -1;
    return fallbackDirection || 1;
}
