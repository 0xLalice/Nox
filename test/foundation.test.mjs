import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createBody } from '../extension/src/core/body.js';
import { NoxV3Controller } from '../extension/src/core/controller.js';
import { buildContext } from '../extension/src/core/context.js';
import { wallHit } from '../extension/src/core/geometry.js';
import { dragPreviewBody, dropDirection, exceedsDragThreshold } from '../extension/src/core/drag-drop.js';
import { createDragTracker, estimateThrowVelocity, recordPointerSample } from '../extension/src/core/drag-tracker.js';
import { clampBodyToScreen, stepAirborne } from '../extension/src/core/physics.js';
import { MotionMode } from '../extension/src/core/types.js';
import { bubbleLayout, bubbleTextWidth } from '../extension/src/message/bubble.js';
import { messageMovementConfig } from '../extension/src/message/movement-modifier.js';
import { BEHAVIOR_TREE } from '../extension/src/behavior/tree.js';
import { WeightedSelector } from '../extension/src/behavior/selector.js';
import { ACTION_CONTRACTS, ACTION_REGISTRY, validateRegistry } from '../extension/src/behavior/registry.js';
import { DEFAULT_RUNTIME_CONFIG } from '../extension/src/config/settings.js';
import { GRAVITY_PROFILES } from '../extension/src/config/gravity-profiles.js';
import { CLICK_RUN_MAX_DISTANCE, RUN_FRAME_COUNT, RUN_FRAME_TICKS, RUN_SPEED_MULTIPLIER } from '../extension/src/core/constants.js';
import { runSpeed } from '../extension/src/actions/run.js';
import { ActionPhase, ActionStateId } from '../extension/src/core/action-state.js';
import { createWorldSnapshot } from '../extension/src/world/world.js';
import { createGroundSurface, createPlatformSurface, SurfaceKind } from '../extension/src/world/surface.js';
import { filterOccludedPlatforms, isHiddenByHigherOccluder, isOccluder } from '../extension/src/world/occlusion.js';
import { distanceToSupportLeftEdge, distanceToSupportRightEdge, isNearSupportEdge, projectedLeavesSupport } from '../extension/src/world/edge.js';
import { bodyOnSupport, revalidateSupport, supportAtBody } from '../extension/src/world/support.js';
import { platformFromWindowActor } from '../extension/src/shell/windows.js';

const root = existsSync('extension') ? '.' : 'v3';

