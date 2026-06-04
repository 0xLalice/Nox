export function createScreenRect(screen) {
    return freezeRect({
        x: finiteOr(screen?.x, 0),
        y: finiteOr(screen?.y, 0),
        width: Math.max(1, finiteOr(screen?.width, 1)),
        height: Math.max(1, finiteOr(screen?.height, 1)),
    });
}

export function freezeRect(rect) {
    return Object.freeze({
        x: finiteOr(rect?.x, 0),
        y: finiteOr(rect?.y, 0),
        width: Math.max(0, finiteOr(rect?.width, 0)),
        height: Math.max(0, finiteOr(rect?.height, 0)),
    });
}

function finiteOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}
