export const ConnectionVisual = Object.freeze({
    CONNECTED: 'connected',
    CONNECTING: 'connecting',
    DISCONNECTED: 'disconnected',
});

export const CONNECTION_DESATURATE_EFFECT = 'nox-v3-connection-desaturate';

const FORCE_GRAYSCALE_STATES = Object.freeze([
    'missing-config',
    'manual-disconnected',
    'disconnected',
    'off',
    'insecure-url',
    'invalid-url',
    'missing-cert-fingerprint',
    'auth_failed',
    'certificate-mismatch',
    'bad-frame',
]);

export function connectionVisualState(connectionState) {
    const state = String(connectionState);
    if (state.startsWith('connected') || state === 'ready')
        return ConnectionVisual.CONNECTED;
    if (isDisconnectedState(state))
        return ConnectionVisual.DISCONNECTED;
    if (['connecting', 'hello-sent', 'certificate-verified'].includes(state))
        return ConnectionVisual.CONNECTING;
    return ConnectionVisual.CONNECTED;
}

export function connectionIconVisualPlan(connectionState) {
    const visual = connectionVisualState(connectionState);
    const disconnected = visual === ConnectionVisual.DISCONNECTED;
    return Object.freeze({
        visual,
        opacity: disconnected ? 150 : 255,
        forceGrayscale: disconnected,
        clearForcedGrayscale: !disconnected,
        effectName: CONNECTION_DESATURATE_EFFECT,
    });
}

function isDisconnectedState(state) {
    return FORCE_GRAYSCALE_STATES.includes(state) ||
        state.startsWith('exception:') ||
        state.startsWith('error');
}
