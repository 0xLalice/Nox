const BUBBLE_WIDTH = 220;
const BUBBLE_HEIGHT = 72;
const GAP = 8;

export function bubbleLayout(screen, body) {
    const preferredX = body.x + body.width / 2 - BUBBLE_WIDTH / 2;
    const preferredY = body.y - BUBBLE_HEIGHT - GAP;
    const belowY = body.y + body.height + GAP;
    const x = clamp(preferredX, screen.x, screen.x + screen.width - BUBBLE_WIDTH);
    const y = preferredY >= screen.y
        ? preferredY
        : clamp(belowY, screen.y, screen.y + screen.height - BUBBLE_HEIGHT);
    return Object.freeze({
        x,
        y,
        width: BUBBLE_WIDTH,
        height: BUBBLE_HEIGHT,
    });
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
