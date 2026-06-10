const HEX = '0123456789ABCDEF';

export const DEFAULT_CONNECTION_CONFIG = Object.freeze({
    websocketUrl: '',
    token: '',
    certFingerprint: '',
    manualDisconnected: false,
});

export function readConnectionConfig(settings) {
    return normalizeConnectionConfig({
        websocketUrl: readString(settings, 'websocket-url', DEFAULT_CONNECTION_CONFIG.websocketUrl),
        token: readString(settings, 'token', DEFAULT_CONNECTION_CONFIG.token),
        certFingerprint: readString(settings, 'cert-fingerprint', DEFAULT_CONNECTION_CONFIG.certFingerprint),
        manualDisconnected: readBoolean(settings, 'manual-disconnected', DEFAULT_CONNECTION_CONFIG.manualDisconnected),
    });
}

export function normalizeConnectionConfig(raw = {}) {
    return Object.freeze({
        websocketUrl: String(raw.websocketUrl ?? '').trim(),
        token: String(raw.token ?? '').trim(),
        certFingerprint: normalizeFingerprint(String(raw.certFingerprint ?? '')),
        manualDisconnected: Boolean(raw.manualDisconnected),
    });
}

export function connectionConfigError(config) {
    if (config.manualDisconnected)
        return 'manual-disconnected';
    if (!config.websocketUrl || !config.token)
        return 'missing-config';
    if (config.websocketUrl.includes('?') || config.websocketUrl.includes('#'))
        return 'invalid-url';
    if (!config.websocketUrl.startsWith('wss://'))
        return 'insecure-url';
    if (config.certFingerprint.length !== 64)
        return 'missing-cert-fingerprint';
    return '';
}

export function normalizeFingerprint(value) {
    return value.toUpperCase().split('').filter(ch => HEX.includes(ch)).join('');
}

function readString(settings, key, fallback) {
    try {
        return settings.get_string(key);
    } catch (e) {
        return fallback;
    }
}

function readBoolean(settings, key, fallback) {
    try {
        return settings.get_boolean(key);
    } catch (e) {
        return fallback;
    }
}
