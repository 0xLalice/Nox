import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MOVEMENT_PROFILES, normalizeMovementProfile, resolveMovementProfile } from '../extension/src/config/movement-profiles.js';
import { DEFAULT_RUNTIME_CONFIG, normalizeRuntimeConfig, readRuntimeConfig } from '../extension/src/config/settings.js';
import { walkAction } from '../extension/src/actions/walk.js';
import { walkRampSpeed } from '../extension/src/core/locomotion.js';

describe('Nox V3 runtime config', () => {
    it('resolves movement profiles and gives smooth the highest frame cadence', () => {
        assert.equal(normalizeMovementProfile('bad'), 'balanced');
        assert.deepEqual(resolveMovementProfile('calm'), MOVEMENT_PROFILES.calm);
        assert.equal(MOVEMENT_PROFILES.smooth.walkFrameTicks, 1);
        assert.ok(MOVEMENT_PROFILES.smooth.walkFrameTicks < MOVEMENT_PROFILES.balanced.walkFrameTicks);
    });

    it('normalizes and clamps settings into plain runtime config', () => {
        const config = normalizeRuntimeConfig({
            scalePercent: 500,
            movementProfile: 'smooth',
            walkingSpeedPercent: 10,
        });
        assert.equal(config.scalePercent, 200);
        assert.equal(config.movementProfile, 'smooth');
        assert.equal(config.walkingSpeedPercent, 40);
        assert.ok(Math.abs(config.walkSpeed - (MOVEMENT_PROFILES.smooth.walkSpeed * 0.4)) < 0.0001);
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
            get_string() {
                return 'snappy';
            },
        };
        const config = readRuntimeConfig(settings);
        assert.equal(config.scalePercent, 125);
        assert.equal(config.movementProfile, 'snappy');
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
});
