import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createBody } from '../extension/src/core/body.js';
import { NoxV3Controller } from '../extension/src/core/controller.js';
import { buildContext } from '../extension/src/core/context.js';
import { wallHit } from '../extension/src/core/geometry.js';
import { dragPreviewBody, dropDirection } from '../extension/src/core/drag-drop.js';
import { createDragTracker, estimateThrowVelocity, recordPointerSample } from '../extension/src/core/drag-tracker.js';
import { clampBodyToScreen, stepAirborne } from '../extension/src/core/physics.js';
import { MotionMode } from '../extension/src/core/types.js';
import { BEHAVIOR_TREE } from '../extension/src/behavior/tree.js';
import { WeightedSelector } from '../extension/src/behavior/selector.js';
import { ACTION_CONTRACTS, ACTION_REGISTRY, validateRegistry } from '../extension/src/behavior/registry.js';
import { DEFAULT_RUNTIME_CONFIG } from '../extension/src/config/settings.js';
import { GRAVITY_PROFILES } from '../extension/src/config/gravity-profiles.js';

const root = existsSync('extension') ? '.' : 'v3';

function state(overrides = {}) {
    const screen = overrides.screen || { x: 0, y: 0, width: 300, height: 200 };
    const config = overrides.config || DEFAULT_RUNTIME_CONFIG;
    return {
        screen,
        config,
        locomotion: overrides.locomotion || { walkRampTick: config.walkAccelerationTicks },
        motion: overrides.motion || { mode: MotionMode.GROUNDED },
        body: {
            ...createBody(screen, config),
            ...overrides.body,
        },
    };
}

