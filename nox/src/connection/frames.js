export function helloFrame(token) {
    return Object.freeze({ type: 'hello', token, version: 1 });
}

export function ackAllFrame(lastId) {
    return Object.freeze({ type: 'ack_all', lastId });
}

export function parseServerFrame(text) {
    const frame = JSON.parse(text);
    if (frame?.type === 'ready')
        return Object.freeze({ type: 'ready', queueDepth: frame.queueDepth ?? 0 });
    if (frame?.type === 'error')
        return Object.freeze({ type: 'error', code: frame.code || 'error' });
    if (frame?.type === 'message')
        return normalizeMessageFrame(frame);
    return Object.freeze({ type: 'unknown' });
}

export function normalizeMessageFrame(frame) {
    const id = String(frame.id ?? '');
    const text = String(frame.text ?? frame.message ?? frame.body ?? '');
    if (!id || !text)
        return Object.freeze({ type: 'invalid-message' });
    return Object.freeze({
        type: 'message',
        id,
        text,
    });
}
