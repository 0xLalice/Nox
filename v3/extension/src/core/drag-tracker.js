const SAMPLE_WINDOW_MS = 160;
const MAX_THROW_VELOCITY = 28;
const MIN_THROW_VELOCITY = 0.8;

export function createDragTracker(x, y, timeMs) {
    return {
        samples: [sample(x, y, timeMs)],
    };
}

export function recordPointerSample(tracker, x, y, timeMs) {
    const samples = [...tracker.samples, sample(x, y, timeMs)];
    const latest = samples[samples.length - 1];
    return Object.freeze({
        samples: samples.filter(item => latest.timeMs - item.timeMs <= SAMPLE_WINDOW_MS),
    });
}

export function estimateThrowVelocity(tracker, tickMs) {
    const samples = tracker.samples;
    if (samples.length < 2)
        return Object.freeze({ x: 0, y: 0 });
    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsed = Math.max(1, last.timeMs - first.timeMs);
    return Object.freeze({
        x: normalizeVelocity((last.x - first.x) / elapsed * tickMs),
        y: normalizeVelocity((last.y - first.y) / elapsed * tickMs),
    });
}

function sample(x, y, timeMs) {
    return Object.freeze({ x, y, timeMs });
}

function normalizeVelocity(value) {
    if (Math.abs(value) < MIN_THROW_VELOCITY)
        return 0;
    return Math.max(-MAX_THROW_VELOCITY, Math.min(MAX_THROW_VELOCITY, value));
}
