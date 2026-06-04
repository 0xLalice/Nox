import { clampBodyToScreen } from './physics.js';

export const DRAG_START_THRESHOLD_PX = 6;

export function exceedsDragThreshold(startX, startY, pointerX, pointerY, threshold = DRAG_START_THRESHOLD_PX) {
    const dx = pointerX - startX;
    const dy = pointerY - startY;
    return dx * dx + dy * dy >= threshold * threshold;
}

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
