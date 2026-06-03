import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MOVEMENT_PROFILES, normalizeMovementProfile, resolveMovementProfile } from '../extension/src/config/movement-profiles.js';
import { GRAVITY_PROFILES, normalizeGravityProfile, resolveGravityProfile } from '../extension/src/config/gravity-profiles.js';
import { DEFAULT_RUNTIME_CONFIG, normalizeRuntimeConfig, readRuntimeConfig } from '../extension/src/config/settings.js';
import { walkAction } from '../extension/src/actions/walk.js';
import { walkRampSpeed } from '../extension/src/core/locomotion.js';
import { ackAllFrame, helloFrame, parseServerFrame } from '../extension/src/connection/frames.js';
import { connectionConfigError, normalizeConnectionConfig, normalizeFingerprint, readConnectionConfig } from '../extension/src/connection/settings.js';
import { connectionVisualState, ConnectionVisual } from '../extension/src/connection/visual.js';
import { activeMessage, advanceAfterOk, createMessageQueue, enqueueMessage } from '../extension/src/message/queue.js';

describe('Nox V3 runtime config', () => {
    it('resolves movement profiles and gives smooth the highest frame cadence', () => {
        assert.equal(normalizeMovementProfile('bad'), 'balanced');
        assert.deepEqual(resolveMovementProfile('calm'), MOVEMENT_PROFILES.calm);
        assert.equal(MOVEMENT_PROFILES.smooth.walkFrameTicks, 1);
        assert.ok(MOVEMENT_PROFILES.smooth.walkFrameTicks < MOVEMENT_PROFILES.balanced.walkFrameTicks);
    });

    it('resolves gravity profiles and falls back to Earth-like', () => {
        assert.equal(normalizeGravityProfile('bad'), 'earth');
        assert.deepEqual(resolveGravityProfile('earth'), GRAVITY_PROFILES.earth);
        assert.ok(GRAVITY_PROFILES.earth.gravity > GRAVITY_PROFILES.moon.gravity);
    });

    it('normalizes and clamps settings into plain runtime config', () => {
        const config = normalizeRuntimeConfig({
            scalePercent: 500,
            movementProfile: 'smooth',
            gravityProfile: 'moon',
            walkingSpeedPercent: 10,
        });
        assert.equal(config.scalePercent, 200);
        assert.equal(config.movementProfile, 'smooth');
        assert.equal(config.gravityProfile, 'moon');
        assert.equal(config.walkingSpeedPercent, 40);
        assert.ok(Math.abs(config.walkSpeed - (MOVEMENT_PROFILES.smooth.walkSpeed * 0.4)) < 0.0001);
        assert.equal(config.gravity, GRAVITY_PROFILES.moon.gravity);
        assert.equal(config.walkFrameTicks, MOVEMENT_PROFILES.smooth.walkFrameTicks);
        assert.equal(config.walkAccelerationTicks, 18);
        assert.equal(config.walkStartSpeedFactor, 0.35);
    });

    it('allows smaller V3 size while preserving max clamp', () => {
        assert.equal(normalizeRuntimeConfig({ scalePercent: 10 }).scalePercent, 20);
        assert.equal(normalizeRuntimeConfig({ scalePercent: 500 }).scalePercent, 200);
    });

    it('reads through adapter from a GSettings-like object', () => {
        const settings = {
            get_int(key) {
                return key === 'nox-scale-percent' ? 125 : 120;
            },
            get_string(key) {
                return key === 'gravity-profile' ? 'moon' : 'snappy';
            },
        };
        const config = readRuntimeConfig(settings);
        assert.equal(config.scalePercent, 125);
        assert.equal(config.movementProfile, 'snappy');
        assert.equal(config.gravityProfile, 'moon');
        assert.equal(config.gravity, GRAVITY_PROFILES.moon.gravity);
        assert.equal(config.walkingSpeedPercent, 120);
    });

    it('walk action uses config speed instead of hardcoded body speed', () => {
        const update = walkAction({
            body: { x: 10, y: 0, width: 20, height: 20, direction: 1, velocityX: 1 },
            screen: { x: 0, y: 0, width: 200, height: 100 },
            config: { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 7 },
            locomotion: { walkRampTick: DEFAULT_RUNTIME_CONFIG.walkAccelerationTicks },
        });
        assert.equal(update.body.x, 17);
        assert.equal(update.body.velocityX, 7);
    });

    it('walk ramp speed starts below max and reaches max deterministically', () => {
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 8, walkAccelerationTicks: 4 };
        assert.equal(walkRampSpeed(config, 0), 2.8);
        assert.equal(walkRampSpeed(config, 4), 8);
        assert.equal(walkRampSpeed(config, 99), 8);
    });

    it('normalizes connection settings and validates local/wss requirements', () => {
        assert.equal(normalizeFingerprint('aa:bb cc'), 'AABBCC');
        assert.deepEqual(normalizeConnectionConfig({
            websocketUrl: ' ws://127.0.0.1:8765 ',
            token: ' token ',
            certFingerprint: ' aa:bb ',
        }), {
            websocketUrl: 'ws://127.0.0.1:8765',
            token: 'token',
            certFingerprint: 'AABB',
            manualDisconnected: false,
        });
        assert.equal(connectionConfigError(normalizeConnectionConfig({
            websocketUrl: 'ws://127.0.0.1:8765',
            token: 'token',
        })), '');
        assert.equal(connectionConfigError(normalizeConnectionConfig({
            websocketUrl: 'ws://remote.example',
            token: 'token',
        })), 'insecure-url');
        assert.equal(connectionConfigError(normalizeConnectionConfig({
            websocketUrl: 'wss://remote.example',
            token: 'token',
        })), 'missing-cert-fingerprint');
    });

    it('reads connection config from a GSettings-like object', () => {
        const settings = {
            get_string(key) {
                return {
                    'websocket-url': 'ws://localhost:8765',
                    token: 'secret',
                    'cert-fingerprint': 'aa:bb',
                }[key] || '';
            },
            get_boolean(key) {
                return key === 'manual-disconnected';
            },
        };
        const config = readConnectionConfig(settings);
        assert.equal(config.websocketUrl, 'ws://localhost:8765');
        assert.equal(config.token, 'secret');
        assert.equal(config.certFingerprint, 'AABB');
        assert.equal(config.manualDisconnected, true);
        assert.equal(connectionConfigError(config), 'manual-disconnected');
    });

    it('parses server frames and formats hello/ack_all frames', () => {
        assert.deepEqual(helloFrame('secret'), { type: 'hello', token: 'secret', version: 1 });
        assert.deepEqual(ackAllFrame('m-2'), { type: 'ack_all', lastId: 'm-2' });
        assert.deepEqual(parseServerFrame('{"type":"ready","queueDepth":2}'), { type: 'ready', queueDepth: 2 });
        assert.deepEqual(parseServerFrame('{"type":"error","code":"auth_failed"}'), { type: 'error', code: 'auth_failed' });
        assert.deepEqual(parseServerFrame('{"type":"message","id":"m-1","text":"hello"}'), { type: 'message', id: 'm-1', text: 'hello' });
        assert.deepEqual(parseServerFrame('{"type":"message","id":"m-1","message":"hello"}'), { type: 'message', id: 'm-1', text: 'hello' });
    });

    it('maps connection state to view-only visual states', () => {
        assert.equal(connectionVisualState('connected queueDepth=0'), ConnectionVisual.CONNECTED);
        assert.equal(connectionVisualState('ready'), ConnectionVisual.CONNECTED);
        assert.equal(connectionVisualState('hello-sent'), ConnectionVisual.CONNECTING);
        assert.equal(connectionVisualState('connecting'), ConnectionVisual.CONNECTING);
        assert.equal(connectionVisualState('message'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('missing-config'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('manual-disconnected'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('disconnected'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('auth_failed'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('certificate-mismatch'), ConnectionVisual.DISCONNECTED);
    });

    it('queues messages and only returns ack_all id after final OK', () => {
        let queue = createMessageQueue();
        queue = enqueueMessage(queue, { id: 'm-1', text: 'one' });
        queue = enqueueMessage(queue, { id: 'm-2', text: 'two' });
        queue = enqueueMessage(queue, { id: 'm-2', text: 'two duplicate' });
        assert.equal(queue.messages.length, 2);
        assert.equal(activeMessage(queue).id, 'm-1');

        let result = advanceAfterOk(queue);
        assert.equal(result.ackLastId, '');
        assert.equal(activeMessage(result.queue).id, 'm-2');

        result = advanceAfterOk(result.queue);
        assert.equal(result.ackLastId, 'm-2');
        assert.equal(activeMessage(result.queue), null);
    });
});
