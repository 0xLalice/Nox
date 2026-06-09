export const Direction = Object.freeze({
    LEFT: -1,
    RIGHT: 1,
});

export const PlannerContext = Object.freeze({
    GROUND: 'ground',
    RUNNING: 'running',
    AIRBORNE: 'airborne',
    DRAGGING: 'dragging',
});

export const MotionMode = Object.freeze({
    GROUNDED: 'grounded',
    RUNNING: 'running',
    AIRBORNE: 'airborne',
    DRAGGING: 'dragging',
});

export const DecisionType = Object.freeze({
    WALK: 'walk',
    RUN: 'run',
    FLIP_AT_WALL: 'flip-at-wall',
});

export const ActionId = Object.freeze({
    WALK: 'ground.walk',
    RUN: 'ground.run',
    FLIP_AT_WALL: 'wall.flip',
});

export const ActionMode = Object.freeze({
    INSTANT: 'instant',
    ACTIVE: 'active',
});
