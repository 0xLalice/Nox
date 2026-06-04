export function filterOccludedPlatforms(platforms) {
    const occluders = platforms.filter(isOccluder);
    return platforms.filter(platform => !isHiddenByHigherOccluder(platform, occluders));
}

export function isOccluder(platform) {
    return platform.visible !== false && platform.occludesLowerWindows === true;
}

export function isHiddenByHigherOccluder(platform, occluders) {
    return occluders.some(occluder => isHigherThan(occluder, platform) && rectContains(occluder.rect, platform.rect));
}

function isHigherThan(occluder, platform) {
    return Number.isFinite(occluder.stackIndex)
        && Number.isFinite(platform.stackIndex)
        && occluder.stackIndex > platform.stackIndex;
}

function rectContains(outer, inner) {
    return inner.x >= outer.x
        && inner.y >= outer.y
        && inner.x + inner.width <= outer.x + outer.width
        && inner.y + inner.height <= outer.y + outer.height;
}
