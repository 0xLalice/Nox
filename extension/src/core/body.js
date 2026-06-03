import { BODY_HEIGHT, BODY_WIDTH, WALK_SPEED } from './constants.js';
import { Direction } from './types.js';

export function createBody(screen) {
    return {
        x: screen.x,
        y: screen.y + screen.height - BODY_HEIGHT,
        width: BODY_WIDTH,
        height: BODY_HEIGHT,
        direction: Direction.RIGHT,
        speed: WALK_SPEED,
        velocityX: WALK_SPEED,
    };
}

export function copyBody(body) {
    return { ...body };
}
