export const Direction = Object.freeze({
    LEFT: -1,
    RIGHT: 1,
});

export const PlannerContext = Object.freeze({
    GROUND: 'ground',
});

export const DecisionType = Object.freeze({
    WALK: 'walk',
    FLIP_AT_WALL: 'flip-at-wall',
});

export const ActionId = Object.freeze({
    WALK: 'ground.walk',
    FLIP_AT_WALL: 'wall.flip',
});

export const ActionMode = Object.freeze({
    INSTANT: 'instant',
});
