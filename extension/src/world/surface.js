import { freezeRect } from './screen.js';

export const SurfaceKind = Object.freeze({
    GROUND: 'ground',
    PLATFORM: 'platform',
});

export function createGroundSurface(screen) {
    const rect = freezeRect({
        x: screen.x,
        y: screen.y + screen.height,
        width: screen.width,
        height: 0,
    });
    return createSurface({
        id: 'ground',
        kind: SurfaceKind.GROUND,
        rect,
        topY: rect.y,
        walkable: true,
        source: 'screen',
    });
}

export function createPlatformSurface(input) {
    const rect = freezeRect(input.rect);
    return createSurface({
        id: input.id,
        kind: SurfaceKind.PLATFORM,
        rect,
        topY: rect.y,
        walkable: input.walkable !== false,
        source: input.source || 'window',
    });
}

export function createSurface(input) {
    return Object.freeze({
        id: String(input.id),
        kind: input.kind,
        rect: freezeRect(input.rect),
        topY: Number.isFinite(input.topY) ? input.topY : input.rect.y,
        walkable: input.walkable !== false,
        source: input.source || 'unknown',
    });
}
