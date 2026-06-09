const MIN_BUBBLE_WIDTH = 220;
const MAX_BUBBLE_WIDTH = 420;
const HORIZONTAL_MARGIN = 8;
const VERTICAL_MARGIN = 8;
const TEXT_LINE_HEIGHT = 18;
const CHARS_PER_LINE_AT_MIN_WIDTH = 28;
const BUTTON_HEIGHT = 34;
const BUBBLE_PADDING = 16;
const GAP = 8;

export function bubbleLayout(screen, body, text = '') {
    const width = bubbleWidth(screen, text);
    const height = bubbleHeight(width, text);
    const preferredX = body.x + body.width / 2 - width / 2;
    const preferredY = body.y - height - GAP;
    const belowY = body.y + body.height + GAP;
    const x = clamp(preferredX, screen.x + HORIZONTAL_MARGIN, screen.x + screen.width - width - HORIZONTAL_MARGIN);
    const y = preferredY >= screen.y
        ? preferredY
        : clamp(belowY, screen.y + VERTICAL_MARGIN, screen.y + screen.height - height - VERTICAL_MARGIN);
    return Object.freeze({
        x,
        y,
        width,
        height,
    });
}

export function bubbleTextWidth(layout) {
    return Math.max(1, layout.width - BUBBLE_PADDING);
}

function bubbleWidth(screen, text) {
    const screenBound = Math.max(MIN_BUBBLE_WIDTH, screen.width - HORIZONTAL_MARGIN * 2);
    const natural = MIN_BUBBLE_WIDTH + Math.min(200, Math.max(0, String(text).length - 60) * 2);
    return Math.min(MAX_BUBBLE_WIDTH, screenBound, natural);
}

function bubbleHeight(width, text) {
    const charsPerLine = Math.max(12, Math.floor(CHARS_PER_LINE_AT_MIN_WIDTH * width / MIN_BUBBLE_WIDTH));
    const lines = Math.max(1, Math.ceil(String(text).length / charsPerLine));
    return BUBBLE_PADDING + BUTTON_HEIGHT + lines * TEXT_LINE_HEIGHT;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
