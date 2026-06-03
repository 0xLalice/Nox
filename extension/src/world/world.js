import { createScreenRect } from './screen.js';
import { createGroundSurface, createPlatformSurface } from './surface.js';

export function createWorldSnapshot(screenInput, platformInputs = [], tickId = 0) {
    const screen = createScreenRect(screenInput);
    const ground = createGroundSurface(screen);
    const platforms = platformInputs
        .filter(isUsablePlatformInput)
        .map(createPlatformSurface)
        .filter(surface => surface.walkable && surface.rect.width > 0);
    const surfaces = Object.freeze([...platforms, ground]);
    return Object.freeze({
        screen,
        ground,
        surfaces,
        tickId,
    });
}

export function findSurface(world, surfaceId) {
    return world?.surfaces?.find(surface => surface.id === surfaceId) || null;
}

function isUsablePlatformInput(input) {
    return input?.usableAsPlatform !== false && input?.visible !== false && input?.rect;
}
