import { findSurface } from './world.js';

export const SUPPORT_CONTACT_TOLERANCE = 2;
export const SUPPORT_MIN_OVERLAP = 1;
export const SUPPORT_FOOT_EDGE_TOLERANCE = 2;

export function bodyBottomY(body) {
    return body.y + body.height;
}

export function horizontalOverlap(body, surface) {
    const left = Math.max(body.x, surface.rect.x);
    const right = Math.min(body.x + body.width, surface.rect.x + surface.rect.width);
    return Math.max(0, right - left);
}

export function feetOverlapSurface(body, surface) {
    if (surface.kind === 'ground')
        return horizontalOverlap(body, surface) >= SUPPORT_MIN_OVERLAP;
    const footX = body.x + body.width / 2;
    return footX >= surface.rect.x - SUPPORT_FOOT_EDGE_TOLERANCE
        && footX <= surface.rect.x + surface.rect.width + SUPPORT_FOOT_EDGE_TOLERANCE
        && !surfaceTopBlockedAt(surface, footX);
}

export function surfaceTopBlockedAt(surface, x) {
    return (surface.blockedTopIntervals || []).some(interval => x >= interval.left && x <= interval.right);
}

export function createSupportContact(surface, body, valid = true) {
    return Object.freeze({
        surfaceId: surface.id,
        kind: surface.kind,
        topY: surface.topY,
        leftX: surface.rect.x,
        rightX: surface.rect.x + surface.rect.width,
        rect: surface.rect,
        footX: body.x + body.width / 2,
        bodyBottomY: bodyBottomY(body),
        valid,
        edge: Object.freeze({
            leftDistance: body.x - surface.rect.x,
            rightDistance: surface.rect.x + surface.rect.width - (body.x + body.width),
        }),
    });
}

export function supportAtBody(world, body, preferredSurfaceId = null) {
    if (preferredSurfaceId) {
        const preferred = findSurface(world, preferredSurfaceId);
        if (preferred && preferred.walkable && feetOverlapSurface(body, preferred))
            return createSupportContact(preferred, body);
    }

    const bottomY = bodyBottomY(body);
    const candidates = world.surfaces
        .filter(surface => surface.walkable)
        .filter(surface => feetOverlapSurface(body, surface))
        .filter(surface => Math.abs(bottomY - surface.topY) <= SUPPORT_CONTACT_TOLERANCE)
        .sort((a, b) => a.topY - b.topY);
    if (!candidates.length)
        return null;
    return createSupportContact(candidates[0], body);
}

export function revalidateSupport(world, body, currentSupport) {
    if (!currentSupport)
        return supportAtBody(world, body);
    const preferred = findSurface(world, currentSupport.surfaceId);
    if (!preferred || !preferred.walkable || !feetOverlapSurface(body, preferred))
        return null;
    if (currentSupport.kind !== 'ground' && !sameSupportGeometry(preferred, currentSupport))
        return null;
    return createSupportContact(preferred, body);
}

function sameSupportGeometry(surface, support) {
    return surface.topY === support.topY
        && surface.rect.x === support.rect.x
        && surface.rect.y === support.rect.y
        && surface.rect.width === support.rect.width
        && surface.rect.height === support.rect.height;
}

export function bodyOnSupport(body, support) {
    if (!support)
        return body;
    return Object.freeze({
        ...body,
        y: support.topY - body.height,
        velocityY: 0,
    });
}

export function landingSupport(world, previousBody, nextBody) {
    if (nextBody.velocityY < 0)
        return null;
    const previousBottom = bodyBottomY(previousBody);
    const nextBottom = bodyBottomY(nextBody);
    const candidates = world.surfaces
        .filter(surface => surface.walkable)
        .filter(surface => feetOverlapSurface(nextBody, surface))
        .filter(surface => previousBottom <= surface.topY && nextBottom >= surface.topY)
        .sort((a, b) => a.topY - b.topY);
    if (!candidates.length)
        return null;
    return createSupportContact(candidates[0], nextBody);
}
