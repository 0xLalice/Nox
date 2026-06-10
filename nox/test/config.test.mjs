import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MOVEMENT_PROFILES, normalizeMovementProfile, resolveMovementProfile } from '../src/config/movement-profiles.js';
import { GRAVITY_PROFILES, normalizeGravityProfile, resolveGravityProfile } from '../src/config/gravity-profiles.js';
import { DEFAULT_RUNTIME_CONFIG, normalizeRuntimeConfig, readRuntimeConfig } from '../src/config/settings.js';
import { JUMP_REACH_DISTANCE, RUN_DURATION_TICKS } from '../src/core/constants.js';
import { walkAction } from '../src/actions/walk.js';
import { walkRampSpeed } from '../src/core/locomotion.js';
import { ackAllFrame, helloFrame, parseServerFrame } from '../src/connection/frames.js';
import { connectionConfigError, normalizeConnectionConfig, normalizeFingerprint, readConnectionConfig } from '../src/connection/settings.js';
import {
    CONNECTION_DESATURATE_EFFECT,
    connectionIconVisualPlan,
    connectionVisualState,
    ConnectionVisual,
} from '../src/connection/visual.js';
import {
    ackDisplayedSequence,
    activeMessage,
    createMessageQueue,
    enqueueMessage,
    messageControls,
    nextMessage,
    previousMessage,
} from '../src/message/queue.js';

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
        assert.equal(GRAVITY_PROFILES.earth.gravity, 2.4);
        assert.equal(DEFAULT_RUNTIME_CONFIG.gravity, GRAVITY_PROFILES.earth.gravity);
        assert.ok(GRAVITY_PROFILES.earth.gravity > GRAVITY_PROFILES.moon.gravity);
    });

    it('normalizes and clamps settings into plain runtime config', () => {
        const config = normalizeRuntimeConfig({
            scalePercent: 500,
            movementProfile: 'calm',
            gravityProfile: 'moon',
            walkingSpeedPercent: 10,
            runSpeedPercent: 999,
            runDurationTicks: 999,
        });
        assert.equal(config.scalePercent, 32);
        assert.equal(config.movementProfile, 'smooth');
        assert.equal(config.gravityProfile, 'moon');
        assert.equal(config.walkingSpeedPercent, 42);
        assert.equal(config.runSpeedPercent, 120);
        assert.equal(config.runDurationTicks, 55);
        assert.ok(Math.abs(config.walkSpeed - (MOVEMENT_PROFILES.smooth.walkSpeed * 0.42)) < 0.0001);
        assert.ok(Math.abs(config.runSpeed - (config.walkSpeed * 1.75 * 1.2)) < 0.0001);
        assert.equal(config.gravity, GRAVITY_PROFILES.moon.gravity);
        assert.equal(config.walkFrameTicks, MOVEMENT_PROFILES.smooth.walkFrameTicks);
        assert.equal(config.walkAccelerationTicks, 18);
        assert.equal(config.walkStartSpeedFactor, 0.35);
        assert.equal(config.jumpReachDistance, JUMP_REACH_DISTANCE);
    });

    it('normalizes jump reach tuning into one scan distance', () => {
        const tuned = normalizeRuntimeConfig({
            jumpReachDistance: 420,
        });
        assert.equal(tuned.jumpReachDistance, 420);

        assert.equal(normalizeRuntimeConfig({ jumpReachDistance: 9999 }).jumpReachDistance, 900);
        assert.equal(normalizeRuntimeConfig({ jumpReachDistance: 1 }).jumpReachDistance, 80);
    });

    it('uses fixed run length regardless of old stored settings', () => {
        assert.equal(DEFAULT_RUNTIME_CONFIG.runDurationTicks, 55);
        assert.notEqual(DEFAULT_RUNTIME_CONFIG.runDurationTicks, RUN_DURATION_TICKS);
        assert.equal(normalizeRuntimeConfig({}).runDurationTicks, 55);
        assert.equal(normalizeRuntimeConfig({ runDurationTicks: 1 }).runDurationTicks, 55);
        assert.equal(normalizeRuntimeConfig({ runDurationTicks: 999 }).runDurationTicks, 55);
        assert.equal(normalizeRuntimeConfig({ runDurationTicks: 21 }).runDurationTicks, 55);
    });

    it('uses fixed run speed relative to the 1.75x baseline regardless of old stored settings', () => {
        const defaults = normalizeRuntimeConfig({});
        assert.equal(defaults.runSpeedPercent, 120);
        assert.ok(Math.abs(defaults.runSpeed - defaults.walkSpeed * 1.75 * 1.2) < 0.0001);
        assert.equal(normalizeRuntimeConfig({ runSpeedPercent: 1 }).runSpeedPercent, 120);
        assert.equal(normalizeRuntimeConfig({ runSpeedPercent: 999 }).runSpeedPercent, 120);
        const custom = normalizeRuntimeConfig({ runSpeedPercent: 150 });
        assert.equal(custom.runSpeedPercent, 120);
        assert.ok(Math.abs(custom.runSpeed - custom.walkSpeed * 1.75 * 1.2) < 0.0001);
    });

    it('uses fixed size and movement settings regardless of old stored settings', () => {
        const config = normalizeRuntimeConfig({
            scalePercent: 500,
            movementProfile: 'calm',
            walkingSpeedPercent: 160,
        });
        assert.equal(config.scalePercent, 32);
        assert.equal(config.movementProfile, 'smooth');
        assert.equal(config.walkingSpeedPercent, 42);
    });

    it('reads through adapter from a GSettings-like object', () => {
        const settings = {
            get_int(key) {
                return {
                    'nox-scale-percent': 125,
                    'walking-speed-percent': 120,
                    'run-length-ticks': 21,
                    'run-speed-percent': 150,
                }[key] || 120;
            },
            get_string(key) {
                return {
                    'gravity-profile': 'moon',
                    'movement-profile': 'snappy',
                }[key] || '';
            },
        };
        const config = readRuntimeConfig(settings);
        assert.equal(config.scalePercent, 32);
        assert.equal(config.movementProfile, 'smooth');
        assert.equal(config.gravityProfile, 'moon');
        assert.equal(config.gravity, GRAVITY_PROFILES.moon.gravity);
        assert.equal(config.walkingSpeedPercent, 42);
        assert.equal(config.runDurationTicks, 55);
        assert.equal(config.runSpeedPercent, 120);
        assert.equal(config.jumpReachDistance, 120);
        assert.ok(Math.abs(config.runSpeed - config.walkSpeed * 1.75 * 1.2) < 0.0001);
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

    it('normalizes connection settings and requires remote wss with fingerprint', () => {
        assert.equal(normalizeFingerprint('aa:bb cc'), 'AABBCC');
        assert.deepEqual(normalizeConnectionConfig({
            websocketUrl: ' wss://agent.example:8765/nox/ws ',
            token: ' token ',
            certFingerprint: ' aa:bb ',
        }), {
            websocketUrl: 'wss://agent.example:8765/nox/ws',
            token: 'token',
            certFingerprint: 'AABB',
            manualDisconnected: false,
        });
        assert.equal(connectionConfigError(normalizeConnectionConfig({
            websocketUrl: 'wss://agent.example:8765/nox/ws',
            token: 'token',
            certFingerprint: '00'.repeat(32),
        })), '');
        assert.equal(connectionConfigError(normalizeConnectionConfig({
            websocketUrl: 'ws://127.0.0.1:8765/nox/ws',
            token: 'token',
            certFingerprint: '00'.repeat(32),
        })), 'insecure-url');
        assert.equal(connectionConfigError(normalizeConnectionConfig({
            websocketUrl: 'ws://remote.example/nox/ws',
            token: 'token',
        })), 'insecure-url');
        assert.equal(connectionConfigError(normalizeConnectionConfig({
            websocketUrl: 'wss://agent.example:8765/nox/ws',
            token: 'token',
        })), 'missing-cert-fingerprint');
    });

    it('reads connection config from a GSettings-like object', () => {
        const settings = {
            get_string(key) {
                return {
                    'websocket-url': 'wss://agent.example:8765/nox/ws',
                    token: 'secret',
                    'cert-fingerprint': 'aa:bb',
                }[key] || '';
            },
            get_boolean(key) {
                return key === 'manual-disconnected';
            },
        };
        const config = readConnectionConfig(settings);
        assert.equal(config.websocketUrl, 'wss://agent.example:8765/nox/ws');
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
        assert.equal(connectionVisualState(''), ConnectionVisual.CONNECTED);
        assert.equal(connectionVisualState(undefined), ConnectionVisual.CONNECTED);
        assert.equal(connectionVisualState('not-started'), ConnectionVisual.CONNECTED);
        assert.equal(connectionVisualState('unknown-future-state'), ConnectionVisual.CONNECTED);
        assert.equal(connectionVisualState('message'), ConnectionVisual.CONNECTED);
        assert.equal(connectionVisualState('hello-sent'), ConnectionVisual.CONNECTING);
        assert.equal(connectionVisualState('connecting'), ConnectionVisual.CONNECTING);
        assert.equal(connectionVisualState('missing-config'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('manual-disconnected'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('disconnected'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('off'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('insecure-url'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('invalid-url'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('missing-cert-fingerprint'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('auth_failed'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('certificate-mismatch'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('bad-frame'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('error'), ConnectionVisual.DISCONNECTED);
        assert.equal(connectionVisualState('exception: connection failed'), ConnectionVisual.DISCONNECTED);
    });

    it('clears forced grayscale for default/connected states and forces grayscale for disconnected states', () => {
        for (const state of [
            '',
            undefined,
            'not-started',
            'unknown-future-state',
            'connected queueDepth=1',
            'ready',
            'hello-sent',
            'connecting',
            'message',
        ]) {
            const plan = connectionIconVisualPlan(state);
            assert.equal(plan.opacity, 255);
            assert.equal(plan.forceGrayscale, false);
            assert.equal(plan.clearForcedGrayscale, true);
            assert.equal(plan.effectName, CONNECTION_DESATURATE_EFFECT);
        }

        for (const state of [
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
            'error',
            'exception: connection failed',
        ]) {
            const plan = connectionIconVisualPlan(state);
            assert.equal(plan.opacity, 150);
            assert.equal(plan.forceGrayscale, true);
            assert.equal(plan.clearForcedGrayscale, false);
            assert.equal(plan.effectName, CONNECTION_DESATURATE_EFFECT);
        }
    });

    it('queues messages with counter controls and only ACKs after final OK', () => {
        let queue = createMessageQueue();
        queue = enqueueMessage(queue, { id: 'm-1', text: 'one' });
        queue = enqueueMessage(queue, { id: 'm-2', text: 'two' });
        queue = enqueueMessage(queue, { id: 'm-3', text: 'three' });
        queue = enqueueMessage(queue, { id: 'm-2', text: 'two duplicate' });
        assert.equal(queue.messages.length, 3);
        assert.equal(activeMessage(queue).id, 'm-1');
        assert.deepEqual(messageControls(queue), {
            position: 1,
            total: 3,
            counterLabel: '< 1/3 >',
            canPrevious: false,
            canNext: true,
            canDone: false,
        });

        let result = ackDisplayedSequence(queue);
        assert.equal(result.ackLastId, '');
        assert.equal(activeMessage(result.queue).id, 'm-1');

        queue = nextMessage(queue);
        assert.equal(activeMessage(queue).id, 'm-2');
        assert.deepEqual(messageControls(queue), {
            position: 2,
            total: 3,
            counterLabel: '< 2/3 >',
            canPrevious: true,
            canNext: true,
            canDone: false,
        });
        result = ackDisplayedSequence(queue);
        assert.equal(result.ackLastId, '');
        assert.equal(activeMessage(result.queue).id, 'm-2');

        queue = previousMessage(queue);
        assert.equal(activeMessage(queue).id, 'm-1');

        queue = nextMessage(nextMessage(queue));
        assert.equal(activeMessage(queue).id, 'm-3');
        assert.deepEqual(messageControls(queue), {
            position: 3,
            total: 3,
            counterLabel: '< 3/3 >',
            canPrevious: true,
            canNext: false,
            canDone: true,
        });
        result = ackDisplayedSequence(queue);
        assert.equal(result.ackLastId, 'm-3');
        assert.equal(activeMessage(result.queue), null);
    });
});