function state(overrides = {}) {
    const screen = overrides.screen || { x: 0, y: 0, width: 300, height: 200 };
    const config = overrides.config || DEFAULT_RUNTIME_CONFIG;
    return {
        screen,
        world: overrides.world,
        support: overrides.support,
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
        assert.equal(result.state.body.y, 147.52);
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
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5 };
        const maxX = 300 - 174 * config.scalePercent / 100;
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 300, height: 200 },
            config,
            locomotion: { walkRampTick: DEFAULT_RUNTIME_CONFIG.walkAccelerationTicks },
            body: { x: maxX - 2, direction: 1, velocityX: 5 },
        }));
        const result = controller.tick();
        assert.equal(result.node.id, 'wall.flip');
        assert.equal(result.state.body.x, maxX);
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
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5 };
        const maxX = 300 - 174 * config.scalePercent / 100;
        const input = state({
            config,
            locomotion: { walkRampTick: DEFAULT_RUNTIME_CONFIG.walkAccelerationTicks },
            body: { x: maxX - 2, direction: 1, velocityX: 5 },
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
        assert.equal(ACTION_CONTRACTS.run.returnsMotionUpdate, true);
    });

    it('world snapshot represents ground as a normal support surface', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const world = createWorldSnapshot(screen);
        assert.equal(world.ground.id, 'ground');
        assert.equal(world.ground.kind, SurfaceKind.GROUND);
        assert.equal(world.ground.topY, 200);
        assert.deepEqual(world.surfaces.map(surface => surface.id), ['ground']);
        assert.deepEqual(createGroundSurface(screen), world.ground);
    });

    it('selects platform support when body feet are on a window surface', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const platform = { id: 'window:1', rect: { x: 40, y: 120, width: 160, height: 50 } };
        const world = createWorldSnapshot(screen, [platform]);
        const body = { x: 60, y: 70, width: 40, height: 50, velocityX: 0, velocityY: 0 };
        const support = supportAtBody(world, body);
        assert.equal(support.surfaceId, 'window:1');
        assert.equal(support.topY, 120);
        assert.equal(support.kind, SurfaceKind.PLATFORM);
    });

    it('falls back to ground only when body is actually on ground', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const world = createWorldSnapshot(screen, [{ id: 'window:1', rect: { x: 40, y: 120, width: 160, height: 50 } }]);
        assert.equal(supportAtBody(world, { x: 220, y: 150, width: 40, height: 50 })?.surfaceId, 'ground');
        assert.equal(supportAtBody(world, { x: 220, y: 90, width: 40, height: 50 }), null);
    });

    it('occlusion filtering excludes a lower window hidden by a higher maximized occluder', () => {
        const lower = { id: 'window:lower', rect: { x: 40, y: 80, width: 120, height: 80 }, stackIndex: 1 };
        const top = {
            id: 'window:max',
            rect: { x: 0, y: 0, width: 300, height: 200 },
            stackIndex: 2,
            occludesLowerWindows: true,
        };
        assert.equal(isOccluder(top), true);
        assert.equal(isHiddenByHigherOccluder(lower, [top]), true);
        assert.deepEqual(filterOccludedPlatforms([lower, top]).map(platform => platform.id), ['window:max']);

        const world = createWorldSnapshot({ x: 0, y: 0, width: 300, height: 200 }, [lower, top]);
        assert.equal(world.surfaces.some(surface => surface.id === 'window:lower'), false);
        assert.equal(supportAtBody(world, { x: 60, y: 30, width: 40, height: 50 }), null);
    });

    it('occlusion filtering preserves unoccluded surfaces and respects stacking order', () => {
        const highButNotCovering = {
            id: 'window:side',
            rect: { x: 180, y: 0, width: 100, height: 100 },
            stackIndex: 3,
            occludesLowerWindows: true,
        };
        const lower = { id: 'window:lower', rect: { x: 40, y: 120, width: 100, height: 60 }, stackIndex: 2 };
        const lowerOccluder = {
            id: 'window:below',
            rect: { x: 0, y: 0, width: 300, height: 200 },
            stackIndex: 1,
            occludesLowerWindows: true,
        };
        assert.deepEqual(
            filterOccludedPlatforms([lower, highButNotCovering, lowerOccluder]).map(platform => platform.id),
            ['window:lower', 'window:side', 'window:below']
        );
        const world = createWorldSnapshot({ x: 0, y: 0, width: 300, height: 200 }, [lower, highButNotCovering, lowerOccluder]);
        assert.equal(world.surfaces.some(surface => surface.id === 'window:lower'), true);
    });

    it('shell window adapter emits plain stacking and occluder metadata', () => {
        const platform = platformFromWindowActor({
            visible: true,
            meta_window: {
                minimized: false,
                get_frame_rect: () => ({ x: 0, y: 0, width: 300, height: 200 }),
                get_stable_sequence: () => 7,
                is_fullscreen: () => false,
                get_maximized: () => 3,
            },
        }, 4);
        assert.deepEqual(platform, {
            id: 'window:7',
            rect: { x: 0, y: 0, width: 300, height: 200 },
            visible: true,
            usableAsPlatform: true,
            source: 'window',
            stackIndex: 4,
            occludesLowerWindows: true,
        });

        const halfMaximized = platformFromWindowActor({
            visible: true,
            meta_window: {
                minimized: false,
                get_frame_rect: () => ({ x: 0, y: 0, width: 150, height: 200 }),
                get_stable_sequence: () => 8,
                is_fullscreen: () => false,
                get_maximized: () => 1,
            },
        }, 5);
        assert.equal(halfMaximized.occludesLowerWindows, false);
    });

    it('support revalidation keeps same non-ground support when geometry is unchanged', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const world = createWorldSnapshot(screen, [{ id: 'window:1', rect: { x: 40, y: 120, width: 160, height: 50 } }]);
        const body = { x: 60, y: 70, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 };
        const currentSupport = supportAtBody(world, body);
        const revalidated = revalidateSupport(world, body, currentSupport);
        assert.equal(revalidated.surfaceId, 'window:1');
        assert.equal(revalidated.topY, 120);
    });

    it('support revalidation invalidates moved window even when feet still overlap', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const initialWorld = createWorldSnapshot(screen, [{ id: 'window:1', rect: { x: 40, y: 120, width: 160, height: 50 } }]);
        const controller = new NoxV3Controller(state({
            screen,
            world: initialWorld,
            body: { x: 60, y: 70, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 },
        }));
        assert.equal(controller.state.support.surfaceId, 'window:1');

        const movedWorld = createWorldSnapshot(screen, [{ id: 'window:1', rect: { x: 40, y: 119, width: 160, height: 50 } }]);
        controller.tick(movedWorld);
        assert.equal(controller.state.support, null);
        assert.equal(controller.state.motion.mode, MotionMode.AIRBORNE);
        assert.equal(controller.state.body.y, 70);
    });

    it('support revalidation invalidates current support when a higher occluder covers it', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const lower = { id: 'window:lower', rect: { x: 40, y: 120, width: 160, height: 50 }, stackIndex: 1 };
        const initialWorld = createWorldSnapshot(screen, [lower]);
        const controller = new NoxV3Controller(state({
            screen,
            world: initialWorld,
            body: { x: 60, y: 70, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 },
        }));
        assert.equal(controller.state.support.surfaceId, 'window:lower');

        const coveredWorld = createWorldSnapshot(screen, [
            lower,
            { id: 'window:max', rect: { x: 0, y: 0, width: 300, height: 200 }, stackIndex: 2, occludesLowerWindows: true },
        ]);
        controller.tick(coveredWorld);
        assert.equal(controller.state.support, null);
        assert.equal(controller.state.motion.mode, MotionMode.AIRBORNE);
    });

    it('support revalidation makes Nox airborne when support disappears', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const initialWorld = createWorldSnapshot(screen, [{ id: 'window:1', rect: { x: 40, y: 120, width: 160, height: 50 } }]);
        const controller = new NoxV3Controller(state({
            screen,
            world: initialWorld,
            body: { x: 60, y: 70, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 },
        }));
        controller.tick(createWorldSnapshot(screen, [{ id: 'window:1', rect: { x: 220, y: 120, width: 60, height: 50 } }]));
        assert.equal(controller.state.support, null);
        assert.equal(controller.state.motion.mode, MotionMode.AIRBORNE);
    });

    it('walking on a platform clamps body bottom to platform top', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const world = createWorldSnapshot(screen, [{ id: 'window:1', rect: { x: 40, y: 120, width: 160, height: 50 } }]);
        const controller = new NoxV3Controller(state({
            screen,
            world,
            config: { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5 },
            locomotion: { walkRampTick: DEFAULT_RUNTIME_CONFIG.walkAccelerationTicks },
            body: { x: 60, y: 70, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));
        const result = controller.tick(world);
        assert.equal(result.node.id, 'ground.walk');
        assert.equal(result.state.body.x, 65);
        assert.equal(result.state.body.y + result.state.body.height, 120);
        assert.equal(result.state.support.surfaceId, 'window:1');
    });

    it('falling lands on platform before ground when crossing platform top', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const world = createWorldSnapshot(screen, [{ id: 'window:1', rect: { x: 40, y: 120, width: 160, height: 50 } }]);
        const update = stepAirborne(
            screen,
            { x: 60, y: 60, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 8 },
            { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5, gravity: 5, maxFallSpeed: 24 },
            world
        );
        assert.equal(update.landed, true);
        assert.equal(update.support.surfaceId, 'window:1');
        assert.equal(update.body.y, 70);
        assert.equal(update.motion.mode, MotionMode.GROUNDED);
    });

    it('edge primitives report support edge distances and projected leave state', () => {
        const surface = createPlatformSurface({ id: 'window:1', rect: { x: 40, y: 120, width: 160, height: 50 } });
        const body = { x: 52, y: 70, width: 40, height: 50, velocityX: -20 };
        const support = bodyOnSupport(body, supportAtBody(
            createWorldSnapshot({ x: 0, y: 0, width: 300, height: 200 }, [surface]),
            body
        ));
        const contact = supportAtBody(createWorldSnapshot({ x: 0, y: 0, width: 300, height: 200 }, [surface]), support);
        assert.equal(distanceToSupportLeftEdge(support, contact), 12);
        assert.equal(distanceToSupportRightEdge(support, contact), 108);
        assert.equal(isNearSupportEdge(support, contact, 15), true);
        assert.equal(projectedLeavesSupport(support, contact, -20), true);
        assert.equal(projectedLeavesSupport(support, contact, 5), false);
    });

    it('resets acceleration on wall flip and ramps back to max speed', () => {
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 10, walkAccelerationTicks: 2 };
        const maxX = 300 - 174 * config.scalePercent / 100;
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 300, height: 200 },
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            body: { x: maxX - 2, direction: 1, velocityX: 10 },
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

    it('drag threshold separates click/no-op from actual drag', () => {
        assert.equal(exceedsDragThreshold(10, 10, 10, 10), false);
        assert.equal(exceedsDragThreshold(10, 10, 14, 13), false);
        assert.equal(exceedsDragThreshold(10, 10, 17, 10), true);
    });

    it('simple click/no-op preserves controller body and motion state', () => {
        const controller = new NoxV3Controller(state({
            body: { x: 40, y: 70, width: 40, height: 50, direction: 1, velocityX: 4, velocityY: 0 },
        }));
        const before = JSON.stringify(controller.snapshot());
        assert.equal(exceedsDragThreshold(20, 20, 20, 20), false);
        assert.equal(JSON.stringify(controller.snapshot()), before);
    });

    it('below-threshold movement is still a no-op before controller drag starts', () => {
        const controller = new NoxV3Controller(state({
            body: { x: 40, y: 70, width: 40, height: 50, direction: 1, velocityX: 4, velocityY: 0 },
        }));
        const before = JSON.stringify(controller.snapshot());
        assert.equal(exceedsDragThreshold(20, 20, 23, 23), false);
        assert.equal(JSON.stringify(controller.snapshot()), before);
    });

    it('below-threshold press/release does not pause walking ticks', () => {
        const controller = new NoxV3Controller(state({
            config: { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5 },
            locomotion: { walkRampTick: DEFAULT_RUNTIME_CONFIG.walkAccelerationTicks },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));
        assert.equal(exceedsDragThreshold(20, 20, 23, 23), false);
        const walked = controller.tick();
        assert.equal(walked.node.id, 'ground.walk');
        assert.equal(walked.state.body.x, 45);
        assert.equal(walked.state.motion.mode, MotionMode.GROUNDED);
    });

    it('simple click can start a finite run burst without drag state', () => {
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 8, runSpeed: 14 };
        const controller = new NoxV3Controller(state({
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 8, velocityY: 0 },
        }));
        assert.equal(CLICK_RUN_MAX_DISTANCE, 8);
        assert.equal(controller.startRun(), true);
        assert.equal(controller.state.motion.mode, MotionMode.RUNNING);
        assert.equal(controller.activeAction.id, ActionStateId.RUN);
        assert.equal(controller.activeAction.phase, ActionPhase.RUNNING);
        assert.equal(controller.activeAction.ticksRemaining, DEFAULT_RUNTIME_CONFIG.runDurationTicks);
        assert.equal(controller.activeAction.startedOnSupportId, 'ground');
        assert.equal(controller.snapshot().activeAction.ticksRemaining, DEFAULT_RUNTIME_CONFIG.runDurationTicks);
        assert.equal(controller.state.body.velocityX, config.runSpeed * config.walkStartSpeedFactor);
    });

    it('controller startRun uses runtime config run duration', () => {
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 8, runDurationTicks: 21 };
        const controller = new NoxV3Controller(state({
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 8, velocityY: 0 },
        }));
        assert.equal(controller.startRun(), true);
        assert.equal(controller.activeAction.ticksRemaining, 21);
        for (let i = 0; i < 21; i++)
            controller.tick();
        assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);
        assert.equal(controller.activeAction, null);
    });

    it('above-threshold drag does not trigger run and starts airborne on release', () => {
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 300, height: 120 },
            body: { x: 40, y: 70, width: 40, height: 50, direction: 1, velocityX: 4, velocityY: 0 },
        }));
        assert.equal(exceedsDragThreshold(20, 20, 30, 20), true);
        controller.startDrag();
        controller.previewDrag(90, 30, { x: 10, y: 10 });
        controller.releaseDrag(90, 20, { x: 8, y: -2 });
        assert.equal(controller.state.motion.mode, MotionMode.AIRBORNE);
        assert.equal(controller.startRun(), false);
    });

    it('drag start cancels active run action', () => {
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 300, height: 120 },
            body: { x: 40, y: 70, width: 40, height: 50, direction: 1, velocityX: 4, velocityY: 0 },
        }));
        assert.equal(controller.startRun(), true);
        assert.equal(controller.activeAction.id, ActionStateId.RUN);
        controller.startDrag();
        assert.equal(controller.activeAction, null);
        assert.equal(controller.state.motion.mode, MotionMode.DRAGGING);
    });

    it('support loss cancels active run action and starts falling', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const platform = { id: 'window:1', rect: { x: 40, y: 120, width: 160, height: 50 } };
        const controller = new NoxV3Controller(state({
            screen,
            world: createWorldSnapshot(screen, [platform]),
            body: { x: 60, y: 70, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));
        assert.equal(controller.startRun(), true);
        assert.equal(controller.activeAction.startedOnSupportId, 'window:1');
        controller.tick(createWorldSnapshot(screen, []));
        assert.equal(controller.activeAction, null);
        assert.equal(controller.state.support, null);
        assert.equal(controller.state.motion.mode, MotionMode.AIRBORNE);
    });

    it('run ramps toward configured max speed and returns to walking after one run cycle', () => {
        const config = {
            ...DEFAULT_RUNTIME_CONFIG,
            walkSpeed: 8,
            runSpeed: 14,
            walkAccelerationTicks: 2,
        };
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 1200, height: 200 },
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 8, velocityY: 0 },
        }));
        controller.startRun();
        const firstRun = controller.tick();
        assert.equal(firstRun.node.id, 'ground.run');
        assert.equal(runSpeed(config), config.walkSpeed * RUN_SPEED_MULTIPLIER);
        assert.ok(Math.abs(firstRun.state.body.x - (40 + 4.9)) < 0.0001);
        assert.ok(Math.abs(firstRun.state.body.velocityX - 4.9) < 0.0001);
        assert.equal(firstRun.state.motion.mode, MotionMode.RUNNING);
        assert.equal(firstRun.state.activeAction.ticksRemaining, config.runDurationTicks - 1);

        const secondRun = controller.tick();
        assert.ok(Math.abs(secondRun.state.body.velocityX - 9.45) < 0.0001);

        const maxRun = controller.tick();
        assert.equal(maxRun.state.body.velocityX, 14);

        let current = maxRun;
        for (let i = 3; i < config.runDurationTicks; i++)
            current = controller.tick();
        assert.equal(current.state.motion.mode, MotionMode.GROUNDED);
        assert.equal(current.state.body.velocityX, config.walkSpeed);
        assert.equal(controller.tick().node.id, 'ground.walk');
    });

    it('run clamps and flips at screen wall', () => {
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 8, runSpeed: 14 };
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 120, height: 100 },
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            body: { x: 76, y: 50, width: 40, height: 50, direction: 1, velocityX: 8, velocityY: 0 },
        }));
        controller.startRun();
        const flipped = controller.tick();
        assert.equal(flipped.node.id, 'wall.flip');
        assert.equal(flipped.state.body.x, 80);
        assert.equal(flipped.state.body.direction, -1);
        assert.equal(flipped.state.motion.mode, MotionMode.GROUNDED);
        assert.equal(controller.activeAction, null);
    });

    it('message-visible speed modifier slows run movement while preserving ramp and configured max', () => {
        const baseConfig = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 10, runSpeed: 17.5 };
        const slowedConfig = messageMovementConfig(baseConfig, true);
        assert.equal(runSpeed(slowedConfig), 10 * 0.35 * RUN_SPEED_MULTIPLIER);
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 500, height: 200 },
            config: slowedConfig,
            locomotion: { walkRampTick: slowedConfig.walkAccelerationTicks },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 3.5, velocityY: 0 },
        }));
        controller.startRun();
        const result = controller.tick();
        assert.equal(result.state.body.x, 40 + 10 * 0.35 * RUN_SPEED_MULTIPLIER * slowedConfig.walkStartSpeedFactor);
        assert.ok(result.state.body.x > 40);
        assert.ok(result.state.body.x < 40 + 10 * RUN_SPEED_MULTIPLIER);
    });

    it('message-visible slowdown keeps active run on the same ramp instead of snapping to max speed', () => {
        const baseConfig = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 10, runSpeed: 17.5 };
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 500, height: 200 },
            config: baseConfig,
            locomotion: { walkRampTick: baseConfig.walkAccelerationTicks },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 10, velocityY: 0 },
        }));
        controller.startRun();
        controller.tick();
        controller.updateConfig(messageMovementConfig(baseConfig, true));
        const expected = 10 * 0.35 * RUN_SPEED_MULTIPLIER * (0.35 + 0.65 / 18);
        assert.ok(Math.abs(controller.state.body.velocityX - expected) < 0.0001);
    });

    it('message-visible slowdown reduces walking speed but keeps Nox moving and clears after hiding', () => {
        const baseConfig = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 10 };
        const controller = new NoxV3Controller(state({
            config: baseConfig,
            locomotion: { walkRampTick: baseConfig.walkAccelerationTicks },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 10, velocityY: 0 },
        }));
        const normal = controller.tick();
        assert.equal(normal.state.body.x, 50);

        controller.updateConfig(messageMovementConfig(baseConfig, true));
        const slowed = controller.tick();
        assert.ok(slowed.state.body.x > normal.state.body.x);
        assert.ok(slowed.state.body.x < normal.state.body.x + baseConfig.walkSpeed);
        assert.equal(slowed.state.body.velocityX, 3.5);

        controller.updateConfig(messageMovementConfig(baseConfig, false));
        const restored = controller.tick();
        assert.equal(restored.state.body.velocityX, 10);
        assert.equal(restored.state.body.x, slowed.state.body.x + 10);
    });

    it('message-visible speed modifier does not rewrite airborne velocity', () => {
        const baseConfig = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 10 };
        const controller = new NoxV3Controller(state({
            config: baseConfig,
            motion: { mode: MotionMode.AIRBORNE },
            body: { x: 40, y: 40, width: 40, height: 50, direction: 1, velocityX: 7, velocityY: -2 },
        }));
        controller.updateConfig(messageMovementConfig(baseConfig, true));
        assert.equal(controller.state.body.velocityX, 7);
        assert.equal(controller.state.body.velocityY, -2);
        assert.equal(controller.state.motion.mode, MotionMode.AIRBORNE);
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

    it('above-threshold movement enters drag and release starts airborne physics', () => {
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 300, height: 120 },
            body: { x: 40, y: 70, width: 40, height: 50, direction: 1, velocityX: 4, velocityY: 0 },
        }));
        assert.equal(exceedsDragThreshold(20, 20, 30, 20), true);
        controller.startDrag();
        controller.previewDrag(90, 30, { x: 10, y: 10 });
        assert.equal(controller.state.motion.mode, MotionMode.DRAGGING);
        controller.releaseDrag(90, 20, { x: 8, y: -2 });
        assert.equal(controller.state.motion.mode, MotionMode.AIRBORNE);
        assert.equal(controller.state.body.velocityX, 8);
        assert.equal(controller.state.body.velocityY, -2);
    });

    it('keeps Gio/GSettings out of controller and action modules', () => {
        for (const file of [
            'extension/src/core/controller.js',
            'extension/src/actions/walk.js',
            'extension/src/actions/run.js',
            'extension/src/actions/flip-at-wall.js',
        ]) {
            const source = readFileSync(join(root, file), 'utf8');
            assert.doesNotMatch(source, /gi:\/\//);
            assert.doesNotMatch(source, /Gio|GSettings|get_int|get_string/);
        }
    });

    it('keeps GNOME window objects at the actor or shell adapter boundary', () => {
        const shellSource = readFileSync(join(root, 'extension/src/shell/windows.js'), 'utf8');
        assert.match(shellSource, /get_window_actors/);
        assert.match(shellSource, /meta_window/);
        assert.match(shellSource, /get_frame_rect/);

        for (const file of [
            'extension/src/core/controller.js',
            'extension/src/core/context.js',
            'extension/src/core/physics.js',
            'extension/src/actions/walk.js',
            'extension/src/actions/run.js',
            'extension/src/actions/flip-at-wall.js',
            'extension/src/world/screen.js',
            'extension/src/world/surface.js',
            'extension/src/world/world.js',
            'extension/src/world/support.js',
            'extension/src/world/edge.js',
            'extension/src/world/occlusion.js',
        ]) {
            const source = readFileSync(join(root, file), 'utf8');
            assert.doesNotMatch(source, /resource:\/\/\/|gi:\/\//);
            assert.doesNotMatch(source, /\bMain\b|\bMeta\b|\bClutter\b|\bSt\b|global\.get_window_actors|meta_window|get_frame_rect/);
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
        assert.match(actorSource, /pendingDrag/);
        assert.match(actorSource, /exceedsDragThreshold/);
        assert.match(actorSource, /CLICK_RUN_MAX_DISTANCE/);
        assert.match(actorSource, /'gravity-profile'/);
        assert.doesNotMatch(actorSource, /'nox-scale-percent'/);
        assert.doesNotMatch(actorSource, /'movement-profile'/);
        assert.doesNotMatch(actorSource, /'walking-speed-percent'/);
        assert.doesNotMatch(actorSource, /'run-length-ticks'/);
        assert.doesNotMatch(actorSource, /'run-speed-percent'/);
        assert.match(actorSource, /button-press-event/);
        assert.match(actorSource, /motion-event/);
        assert.match(actorSource, /button-release-event/);
        assert.match(actorSource, /#tick\(\) \{\s*if \(this\.drag\)\s*return;/s);
        assert.match(actorSource, /controller\.previewDrag/);
        assert.match(actorSource, /controller\.startDrag/);
        assert.match(actorSource, /controller\.startRun/);
        assert.match(actorSource, /controller\.releaseDrag/);
        assert.match(actorSource, /createWorldSnapshot/);
        assert.match(actorSource, /windowPlatformSurfaces/);
        assert.match(actorSource, /controller\.tick\(this\.#worldSnapshot\(\)\)/);
        assert.match(actorSource, /createDragTracker/);
        assert.match(actorSource, /recordPointerSample/);
        assert.match(actorSource, /estimateThrowVelocity/);
        assert.match(actorSource, /nox-v3-drag-shield/);
        assert.match(actorSource, /#createDragShield/);
        assert.match(actorSource, /#destroyDragShield/);
        assert.match(actorSource, /pendingDrag = null/);
        assert.match(actorSource, /clickDistance\(pendingDrag, stageX, stageY\) <= CLICK_RUN_MAX_DISTANCE/);
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

    it('actor loads separate walk and run frame sets and uses run cadence during run state', () => {
        const actorSource = readFileSync(join(root, 'extension/src/actor.js'), 'utf8');
        assert.match(actorSource, /loadAnimationFrames/);
        assert.match(actorSource, /walk: loadNumberedFrames\(root\.get_child\('walk'\), WALK_FRAME_COUNT\)/);
        assert.match(actorSource, /run: loadNumberedFrames\(root\.get_child\('run'\), RUN_FRAME_COUNT\)/);
        assert.match(actorSource, /this\.controller\.state\.motion\.mode === MotionMode\.RUNNING/);
        assert.match(actorSource, /mode === MotionMode\.RUNNING \? this\.frames\.run : this\.frames\.walk/);
        assert.match(actorSource, /mode === MotionMode\.RUNNING \? RUN_FRAME_TICKS : this\.config\.walkFrameTicks/);
        assert.equal(RUN_FRAME_COUNT, 14);
        assert.equal(RUN_FRAME_TICKS, 1);
    });

    it('controller keeps run duration and speed configurable without changing frame cadence baseline', () => {
        const controllerSource = readFileSync(join(root, 'extension/src/core/controller.js'), 'utf8');
        const constantsSource = readFileSync(join(root, 'extension/src/core/constants.js'), 'utf8');
        const runSource = readFileSync(join(root, 'extension/src/actions/run.js'), 'utf8');
        const actionStateSource = readFileSync(join(root, 'extension/src/core/action-state.js'), 'utf8');
        assert.match(actionStateSource, /ticksRemaining: config\.runDurationTicks/);
        assert.doesNotMatch(controllerSource, /runTicksRemaining/);
        assert.doesNotMatch(runSource, /motion\.runTicksRemaining/);
        assert.match(controllerSource, /activeAction/);
        assert.match(controllerSource, /#cancelActiveAction/);
        assert.match(controllerSource, /this\.state\.config\.runSpeed \* this\.state\.config\.walkStartSpeedFactor/);
        assert.match(runSource, /runRampSpeed\(context\.config, rampTick\)/);
        assert.match(runSource, /nextRunRampTick\(context\.config, rampTick\)/);
        assert.match(runSource, /nextRunActionState\(context\.activeAction\)/);
        assert.match(constantsSource, /export const RUN_FRAME_TICKS = 1;/);
        assert.match(constantsSource, /export const RUN_SPEED_MULTIPLIER = 1\.75;/);
    });

    it('bubble layout follows Nox and clamps inside all screen edges', () => {
        const screen = { x: 0, y: 0, width: 300, height: 220 };
        const topLeft = bubbleLayout(screen, { x: 0, y: 0, width: 40, height: 50 });
        assert.ok(topLeft.x >= 0);
        assert.ok(topLeft.y >= 0);
        const right = bubbleLayout(screen, { x: 290, y: 100, width: 40, height: 50 });
        assert.ok(right.x + right.width <= screen.width);
        const bottom = bubbleLayout(screen, { x: 150, y: 210, width: 40, height: 50 });
        assert.ok(bottom.y + bottom.height <= screen.height);
    });

    it('long message bubble expands/wraps while staying inside screen bounds', () => {
        const screen = { x: 0, y: 0, width: 360, height: 260 };
        const longText = 'This is a long Nox notification message that must be displayed fully without ellipsis or truncation even when the bubble is near the edge.';
        const layout = bubbleLayout(screen, { x: 330, y: 20, width: 40, height: 50 }, longText);
        assert.ok(layout.width > 220);
        assert.ok(layout.width <= screen.width - 16);
        assert.ok(layout.height > 72);
        assert.ok(layout.x >= 0);
        assert.ok(layout.y >= 0);
        assert.ok(layout.x + layout.width <= screen.width);
        assert.ok(layout.y + layout.height <= screen.height);
        assert.ok(bubbleTextWidth(layout) < layout.width);
    });

    it('message receive path is view-only and does not touch behavior controller actions', () => {
        const actorSource = readFileSync(join(root, 'extension/src/actor.js'), 'utf8');
        assert.match(actorSource, /#showMessageBubble\(message\)/);
        assert.match(actorSource, /label: 'OK'/);
        assert.match(actorSource, /label: '<'/);
        assert.match(actorSource, /label: '>'/);
        assert.match(actorSource, /bubbleCounter/);
        assert.match(actorSource, /messageControls\(this\.messageQueue\)/);
        assert.match(actorSource, /this\.bubbleCounter\.text = controls\.counterLabel/);
        assert.match(actorSource, /this\.bubblePreviousButton\.visible = controls\.canPrevious/);
        assert.match(actorSource, /this\.bubbleNextButton\.visible = controls\.canNext/);
        assert.match(actorSource, /this\.bubbleButton\.visible = controls\.canDone/);
        assert.match(actorSource, /#showPreviousMessage/);
        assert.match(actorSource, /#showNextMessage/);
        assert.match(actorSource, /previousMessage\(this\.messageQueue\)/);
        assert.match(actorSource, /nextMessage\(this\.messageQueue\)/);
        assert.match(actorSource, /#ackVisibleMessage/);
        assert.match(actorSource, /ackDisplayedSequence/);
        assert.match(actorSource, /connection\?\.ackAll\(result\.ackLastId\)/);
        assert.doesNotMatch(actorSource, /ackAll\(message\.id\)/);
        assert.doesNotMatch(actorSource, /#setConnectionState\('message'\)/);
        assert.match(actorSource, /set_line_wrap\(true\)/);
        assert.match(actorSource, /set_line_wrap_mode\(Pango\.WrapMode\.WORD_CHAR\)/);
        assert.match(actorSource, /set_ellipsize\(Pango\.EllipsizeMode\.NONE\)/);
        assert.match(actorSource, /messageMovementConfig\(this\.config, this\.#messageBubbleVisible\(\)\)/);
        assert.match(actorSource, /#syncControllerConfig/);
        assert.match(actorSource, /#messageBubbleVisible/);
        assert.doesNotMatch(actorSource, /ELLIPSIZE_END|EllipsizeMode\.END|ellipsize:\s*true|text-overflow|truncate/i);
        assert.doesNotMatch(actorSource, /triggerMessage|messageAnimation|test-trigger-message|startMessage|messageAction/);
    });

    it('actor clears forced grayscale for color states and forces grayscale for disconnected states', () => {
        const actorSource = readFileSync(join(root, 'extension/src/actor.js'), 'utf8');
        assert.match(actorSource, /connectionIconVisualPlan\(this\.connectionState\)/);
        assert.match(actorSource, /this\.icon\.opacity = plan\.opacity/);
        assert.match(actorSource, /removeNamedEffect\(this\.icon, plan\.effectName\)/);
        assert.match(actorSource, /if \(plan\.forceGrayscale && Clutter\.DesaturateEffect && this\.icon\.add_effect_with_name\)/);
        assert.match(actorSource, /this\.icon\.add_effect_with_name\(plan\.effectName, new Clutter\.DesaturateEffect\(\{ factor: 1\.0 \}\)\)/);
        assert.match(actorSource, /function removeNamedEffect\(actor, effectName\)/);
        assert.match(actorSource, /actor\.remove_effect_by_name\?\.\(effectName\)/);
        assert.match(actorSource, /actor\.get_effect\?\.\(effectName\)/);
        assert.match(actorSource, /actor\.remove_effect\?\.\(effect\)/);
        assert.doesNotMatch(actorSource, /add_style_class_name\(['"]nox-v3-connection/);
        assert.doesNotMatch(actorSource, /style_class: ['"][^'"]*grayscale/);
    });

    it('keeps transport imports out of physics, controller, and action modules', () => {
        for (const file of [
            'extension/src/core/controller.js',
            'extension/src/core/physics.js',
            'extension/src/actions/walk.js',
            'extension/src/actions/run.js',
            'extension/src/actions/flip-at-wall.js',
        ]) {
            const source = readFileSync(join(root, file), 'utf8');
            assert.doesNotMatch(source, /connection\/|transport|Soup|websocket|ack_all|helloFrame|message\//);
        }
    });
});
