export function filterOccludedPlatforms(platforms) {
    const occluders = platforms.filter(isOccluder);
    return withTopOcclusionIntervals(platforms.filter(platform => !isHiddenByHigherOccluder(platform, occluders)));
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

function withTopOcclusionIntervals(platforms) {
    return platforms.map(platform => Object.freeze({
        ...platform,
        blockedTopIntervals: blockedTopIntervalsFor(platform, platforms),
    }));
}

function blockedTopIntervalsFor(platform, platforms) {
    const intervals = platforms
        .filter(other => other !== platform && isHigherThan(other, platform))
        .filter(other => rectCrossesY(other.rect, platform.rect.y))
        .map(other => horizontalIntersection(platform.rect, other.rect))
        .filter(interval => interval && interval.right > interval.left)
        .sort((a, b) => a.left - b.left || a.right - b.right);
    return Object.freeze(mergeIntervals(intervals).map(interval => Object.freeze(interval)));
}

function rectCrossesY(rect, y) {
    return rect.y <= y && rect.y + rect.height >= y;
}

function horizontalIntersection(a, b) {
    const left = Math.max(a.x, b.x);
    const right = Math.min(a.x + a.width, b.x + b.width);
    if (right <= left)
        return null;
    return Object.freeze({ left, right });
}

function mergeIntervals(intervals) {
    const merged = [];
    for (const interval of intervals) {
        const previous = merged[merged.length - 1];
        if (previous && interval.left <= previous.right) {
            previous.right = Math.max(previous.right, interval.right);
            continue;
        }
        merged.push({ ...interval });
    }
    return merged;
}