describe('Nox V3 foundation behavior', () => {
    it('walks right on ground', () => {
        const controller = new NoxV3Controller(state({
            config: { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5 },
            locomotion: { walkRampTick: DEFAULT_RUNTIME_CONFIG.walkAccelerationTicks },
            body: { x: 20, direction: 1, velocityX: 5 },
        }));
        const result = controller.tick();
        assert.equal(result.node.id, 'ground.walk');
        assert.equal(result.state.body.x, 25);
        assert.equal(result.state.body.y, 36);
        assert.equal(result.state.body.direction, 1);
    });

    it('walks left on ground', () => {
        const controller = new NoxV3Controller(state({
            config: { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5 },
            locomotion: { walkRampTick: DEFAULT_RUNTIME_CONFIG.walkAccelerationTicks },
            body: { x: 20, direction: -1, velocityX: -5 },
        }));
        const result = controller.tick();
        assert.equal(result.node.id, 'ground.walk');
        assert.equal(result.state.body.x, 15);
        assert.equal(result.state.body.direction, -1);
    });

    it('clamps and flips at right wall', () => {
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 300, height: 200 },
            config: { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5 },
            locomotion: { walkRampTick: DEFAULT_RUNTIME_CONFIG.walkAccelerationTicks },
            body: { x: 124, direction: 1, velocityX: 5 },
        }));
        const result = controller.tick();
        assert.equal(result.node.id, 'wall.flip');
        assert.equal(result.state.body.x, 126);
        assert.equal(result.state.body.direction, -1);
        assert.equal(result.state.body.velocityX, -1.75);
        assert.equal(result.state.locomotion.walkRampTick, 0);
    });

    it('clamps and flips at left wall', () => {
        const controller = new NoxV3Controller(state({
            config: { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5 },
            locomotion: { walkRampTick: DEFAULT_RUNTIME_CONFIG.walkAccelerationTicks },
            body: { x: 2, direction: -1, velocityX: -5 },
        }));
        const result = controller.tick();
        assert.equal(result.node.id, 'wall.flip');
        assert.equal(result.state.body.x, 0);
        assert.equal(result.state.body.direction, 1);
        assert.equal(result.state.body.velocityX, 1.75);
        assert.equal(result.state.locomotion.walkRampTick, 0);
    });

    it('builds context without mutating state', () => {
        const input = state({ body: { x: 42 } });
        const before = JSON.stringify(input);
        const context = buildContext(input);
        assert.equal(JSON.stringify(input), before);
        assert.equal(context.body.x, 42);
    });

    it('selector chooses wall flip before walk when projected body hits wall', () => {
        const input = state({
            config: { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5 },
            locomotion: { walkRampTick: DEFAULT_RUNTIME_CONFIG.walkAccelerationTicks },
            body: { x: 124, direction: 1, velocityX: 5 },
        });
        const context = buildContext(input);
        assert.equal(wallHit(context.body, context.screen), 'right');
        assert.equal(new WeightedSelector(() => 0).select(BEHAVIOR_TREE, context).id, 'wall.flip');
    });

    it('behavior tree nodes have action registry entries and contracts', () => {
        assert.equal(validateRegistry(BEHAVIOR_TREE), true);
        for (const node of BEHAVIOR_TREE) {
            assert.ok(node.weight > 0);
            assert.ok(ACTION_REGISTRY[node.action]);
            assert.ok(ACTION_CONTRACTS[node.action]);
            assert.equal(ACTION_CONTRACTS[node.action].returnsBodyUpdate, true);
            assert.equal(ACTION_CONTRACTS[node.action].returnsLocomotionUpdate, true);
        }
    });

    it('resets acceleration on wall flip and ramps back to max speed', () => {
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 10, walkAccelerationTicks: 2 };
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 300, height: 200 },
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            body: { x: 124, direction: 1, velocityX: 10 },
        }));

        const flipped = controller.tick();
        assert.equal(flipped.node.id, 'wall.flip');
        assert.equal(flipped.state.body.velocityX, -3.5);
        assert.equal(flipped.state.locomotion.walkRampTick, 0);

        const firstWalk = controller.tick();
        assert.equal(firstWalk.node.id, 'ground.walk');
        assert.equal(firstWalk.state.body.velocityX, -3.5);
        assert.equal(firstWalk.state.locomotion.walkRampTick, 1);

        const secondWalk = controller.tick();
        assert.equal(secondWalk.state.body.velocityX, -6.75);
        assert.equal(secondWalk.state.locomotion.walkRampTick, 2);

        const maxWalk = controller.tick();
        assert.equal(maxWalk.state.body.velocityX, -10);
        assert.equal(maxWalk.state.locomotion.walkRampTick, 2);
    });

    it('scale updates body size and clamps x to screen', () => {
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 300, height: 240 },
            body: { x: 200 },
        }));
        controller.updateConfig({ ...DEFAULT_RUNTIME_CONFIG, scalePercent: 150 });
        assert.equal(controller.state.body.width, 261);
        assert.equal(controller.state.body.height, 246);
        assert.equal(controller.state.body.x, 39);
        assert.equal(controller.state.body.y, -6);
    });

    it('drop direction follows drag movement and preserves ambiguous direction', () => {
        assert.equal(dropDirection(10, 20, -1), 1);
        assert.equal(dropDirection(20, 10, 1), -1);
        assert.equal(dropDirection(10, 10, -1), -1);
    });

    it('drag preview clamps to hard screen bounds without forcing ground during drag', () => {
        const body = { x: 20, y: 30, width: 40, height: 50, direction: 1, velocityX: 4 };
        const preview = dragPreviewBody(
            { x: 0, y: 0, width: 100, height: 100 },
            body,
            200,
            200,
            { x: 10, y: 5 }
        );
        assert.equal(preview.x, 60);
        assert.equal(preview.y, 50);
        assert.equal(body.x, 20);
    });

    it('clamps body to hard x/y screen borders', () => {
        const clamped = clampBodyToScreen(
            { x: 0, y: 0, width: 100, height: 100 },
            { x: 999, y: -20, width: 30, height: 40, direction: 1, velocityX: 0, velocityY: 0 }
        );
        assert.equal(clamped.x, 70);
        assert.equal(clamped.y, 0);
    });

    it('throw velocity is estimated from recent pointer samples and small motion drops to zero', () => {
        let tracker = createDragTracker(0, 0, 0);
        tracker = recordPointerSample(tracker, 20, 10, 50);
        tracker = recordPointerSample(tracker, 40, 20, 100);
        assert.deepEqual(estimateThrowVelocity(tracker, 50), { x: 20, y: 10 });

        tracker = createDragTracker(0, 0, 0);
        tracker = recordPointerSample(tracker, 1, 1, 100);
        assert.deepEqual(estimateThrowVelocity(tracker, 50), { x: 0, y: 0 });
    });

    it('airborne physics increases fall velocity and horizontal throw changes trajectory', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const config = { ...DEFAULT_RUNTIME_CONFIG, gravity: 2, maxFallSpeed: 24 };
        const body = { x: 50, y: 20, width: 40, height: 50, direction: 1, velocityX: 6, velocityY: 0 };
        const first = stepAirborne(screen, body, config);
        const second = stepAirborne(screen, first.body, config);
        assert.equal(first.body.velocityY, 2);
        assert.equal(second.body.velocityY, 4);
        assert.equal(first.body.x, 56);
        assert.equal(second.body.x, 62);
        assert.equal(second.motion.mode, MotionMode.AIRBORNE);
    });

    it('Earth-like gravity increases fall speed more than Moon-like gravity', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const body = { x: 50, y: 20, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 };
        const earth = stepAirborne(screen, body, {
            ...DEFAULT_RUNTIME_CONFIG,
            gravity: GRAVITY_PROFILES.earth.gravity,
        });
        const moon = stepAirborne(screen, body, {
            ...DEFAULT_RUNTIME_CONFIG,
            gravity: GRAVITY_PROFILES.moon.gravity,
        });
        assert.ok(earth.body.velocityY > moon.body.velocityY);
        assert.ok(earth.body.y > moon.body.y);
    });

    it('airborne physics clamps wall and stops horizontal velocity deterministically', () => {
        const update = stepAirborne(
            { x: 0, y: 0, width: 100, height: 100 },
            { x: 65, y: 10, width: 40, height: 50, direction: 1, velocityX: 10, velocityY: 0 },
            { ...DEFAULT_RUNTIME_CONFIG, gravity: 1, maxFallSpeed: 24 }
        );
        assert.equal(update.body.x, 60);
        assert.equal(update.body.velocityX, 0);
    });

    it('airborne physics clamps floor and transitions to grounded walking state', () => {
        const update = stepAirborne(
            { x: 0, y: 0, width: 100, height: 100 },
            { x: 10, y: 45, width: 40, height: 50, direction: -1, velocityX: 5, velocityY: 10 },
            { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 8, gravity: 2, maxFallSpeed: 24 }
        );
        assert.equal(update.landed, true);
        assert.equal(update.body.y, 50);
        assert.equal(update.body.direction, 1);
        assert.equal(update.body.velocityY, 0);
        assert.equal(update.body.velocityX, 8);
        assert.equal(update.motion.mode, MotionMode.GROUNDED);
    });

    it('release drop starts airborne, keeps body bounded, and resumes walking after landing', () => {
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 10 };
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 300, height: 120 },
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            body: { x: 40, y: 10, width: 40, height: 50, direction: -1, velocityX: -10 },
        }));
        controller.startDrag();
        controller.previewDrag(120, 20, { x: 5, y: 5 });
        assert.equal(controller.state.motion.mode, MotionMode.DRAGGING);
        controller.releaseDrag(120, 80, { x: 6, y: -3 });
        assert.equal(controller.state.body.x, 115);
        assert.equal(controller.state.body.y, 15);
        assert.equal(controller.state.body.direction, 1);
        assert.equal(controller.state.body.velocityX, 6);
        assert.equal(controller.state.body.velocityY, -3);
        assert.equal(controller.state.motion.mode, MotionMode.AIRBORNE);
        assert.equal(controller.state.locomotion.walkRampTick, 0);
        for (let i = 0; i < 40 && controller.state.motion.mode !== MotionMode.GROUNDED; i++)
            controller.tick();
        assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);
        assert.equal(controller.state.body.y, 70);
        assert.equal(controller.tick().node.id, 'ground.walk');
    });

    it('keeps Gio/GSettings out of controller and action modules', () => {
        for (const file of [
            'extension/src/core/controller.js',
            'extension/src/actions/walk.js',
            'extension/src/actions/flip-at-wall.js',
        ]) {
            const source = readFileSync(join(root, file), 'utf8');
            assert.doesNotMatch(source, /gi:\/\//);
            assert.doesNotMatch(source, /Gio|GSettings|get_int|get_string/);
        }
    });

    it('mirrors left walking at render time without left assets', () => {
        const actorSource = readFileSync(join(root, 'extension/src/actor.js'), 'utf8');
        assert.match(actorSource, /set_scale\(this\.controller\.state\.body\.direction < 0 \? -1 : 1, 1\)/);
        assert.match(actorSource, /set_pivot_point\(0\.5, 0\.5\)/);
    });

    it('actor handles drag as shell boundary and keeps Nox in top chrome', () => {
        const actorSource = readFileSync(join(root, 'extension/src/actor.js'), 'utf8');
        assert.match(actorSource, /reactive: true/);
        assert.match(actorSource, /button-press-event/);
        assert.match(actorSource, /motion-event/);
        assert.match(actorSource, /button-release-event/);
        assert.match(actorSource, /controller\.previewDrag/);
        assert.match(actorSource, /controller\.startDrag/);
        assert.match(actorSource, /controller\.releaseDrag/);
        assert.match(actorSource, /createDragTracker/);
        assert.match(actorSource, /recordPointerSample/);
        assert.match(actorSource, /estimateThrowVelocity/);
        assert.match(actorSource, /nox-v3-drag-shield/);
        assert.match(actorSource, /#createDragShield/);
        assert.match(actorSource, /#destroyDragShield/);
        assert.match(actorSource, /Main\.layoutManager\.addTopChrome/);
        assert.match(actorSource, /raiseNoxAboveSiblings/);
        assert.match(actorSource, /findDockContainer/);
        assert.match(actorSource, /Main\.layoutManager\.uiGroup/);
        assert.match(actorSource, /get_parent\?\.\(\)/);
        assert.match(actorSource, /uiGroup\?\.set_child_above_sibling/);
        assert.match(actorSource, /actor\.get_parent\?\.\(\) !== uiGroup/);
        assert.match(actorSource, /child\.constructor\?\.name === 'DashToDock'/);
        assert.match(actorSource, /child\.first_child\?\.first_child\?\.style_class\?\.startsWith\('dashtopanelPanel'\)/);
        assert.match(actorSource, /dockContainer\?\.get_parent\?\.\(\) === uiGroup/);
        assert.match(actorSource, /uiGroup\.set_child_above_sibling\(actor, dockContainer\)/);
        assert.match(actorSource, /uiGroup\.set_child_above_sibling\(actor, null\)/);
        assert.doesNotMatch(actorSource, /raise_top/);
    });
});
