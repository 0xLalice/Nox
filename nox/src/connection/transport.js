import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import { ackAllFrame, helloFrame, parseServerFrame } from './frames.js';
import { connectionConfigError, normalizeFingerprint, readConnectionConfig } from './settings.js';

function createMessage(url) {
    return new Soup.Message({
        method: 'GET',
        uri: GLib.Uri.parse(url, GLib.UriFlags.NONE),
    });
}

function textFromBytes(bytes) {
    if (bytes && typeof bytes.toArray === 'function')
        return new TextDecoder('utf-8').decode(bytes.toArray());
    if (bytes && typeof bytes.get_data === 'function')
        return new TextDecoder('utf-8').decode(bytes.get_data());
    throw new Error('WebSocket payload bytes unavailable');
}

export class NoxV3Connection {
    constructor(settings, handlers = {}) {
        this.settings = settings;
        this.handlers = handlers;
        this.session = new Soup.Session();
        this.cancellable = new Gio.Cancellable();
        this.socket = null;
        this.reconnectId = 0;
        this.backoffSeconds = 1;
        this.seenIds = new Set();
        this.stopped = false;
        this.connectGeneration = 0;
    }

    start() {
        this.stopped = false;
        if (this.cancellable.is_cancelled())
            this.cancellable = new Gio.Cancellable();
        this.connectGeneration++;
        this.#connect(this.connectGeneration);
    }

    stop() {
        this.stopped = true;
        this.connectGeneration++;
        if (this.reconnectId) {
            GLib.source_remove(this.reconnectId);
            this.reconnectId = 0;
        }
        this.cancellable.cancel();
        this.#closeSocket();
    }

    ackAll(lastId) {
        return this.#send(ackAllFrame(lastId));
    }

    #connect(generation = this.connectGeneration) {
        if (this.stopped || this.cancellable.is_cancelled())
            return;
        const config = readConnectionConfig(this.settings);
        const error = connectionConfigError(config);
        if (error) {
            this.#state(error);
            if (error !== 'manual-disconnected')
                this.#scheduleReconnect();
            return;
        }

        let message;
        try {
            message = createMessage(config.websocketUrl);
        } catch (e) {
            this.#state(exceptionState(e));
            this.#scheduleReconnect();
            return;
        }

        if (config.websocketUrl.startsWith('wss://'))
            connectAcceptCertificate(message, config.certFingerprint, state => this.#state(state));

        const cancellable = this.cancellable;
        this.#state('connecting');
        try {
            this.session.websocket_connect_async(message, null, [], GLib.PRIORITY_DEFAULT, cancellable, (session, result) => {
                let socket = null;
                try {
                    socket = session.websocket_connect_finish(result);
                    if (!this.#isCurrentConnect(generation, cancellable)) {
                        closeWebSocket(socket);
                        return;
                    }
                    this.socket = socket;
                    this.seenIds = new Set();
                    this.socket.connect('message', this.#handleFrame.bind(this));
                    this.socket.connect('error', (_socket, error) => this.#state(exceptionState(error)));
                    this.socket.connect('closed', () => this.#handleClosed());
                    this.backoffSeconds = 1;
                    this.#send(helloFrame(config.token));
                    this.#state('hello-sent');
                } catch (e) {
                    if (!this.#isCurrentConnect(generation, cancellable))
                        return;
                    this.#state(exceptionState(e));
                    this.#scheduleReconnect();
                }
            });
        } catch (e) {
            this.#state(exceptionState(e));
            this.#scheduleReconnect();
        }
    }

    #handleFrame(_socket, type, bytes) {
        if (this.stopped)
            return;
        if (type !== Soup.WebsocketDataType.TEXT)
            return;
        try {
            const frame = parseServerFrame(textFromBytes(bytes));
            if (frame.type === 'ready') {
                this.#state(`connected queueDepth=${frame.queueDepth}`);
            } else if (frame.type === 'error') {
                this.#state(frame.code);
            } else if (frame.type === 'message' && !this.seenIds.has(frame.id)) {
                this.seenIds.add(frame.id);
                this.handlers.onMessage?.(frame);
            }
        } catch (e) {
            this.#state('bad-frame');
        }
    }

    #handleClosed() {
        this.socket = null;
        if (this.stopped)
            return;
        this.#state('disconnected');
        this.#scheduleReconnect();
    }

    #scheduleReconnect() {
        if (this.stopped || this.reconnectId || this.cancellable.is_cancelled())
            return;
        const delay = this.backoffSeconds;
        this.backoffSeconds = Math.min(this.backoffSeconds * 2, 60);
        this.reconnectId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, () => {
            this.reconnectId = 0;
            this.#connect(this.connectGeneration);
            return GLib.SOURCE_REMOVE;
        });
    }

    #send(frame) {
        if (!this.socket)
            return false;
        try {
            this.socket.send_text(JSON.stringify(frame));
            return true;
        } catch (e) {
            this.#handleClosed();
            return false;
        }
    }

    #state(state) {
        if (this.stopped)
            return;
        this.handlers.onState?.(state);
    }

    #isCurrentConnect(generation, cancellable) {
        return !this.stopped
            && generation === this.connectGeneration
            && cancellable === this.cancellable
            && !cancellable.is_cancelled();
    }

    #closeSocket() {
        if (!this.socket)
            return;
        closeWebSocket(this.socket);
        this.socket = null;
    }
}

export class NoxV3ConnectionTester {
    constructor(settings, onState, onDone) {
        this.connection = new NoxV3Connection(settings, {
            onState: state => {
                onState(state);
                if (state.startsWith('connected') ||
                    ['auth_failed', 'missing-config', 'manual-disconnected', 'insecure-url', 'missing-cert-fingerprint'].includes(state) ||
                    state.startsWith('exception:')) {
                    this.stop();
                    onDone?.(state);
                }
            },
        });
    }

    start() {
        this.connection.start();
    }

    stop() {
        this.connection.stop();
    }
}

function connectAcceptCertificate(message, expectedFingerprint, onState) {
    try {
        message.connect('accept-certificate', (_msg, certificate) => {
            try {
                const actual = normalizeFingerprint(certificateFingerprint(certificate));
                const matched = actual.length === 64 && actual === expectedFingerprint;
                onState(matched ? 'certificate-verified' : 'certificate-mismatch');
                return matched;
            } catch (e) {
                onState(exceptionState(e));
                return false;
            }
        });
    } catch (e) {
        onState(exceptionState(e));
    }
}

function certificateFingerprint(certificate) {
    const bytes = certificate?.certificate;
    if (!bytes)
        throw new Error('TLS certificate unavailable');
    return GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, bytes).toUpperCase();
}

function closeWebSocket(socket) {
    if (!socket)
        return;
    try {
        socket.close(Soup.WebsocketCloseCode.NORMAL, null);
    } catch (e) {
    }
}

function exceptionState(error) {
    const message = String(error?.message || error).replace(/\s+/g, ' ').slice(0, 160);
    return `exception: ${message}`;
}
