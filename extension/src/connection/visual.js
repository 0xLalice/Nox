export const ConnectionVisual = Object.freeze({
    CONNECTED: 'connected',
    CONNECTING: 'connecting',
    DISCONNECTED: 'disconnected',
});

export function connectionVisualState(connectionState) {
    const state = String(connectionState);
    if (state.startsWith('connected') || state === 'ready')
        return ConnectionVisual.CONNECTED;
    if (['connecting', 'hello-sent', 'certificate-verified'].includes(state))
        return ConnectionVisual.CONNECTING;
    return ConnectionVisual.DISCONNECTED;
}
