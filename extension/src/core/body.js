import { BODY_HEIGHT, BODY_WIDTH } from './constants.js';
import { Direction } from './types.js';

export function createBody(screen, config) {
    return {
        x: screen.x,
        y: screen.y + screen.height - scaledHeight(config),
        width: scaledWidth(config),
        height: scaledHeight(config),
        direction: Direction.RIGHT,
        velocityX: config.walkSpeed,
        velocityY: 0,
    };
}

export function copyBody(body) {
    return { ...body };
}

export function scaledWidth(config) {
    return BODY_WIDTH * config.scalePercent / 100;
}

export function scaledHeight(config) {
    return BODY_HEIGHT * config.scalePercent / 100;
}
