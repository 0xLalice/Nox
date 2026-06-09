export function windowPlatformSurfaces(screen) {
    const windowActors = global.get_window_actors?.() || [];
    return windowActors
        .map((actor, index) => platformFromWindowActor(actor, index))
        .filter(platform => platform && platformIntersectsScreen(platform.rect, screen));
}

export function platformFromWindowActor(actor, index = 0) {
    const metaWindow = actor?.meta_window;
    if (!metaWindow || metaWindow.minimized)
        return null;
    const rect = metaWindow.get_frame_rect?.();
    if (!rect || rect.width < 20)
        return null;
    return Object.freeze({
        id: `window:${windowId(metaWindow, index)}`,
        rect: Object.freeze({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
        }),
        visible: actor.visible !== false,
        usableAsPlatform: true,
        source: 'window',
        stackIndex: index,
        occludesLowerWindows: isFullWindowOccluder(metaWindow),
    });
}

function windowId(metaWindow, index) {
    return metaWindow.get_stable_sequence?.()
        ?? metaWindow.get_id?.()
        ?? metaWindow.get_description?.()
        ?? index;
}

function platformIntersectsScreen(rect, screen) {
    return rect.x + rect.width > screen.x
        && rect.x < screen.x + screen.width
        && rect.y >= screen.y
        && rect.y <= screen.y + screen.height;
}

function isFullWindowOccluder(metaWindow) {
    return Boolean(metaWindow.is_fullscreen?.()
        || isFullyMaximizedFlag(metaWindow.get_maximized?.())
        || metaWindow.maximized_horizontally && metaWindow.maximized_vertically);
}

function isFullyMaximizedFlag(value) {
    return Number.isFinite(value) && (value & 1) !== 0 && (value & 2) !== 0;
}
