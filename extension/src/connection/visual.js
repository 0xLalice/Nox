export const ConnectionVisual = Object.freeze({
    CONNECTED: 'connected',
    CONNECTING: 'connecting',
    DISCONNECTED: 'disconnected',
});

export function connectionVisualState(connectionState) {
    if (String(connectionState).startsWith('connected'))
        return ConnectionVisual.CONNECTED;
    if (['connecting', 'hello-sent'].includes(connectionState))
        return ConnectionVisual.CONNECTING;
    return ConnectionVisual.DISCONNECTED;
}
