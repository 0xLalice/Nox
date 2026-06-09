export function distanceToSupportLeftEdge(body, support) {
    return body.x - support.leftX;
}

export function distanceToSupportRightEdge(body, support) {
    return support.rightX - (body.x + body.width);
}

export function isNearSupportEdge(body, support, inset) {
    return distanceToSupportLeftEdge(body, support) <= inset
        || distanceToSupportRightEdge(body, support) <= inset;
}

export function projectedLeavesSupport(body, support, velocityX = body.velocityX || 0) {
    const nextLeft = body.x + velocityX;
    const nextRight = nextLeft + body.width;
    if (velocityX < 0)
        return nextLeft < support.leftX;
    if (velocityX > 0)
        return nextRight > support.rightX;
    return false;
}
