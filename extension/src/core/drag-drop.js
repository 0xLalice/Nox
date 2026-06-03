import { clampBodyToScreen } from './physics.js';

export function dragPreviewBody(screen, body, pointerX, pointerY, grabOffset) {
    const nextBody = {
        ...body,
        x: pointerX - grabOffset.x,
        y: pointerY - grabOffset.y,
    };
    return clampBodyToScreen(screen, nextBody);
}

export function dropDirection(dragStartX, dropX, fallbackDirection) {
    if (dropX > dragStartX)
        return 1;
    if (dropX < dragStartX)
        return -1;
    return fallbackDirection || 1;
}
