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
import {
    CLICK_RUN_MAX_DISTANCE,
    FATIGUE_MAX,
    FATIGUE_REST_THRESHOLD,
    FATIGUE_RUN_DRAIN,
    FATIGUE_WALK_DRAIN,
    GENERATED_JUMP_AIR_START_FRAME,
    GENERATED_JUMP_END_FRAME,
    GENERATED_JUMP_RECEPTION_START_FRAME,
    GENERATED_JUMP_TAKEOFF_FRAME,
    JETPACK_END_FRAME,
    JETPACK_EQUIP_START_FRAME,
    JETPACK_IGNITION_START_FRAME,
    JETPACK_INITIAL_HORIZONTAL_SPEED,
    JETPACK_INITIAL_LIFT_SPEED,
    JETPACK_LANDING_END_FRAME,
    JETPACK_LANDING_START_FRAME,
    JETPACK_LAUNCH_FRAME,
    JETPACK_LIFT_END_FRAME,
    JETPACK_MIN_DISTANCE,
    JETPACK_MIN_UPWARD_DISTANCE,
    JETPACK_CRUISE_END_FRAME,
    JETPACK_POWERED_END_FRAME,
    JETPACK_PROTECTED_END_FRAME,
    JETPACK_PROTECTED_START_FRAME,
    JETPACK_RECOVERY_START_FRAME,
    JETPACK_RECEPTION_TICKS,
    REST_CHECK_DC,
    REST_CHECK_DICE,
    REST_CHECK_INTERVAL_TICKS,
    REST_DECELERATION_TICKS,
    JUMP_CHECK_DC,
    JUMP_CHECK_INTERVAL_TICKS,
    JUMP_FATIGUE_MIN,
    JUMP_FRAME_COUNT,
    JUMP_FRAME_STEP,
    JUMP_GENERATED_FRAME_COUNT,
    JUMP_HOLD_FRAME,
    JUMP_JETPACK_FRAME_COUNT,
    JUMP_LANDING_FRAMES,
    JUMP_REACH_DISTANCE,
    JUMP_REACH_SIMULATION_TICKS,
    JUMP_RECEPTION_TICKS,
    JUMP_TAKEOFF_FRAMES,
    JUMP_TAKEOFF_TICKS,
    JUMP_TRAJECTORY_GRAVITY,
    JumpAnimationVariant,
    REST_FRAME_COUNT,
    REST_PROFILE_FRAME_COUNT,
    REST_FRAME_TICKS,
    RUN_FRAME_COUNT,
    RUN_FRAME_TICKS,
    RUN_SPEED_MULTIPLIER,
} from '../extension/src/core/constants.js';
import { runSpeed } from '../extension/src/actions/run.js';
import { walkRampSpeed } from '../extension/src/core/locomotion.js';
import { ActionPhase, ActionStateId } from '../extension/src/core/action-state.js';
import { createWorldSnapshot } from '../extension/src/world/world.js';
import { createGroundSurface, createPlatformSurface, SurfaceKind } from '../extension/src/world/surface.js';
import { filterOccludedPlatforms, isHiddenByHigherOccluder, isOccluder } from '../extension/src/world/occlusion.js';
import { distanceToSupportLeftEdge, distanceToSupportRightEdge, isNearSupportEdge, projectedLeavesSupport } from '../extension/src/world/edge.js';
import { affordableJumpCandidates, reachableJumps } from '../extension/src/world/reach.js';
import {
    bodyOnSupport,
    landingSupport,
    revalidateSupport,
    SUPPORT_FOOT_EDGE_TOLERANCE,
    supportAtBody,
    surfaceTopBlockedAt,
} from '../extension/src/world/support.js';
import { platformFromWindowActor } from '../extension/src/shell/windows.js';
import { AnimationPlayback, RenderMode } from '../extension/src/animation/playback.js';

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
        needs: overrides.needs,
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

    it('partial higher-window overlap blocks only the covered lower-window top interval', () => {
        const lower = { id: 'window:lower', rect: { x: 40, y: 120, width: 220, height: 80 }, stackIndex: 1 };
        const higher = { id: 'window:higher', rect: { x: 100, y: 90, width: 80, height: 120 }, stackIndex: 2 };
        const filtered = filterOccludedPlatforms([lower, higher]);
        const lowerPlatform = filtered.find(platform => platform.id === 'window:lower');
        assert.deepEqual(lowerPlatform.blockedTopIntervals, [{ left: 100, right: 180 }]);

        const world = createWorldSnapshot({ x: 0, y: 0, width: 320, height: 300 }, [lower, higher]);
        const lowerSurface = world.surfaces.find(surface => surface.id === 'window:lower');
        assert.equal(surfaceTopBlockedAt(lowerSurface, 140), true);
        assert.equal(surfaceTopBlockedAt(lowerSurface, 90), false);
        assert.equal(supportAtBody(world, { x: 120, y: 70, width: 40, height: 50 }), null);
        assert.equal(supportAtBody(world, { x: 60, y: 70, width: 40, height: 50 })?.surfaceId, 'window:lower');
    });

    it('landing and reach avoid covered lower-window top intervals', () => {
        const screen = { x: 0, y: 0, width: 420, height: 320 };
        const lowerTarget = { id: 'window:lower', rect: { x: 100, y: 140, width: 220, height: 80 }, stackIndex: 1 };
        const higherCover = { id: 'window:higher', rect: { x: 100, y: 100, width: 80, height: 120 }, stackIndex: 2 };
        const world = createWorldSnapshot(screen, [lowerTarget, higherCover]);
        const previousCovered = { x: 120, y: 80, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 8 };
        const nextCovered = { ...previousCovered, y: 100, velocityY: 20 };
        assert.equal(landingSupport(world, previousCovered, nextCovered), null);
        const previousOpen = { ...previousCovered, x: 220 };
        const nextOpen = { ...nextCovered, x: 220 };
        assert.equal(landingSupport(world, previousOpen, nextOpen)?.surfaceId, 'window:lower');

        const body = { x: 120, y: 270, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 };
        const support = supportAtBody(world, body);
        const supportedBody = bodyOnSupport(body, support);
        const candidate = reachableJumps(world, supportedBody, support, { ...DEFAULT_RUNTIME_CONFIG, jumpReachDistance: 260 })
            .find(item => item.targetSurfaceId === 'window:lower');
        assert.ok(candidate);
        assert.equal(candidate.landingX, 161);
        assert.equal(surfaceTopBlockedAt(world.surfaces.find(surface => surface.id === 'window:lower'), candidate.landingX + body.width / 2), false);
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

    it('keeps platform support for tiny foot-center edge tolerance only', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const world = createWorldSnapshot(screen, [{ id: 'window:1', rect: { x: 40, y: 120, width: 80, height: 50 } }]);
        const tolerated = supportAtBody(world, {
            x: 120 + SUPPORT_FOOT_EDGE_TOLERANCE - 20,
            y: 70,
            width: 40,
            height: 50,
        });
        const beyond = supportAtBody(world, {
            x: 120 + SUPPORT_FOOT_EDGE_TOLERANCE + 0.01 - 20,
            y: 70,
            width: 40,
            height: 50,
        });
        assert.equal(tolerated.surfaceId, 'window:1');
        assert.equal(beyond, null);
    });

    it('walking off a window edge starts falling when foot center leaves the platform tolerance', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const world = createWorldSnapshot(screen, [{ id: 'window:1', rect: { x: 40, y: 120, width: 80, height: 50 } }]);
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5 };
        const controller = new NoxV3Controller(state({
            screen,
            world,
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            body: { x: 97, y: 70, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));
        assert.equal(controller.state.support.surfaceId, 'window:1');
        assert.equal(controller.state.body.x + controller.state.body.width / 2, 117);

        const result = controller.tick(world);
        assert.equal(result.node.id, 'ground.walk');
        assert.equal(result.state.body.x, 102);
        assert.equal(result.state.body.x + result.state.body.width / 2, 122);
        assert.equal(result.state.support.surfaceId, 'window:1');

        const falling = controller.tick(world);
        assert.equal(falling.node.id, 'ground.walk');
        assert.equal(falling.state.body.x, 107);
        assert.ok(falling.state.body.x + falling.state.body.width / 2 > 120 + SUPPORT_FOOT_EDGE_TOLERANCE);
        assert.equal(falling.state.support, null);
        assert.equal(falling.state.motion.mode, MotionMode.AIRBORNE);
    });

    it('running off a window edge starts falling at the same support threshold', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const world = createWorldSnapshot(screen, [{ id: 'window:1', rect: { x: 40, y: 120, width: 80, height: 50 } }]);
        const config = {
            ...DEFAULT_RUNTIME_CONFIG,
            walkSpeed: 5,
            runSpeed: 12,
            walkAccelerationTicks: 2,
        };
        const controller = new NoxV3Controller(state({
            screen,
            world,
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            body: { x: 99, y: 70, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));
        assert.equal(controller.startRun(), true);

        const result = controller.tick(world);
        assert.equal(result.node.id, 'ground.run');
        assert.ok(result.state.body.x + result.state.body.width / 2 > 120 + SUPPORT_FOOT_EDGE_TOLERANCE);
        assert.equal(result.state.support, null);
        assert.equal(result.state.motion.mode, MotionMode.AIRBORNE);
        assert.equal(result.state.activeAction, null);
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

    it('jump reach scans deterministic upward support candidates inside one reach distance', () => {
        const screen = { x: 0, y: 0, width: 900, height: 420 };
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5, jumpReachDistance: 260 };
        const body = { x: 40, y: 170, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 };
        const world = createWorldSnapshot(screen, [
            { id: 'start', rect: { x: 20, y: 220, width: 80, height: 50 } },
            { id: 'up-near', rect: { x: 80, y: 120, width: 220, height: 50 } },
            { id: 'level', rect: { x: 140, y: 220, width: 240, height: 50 } },
            { id: 'down', rect: { x: 150, y: 260, width: 300, height: 50 } },
            { id: 'up-far', rect: { x: 520, y: 120, width: 220, height: 50 } },
        ]);
        const support = supportAtBody(world, body);
        const supportedBody = bodyOnSupport(body, support);
        const candidates = reachableJumps(world, supportedBody, support, config, {
            animationVariant: JumpAnimationVariant.GENERATED,
        });
        const repeated = reachableJumps(world, supportedBody, support, config, {
            animationVariant: JumpAnimationVariant.GENERATED,
        });
        assert.deepEqual(candidates, repeated);
        assert.deepEqual(candidates.map(candidate => candidate.targetSurfaceId), ['up-near']);
        const candidate = candidates[0];
        assert.equal(candidate.kind, 'up');
        assert.equal(candidate.animationVariant, JumpAnimationVariant.GENERATED);
        assert.equal(candidate.landingX, 80);
        assert.equal(candidate.targetY, 70);
        assert.equal(candidate.distance, Math.hypot(40, 100));
        assert.ok(candidate.launchVelocity.x > 0);
        assert.ok(candidate.launchVelocity.y < 0);
        assert.ok(candidate.airTicks > 0 && candidate.airTicks <= JUMP_REACH_SIMULATION_TICKS);
        assert.deepEqual(affordableJumpCandidates(candidates, 100, JUMP_FATIGUE_MIN), candidates);
        assert.deepEqual(affordableJumpCandidates(candidates, JUMP_FATIGUE_MIN + 1, JUMP_FATIGUE_MIN), []);
    });

    it('jump reach chooses the nearest landing point on each upward target surface', () => {
        const screen = { x: 0, y: 0, width: 900, height: 300 };
        const body = { x: 200, y: 250, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 };
        for (const target of [
            { id: 'right-window', rect: { x: 260, y: 120, width: 280, height: 50 }, expectedX: 260 },
            { id: 'left-window', rect: { x: 80, y: 120, width: 120, height: 50 }, expectedX: 160 },
        ]) {
            const world = createWorldSnapshot(screen, [target]);
            const support = supportAtBody(world, body);
            const supportedBody = bodyOnSupport(body, support);
            const candidate = reachableJumps(world, supportedBody, support, { ...DEFAULT_RUNTIME_CONFIG, jumpReachDistance: 240 })
                .find(item => item.targetSurfaceId === target.id);
            assert.ok(candidate, target.id);
            assert.equal(candidate.landingX, target.expectedX);
            assert.ok(candidate.landingX >= target.rect.x);
            assert.ok(candidate.landingX <= target.rect.x + target.rect.width - body.width);
        }
    });

    it('jump reach finds diagonal upward windows from still or wrong-facing states', () => {
        const screen = { x: 0, y: 0, width: 700, height: 320 };
        const target = { id: 'above', rect: { x: 150, y: 160, width: 120, height: 50 } };
        const cases = [
            { x: 90, y: 270, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 },
            { x: 90, y: 270, width: 40, height: 50, direction: -1, velocityX: 0, velocityY: 0 },
            { x: 90, y: 270, width: 40, height: 50, direction: -1, velocityX: -5, velocityY: 0 },
        ];

        for (const body of cases) {
            const world = createWorldSnapshot(screen, [target]);
            const support = supportAtBody(world, body);
            const supportedBody = bodyOnSupport(body, support);
            const candidate = reachableJumps(world, supportedBody, support, { ...DEFAULT_RUNTIME_CONFIG, jumpReachDistance: 240 })
                .find(item => item.targetSurfaceId === 'above');

            assert.ok(candidate, `${body.x}/${body.direction}/${body.velocityX}`);
            assert.equal(candidate.kind, 'up');
            assert.ok(candidate.launchVelocity.y < 0);
            assert.ok(candidate.airTicks > 0 && candidate.airTicks <= JUMP_REACH_SIMULATION_TICKS);
        }
    });

    it('jump reach supports window-to-window diagonal upward targets inside reach', () => {
        const screen = { x: 0, y: 0, width: 700, height: 360 };
        const world = createWorldSnapshot(screen, [
            { id: 'start', rect: { x: 80, y: 260, width: 140, height: 50 } },
            { id: 'upper', rect: { x: 250, y: 150, width: 160, height: 50 } },
        ]);
        const body = { x: 110, y: 210, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 };
        const support = supportAtBody(world, body);
        const supportedBody = bodyOnSupport(body, support);
        const candidate = reachableJumps(world, supportedBody, support, { ...DEFAULT_RUNTIME_CONFIG, jumpReachDistance: 260 })
            .find(item => item.targetSurfaceId === 'upper');

        assert.equal(support.surfaceId, 'start');
        assert.ok(candidate);
        assert.equal(candidate.kind, 'up');
        assert.equal(candidate.landingX, 250);
        assert.equal(candidate.targetY, 100);
        assert.ok(candidate.launchVelocity.x > 0);
        assert.ok(candidate.launchVelocity.y < 0);
    });

    it('jump reach accepts pure vertical upward targets and rejects horizontal or downward targets', () => {
        const screen = { x: 0, y: 0, width: 700, height: 360 };
        const body = { x: 180, y: 310, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 };
        const world = createWorldSnapshot(screen, [
            { id: 'horizontal', rect: { x: 260, y: 360, width: 140, height: 50 } },
            { id: 'vertical', rect: { x: 160, y: 180, width: 140, height: 50 } },
            { id: 'down', rect: { x: 260, y: 390, width: 140, height: 50 } },
            { id: 'diagonal-up', rect: { x: 300, y: 180, width: 140, height: 50 } },
        ]);
        const support = supportAtBody(world, body);
        const supportedBody = bodyOnSupport(body, support);
        const candidates = reachableJumps(world, supportedBody, support, { ...DEFAULT_RUNTIME_CONFIG, jumpReachDistance: 260 });

        assert.equal(candidates.some(candidate => candidate.targetSurfaceId === 'horizontal'), false);
        assert.equal(candidates.some(candidate => candidate.targetSurfaceId === 'down'), false);
        assert.deepEqual(candidates.map(candidate => candidate.targetSurfaceId), ['vertical', 'diagonal-up']);
        const vertical = candidates.find(candidate => candidate.targetSurfaceId === 'vertical');
        assert.equal(vertical.landingX, body.x);
        assert.equal(vertical.launchVelocity.x, 0);
        assert.ok(vertical.launchVelocity.y < 0);
    });

    it('increasing Jump Reach expands valid upward windows', () => {
        const screen = { x: 0, y: 0, width: 900, height: 420 };
        const target = { id: 'high', rect: { x: 280, y: 100, width: 140, height: 50 } };
        const world = createWorldSnapshot(screen, [target]);
        const body = { x: 170, y: 370, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 };
        const support = supportAtBody(world, body);
        const supportedBody = bodyOnSupport(body, support);
        const weakConfig = {
            ...DEFAULT_RUNTIME_CONFIG,
            walkSpeed: 5,
            jumpReachDistance: 250,
        };
        const strongConfig = {
            ...DEFAULT_RUNTIME_CONFIG,
            walkSpeed: 5,
            jumpReachDistance: 360,
        };

        const weak = reachableJumps(world, supportedBody, support, weakConfig)
            .find(candidate => candidate.targetSurfaceId === 'high');
        const strong = reachableJumps(world, supportedBody, support, strongConfig)
            .find(candidate => candidate.targetSurfaceId === 'high');

        assert.equal(weak, undefined);
        assert.ok(strong);
        assert.equal(strong.distance <= strongConfig.jumpReachDistance, true);
        assert.ok(strong.launchVelocity.x > 0);
        assert.ok(strong.launchVelocity.y < 0);
    });

    it('jump launch power scales down for small upward hops and up for farther higher targets', () => {
        const screen = { x: 0, y: 0, width: 900, height: 360 };
        const body = { x: 120, y: 310, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 };
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5, jumpReachDistance: 500 };
        const world = createWorldSnapshot(screen, [
            { id: 'small-hop', rect: { x: 130, y: 320, width: 160, height: 50 } },
            { id: 'high-hop', rect: { x: 360, y: 140, width: 160, height: 50 } },
        ]);
        const support = supportAtBody(world, body);
        const supportedBody = bodyOnSupport(body, support);
        const candidates = reachableJumps(world, supportedBody, support, config);
        const small = candidates.find(candidate => candidate.targetSurfaceId === 'small-hop');
        const high = candidates.find(candidate => candidate.targetSurfaceId === 'high-hop');

        assert.ok(small);
        assert.ok(high);
        assert.ok(Math.abs(small.launchVelocity.y) < Math.abs(high.launchVelocity.y));
        assert.ok(Math.abs(small.launchVelocity.x) < Math.abs(high.launchVelocity.x));
        assert.ok(small.fatigueCost < high.fatigueCost);
        assert.ok(small.airTicks < high.airTicks);
    });

    it('jump reach keeps small hops classic and chooses jetpack for large upward targets', () => {
        const screen = { x: 0, y: 0, width: 900, height: 420 };
        const body = { x: 120, y: 370, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 };
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5, jumpReachDistance: 520 };
        const world = createWorldSnapshot(screen, [
            { id: 'small-hop', rect: { x: 130, y: 380, width: 160, height: 50 } },
            { id: 'large-hop', rect: { x: 360, y: 150, width: 160, height: 50 } },
        ]);
        const support = supportAtBody(world, body);
        const supportedBody = bodyOnSupport(body, support);
        const candidates = reachableJumps(world, supportedBody, support, config);
        const small = candidates.find(candidate => candidate.targetSurfaceId === 'small-hop');
        const large = candidates.find(candidate => candidate.targetSurfaceId === 'large-hop');

        assert.ok(small.distance < JETPACK_MIN_DISTANCE);
        assert.ok(small.upwardDistance < JETPACK_MIN_UPWARD_DISTANCE);
        assert.equal(small.animationVariant, JumpAnimationVariant.V1);
        assert.ok(large.distance >= JETPACK_MIN_DISTANCE || large.upwardDistance >= JETPACK_MIN_UPWARD_DISTANCE);
        assert.equal(large.animationVariant, JumpAnimationVariant.JETPACK);
    });

    it('manual jetpack variant uses the same z-aware reach candidates without changing the chosen landing point', () => {
        const screen = { x: 0, y: 0, width: 800, height: 420 };
        const body = { x: 120, y: 370, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 };
        const world = createWorldSnapshot(screen, [
            { id: 'target', rect: { x: 180, y: 240, width: 220, height: 50 }, stackIndex: 1 },
            { id: 'cover', rect: { x: 180, y: 230, width: 90, height: 50 }, stackIndex: 2, occludesLowerWindows: true },
        ]);
        const support = supportAtBody(world, body);
        const supportedBody = bodyOnSupport(body, support);
        const candidate = reachableJumps(world, supportedBody, support, { ...DEFAULT_RUNTIME_CONFIG, jumpReachDistance: 260 }, {
            animationVariant: JumpAnimationVariant.JETPACK,
        }).find(item => item.targetSurfaceId === 'target');

        assert.ok(candidate);
        assert.equal(candidate.animationVariant, JumpAnimationVariant.JETPACK);
        assert.equal(candidate.landingX, 251);
        assert.equal(candidate.targetY, 190);
        assert.equal(surfaceTopBlockedAt(world.surfaces.find(surface => surface.id === 'target'), candidate.landingX + body.width / 2), false);
    });

    it('jump reach ignores the current support, rejects far upward surfaces, and never creates down candidates', () => {
        const screen = { x: 0, y: 0, width: 2400, height: 300 };
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5, gravity: 1.2, jumpReachDistance: 260 };
        const world = createWorldSnapshot(screen, [
            { id: 'start', rect: { x: 40, y: 160, width: 100, height: 50 } },
            { id: 'up-near', rect: { x: 130, y: 80, width: 100, height: 50 } },
            { id: 'down', rect: { x: 180, y: 220, width: 100, height: 50 } },
            { id: 'too-far', rect: { x: 2100, y: 80, width: 40, height: 50 } },
        ]);
        const body = { x: 70, y: 110, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 };
        const support = supportAtBody(world, body);
        const supportedBody = bodyOnSupport(body, support);
        const candidates = reachableJumps(world, supportedBody, support, config);

        assert.equal(candidates.some(candidate => candidate.targetSurfaceId === 'start'), false);
        assert.equal(candidates.some(candidate => candidate.targetSurfaceId === 'too-far'), false);
        assert.equal(candidates.some(candidate => candidate.targetSurfaceId === 'down'), false);
        assert.deepEqual(candidates.map(candidate => candidate.targetSurfaceId), ['up-near']);
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

    it('fatigue starts full and walking drains it within bounds', () => {
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5 };
        const controller = new NoxV3Controller(state({
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));
        assert.equal(controller.state.needs.fatigue, FATIGUE_MAX);
        const walked = controller.tick();
        assert.equal(walked.node.id, 'ground.walk');
        assert.ok(Math.abs(walked.state.needs.fatigue - (FATIGUE_MAX - FATIGUE_WALK_DRAIN)) < 0.0001);
    });

    it('running drains fatigue faster than walking', () => {
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5, runSpeed: 12 };
        const walking = new NoxV3Controller(state({
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));
        const running = new NoxV3Controller(state({
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));
        const walked = walking.tick();
        assert.equal(running.startRun(), true);
        const ran = running.tick();
        assert.ok(FATIGUE_RUN_DRAIN > FATIGUE_WALK_DRAIN);
        assert.ok(ran.state.needs.fatigue < walked.state.needs.fatigue);
    });

    it('fatigue clamps to 0..100', () => {
        assert.equal(new NoxV3Controller(state({ needs: { fatigue: -5 } })).state.needs.fatigue, 0);
        assert.equal(new NoxV3Controller(state({ needs: { fatigue: 150 } })).state.needs.fatigue, 100);

        const controller = new NoxV3Controller(state({
            needs: { fatigue: 0.1 },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }), new WeightedSelector(() => 0), { rollD100: () => 100 });
        controller.tick();
        assert.equal(controller.state.needs.fatigue, 0);
    });

    it('does not roll for rest while fatigue is at or above threshold', () => {
        let rolls = 0;
        const controller = new NoxV3Controller(state({
            needs: { fatigue: FATIGUE_REST_THRESHOLD, restCheckTicks: REST_CHECK_INTERVAL_TICKS - 1 },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }), new WeightedSelector(() => 0), { rollD100: () => ++rolls });
        controller.tick();
        assert.equal(rolls, 0);
        assert.equal(controller.state.activeAction, null);
    });

    it('rolls for rest once per second only while fatigued', () => {
        let rolls = 0;
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 900, height: 200 },
            needs: { fatigue: FATIGUE_REST_THRESHOLD - 1, restCheckTicks: 0 },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 2, velocityY: 0 },
        }), new WeightedSelector(() => 0), { rollD100: () => {
            rolls++;
            return REST_CHECK_DC + 1;
        } });

        for (let i = 0; i < REST_CHECK_INTERVAL_TICKS - 1; i++)
            controller.tick();
        assert.equal(rolls, 0);
        assert.equal(controller.state.needs.restCheckTicks, REST_CHECK_INTERVAL_TICKS - 1);

        controller.tick();
        assert.equal(rolls, 1);
        assert.equal(controller.state.activeAction, null);
        assert.equal(controller.state.needs.restCheckTicks, 0);
    });

    it('injectable d100 roll of 8 starts rest and 9 does not', () => {
        assert.equal(REST_CHECK_DICE, '1d100');
        assert.equal(REST_CHECK_DC, 8);
        const resting = new NoxV3Controller(state({
            needs: { fatigue: FATIGUE_REST_THRESHOLD - 1, restCheckTicks: REST_CHECK_INTERVAL_TICKS - 1 },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }), new WeightedSelector(() => 0), { rollD100: () => 8 });
        resting.tick();
        assert.equal(resting.state.activeAction.id, ActionStateId.WALK_STOP);
        assert.equal(resting.state.activeAction.phase, ActionPhase.DECELERATING);

        const walking = new NoxV3Controller(state({
            needs: { fatigue: FATIGUE_REST_THRESHOLD - 1, restCheckTicks: REST_CHECK_INTERVAL_TICKS - 1 },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }), new WeightedSelector(() => 0), { rollD100: () => 9 });
        walking.tick();
        assert.equal(walking.state.activeAction, null);
        assert.equal(walking.state.motion.mode, MotionMode.GROUNDED);
    });

    it('walk-stop decelerates with movement before rest-hold starts at zero velocity', () => {
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 8 };
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 900, height: 200 },
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            needs: { fatigue: FATIGUE_REST_THRESHOLD - 1, restCheckTicks: REST_CHECK_INTERVAL_TICKS - 1 },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 8, velocityY: 0 },
        }), new WeightedSelector(() => 0), { rollD100: () => 8 });

        controller.tick();
        assert.equal(controller.state.activeAction.id, ActionStateId.WALK_STOP);
        assert.equal(controller.state.activeAction.phase, ActionPhase.DECELERATING);
        assert.equal(controller.state.activeAction.nextActionId, ActionStateId.REST_HOLD);

        const decelerationVelocities = [controller.state.body.velocityX];
        const startX = controller.state.body.x;
        for (let i = 0; i < REST_DECELERATION_TICKS + 2 && controller.state.activeAction?.id === ActionStateId.WALK_STOP; i++) {
            const previousX = controller.state.body.x;
            controller.tick();
            assert.equal(controller.state.body.direction, 1);
            assert.equal(controller.state.support.surfaceId, 'ground');
            assert.equal(controller.state.body.y + controller.state.body.height, controller.state.support.topY);
            assert.ok(controller.state.body.x >= previousX);
            if (controller.state.activeAction?.id === ActionStateId.WALK_STOP)
                decelerationVelocities.push(controller.state.body.velocityX);
        }
        assert.ok(controller.state.body.x > startX);
        assert.ok(decelerationVelocities.length >= 6);
        for (let i = 1; i < decelerationVelocities.length; i++) {
            assert.ok(decelerationVelocities[i] > 0);
            assert.ok(decelerationVelocities[i] < decelerationVelocities[i - 1]);
        }
        assert.equal(controller.state.body.velocityX, 0);
        assert.equal(controller.state.activeAction.id, ActionStateId.REST_HOLD);
        assert.equal(controller.state.activeAction.anchorX, controller.state.body.x);
        assert.equal(controller.state.activeAction.anchorY, controller.state.body.y);
    });

    it('rest-hold is immobile, restores fatigue, and exits to walk ramp startup', () => {
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 8, walkAccelerationTicks: 4 };
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 900, height: 200 },
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            needs: { fatigue: FATIGUE_REST_THRESHOLD - 1, restCheckTicks: REST_CHECK_INTERVAL_TICKS - 1 },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 8, velocityY: 0 },
        }), new WeightedSelector(() => 0), { rollD100: () => 8 });

        controller.tick();
        for (let i = 0; i < REST_DECELERATION_TICKS + 2 && controller.state.activeAction?.id !== ActionStateId.REST_HOLD; i++)
            controller.tick();
        assert.equal(controller.state.activeAction.id, ActionStateId.REST_HOLD);
        const anchorX = controller.state.activeAction.anchorX;
        for (let i = 0; i < 5; i++) {
            controller.tick();
            assert.equal(controller.state.activeAction.id, ActionStateId.REST_HOLD);
            assert.equal(controller.state.body.x, anchorX);
            assert.equal(controller.state.body.velocityX, 0);
            assert.equal(controller.state.body.velocityY, 0);
        }

        for (let i = 0; i < 160 && controller.state.activeAction; i++) {
            const beforeX = controller.state.body.x;
            controller.tick();
            assert.equal(controller.state.body.x, beforeX);
        }
        assert.equal(controller.state.activeAction, null);
        assert.equal(controller.state.needs.fatigue, 100);
        assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);
        assert.equal(controller.state.body.velocityX, 0);
        assert.equal(controller.state.locomotion.walkRampTick, 0);

        const finishedX = controller.state.body.x;
        const walked = controller.tick();
        assert.equal(walked.node.id, 'ground.walk');
        assert.equal(walked.state.body.velocityX, walkRampSpeed(config, 0));
        assert.equal(walked.state.body.x, finishedX + walkRampSpeed(config, 0));
        assert.equal(walked.state.locomotion.walkRampTick, 1);
    });

    it('lifecycle actions live outside normal walk action source', () => {
        const walkSource = readFileSync(join(root, 'extension/src/actions/walk.js'), 'utf8');
        const lifecycleSource = readFileSync(join(root, 'extension/src/actions/lifecycle.js'), 'utf8');
        const controllerSource = readFileSync(join(root, 'extension/src/core/controller.js'), 'utf8');

        assert.doesNotMatch(walkSource, /walkStopAction|createRestHoldActionState|createMessageHoldActionState/);
        assert.match(lifecycleSource, /walkStopAction/);
        assert.match(lifecycleSource, /restHoldAction/);
        assert.match(lifecycleSource, /messageHoldAction/);
        assert.match(lifecycleSource, /jumpAction/);
        assert.match(lifecycleSource, /LIFECYCLE_ACTIONS/);
        assert.match(lifecycleSource, /lifecycleActionFor/);
        assert.match(controllerSource, /lifecycleActionFor\(this\.state\.activeAction\)/);
        assert.doesNotMatch(controllerSource, /#lifecycleAction/);
    });

    it('message hold decelerates, anchors, preserves fatigue, blocks run, and releases to walking', () => {
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 8, walkAccelerationTicks: 4 };
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 900, height: 200 },
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            needs: { fatigue: 64, restCheckTicks: REST_CHECK_INTERVAL_TICKS - 1 },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 8, velocityY: 0 },
        }), new WeightedSelector(() => 0), { rollD100: () => 8 });

        assert.equal(controller.startMessageHold(), true);
        assert.equal(controller.state.activeAction.id, ActionStateId.WALK_STOP);
        assert.equal(controller.state.activeAction.nextActionId, ActionStateId.MESSAGE_HOLD);
        assert.equal(controller.startRun(), false);

        for (let i = 0; i < REST_DECELERATION_TICKS + 2 && controller.state.activeAction?.id !== ActionStateId.MESSAGE_HOLD; i++)
            controller.tick();

        assert.equal(controller.state.activeAction.id, ActionStateId.MESSAGE_HOLD);
        const anchorX = controller.state.activeAction.anchorX;
        assert.equal(controller.state.body.velocityX, 0);
        assert.equal(controller.state.needs.fatigue, 64);

        for (let i = 0; i < 5; i++) {
            controller.tick();
            assert.equal(controller.state.activeAction.id, ActionStateId.MESSAGE_HOLD);
            assert.equal(controller.state.body.x, anchorX);
            assert.equal(controller.state.body.velocityX, 0);
            assert.equal(controller.state.needs.fatigue, 64);
            assert.equal(controller.startRun(), false);
        }

        assert.equal(controller.releaseMessageHold(), true);
        assert.equal(controller.state.activeAction, null);
        const walked = controller.tick();
        assert.equal(walked.node.id, 'ground.walk');
        assert.equal(walked.state.body.velocityX, walkRampSpeed(config, 0));
        assert.equal(walked.state.body.x, anchorX + walkRampSpeed(config, 0));
    });

    it('message hold refuses airborne state and support loss cancels it', () => {
        const airborne = new NoxV3Controller(state({
            motion: { mode: MotionMode.AIRBORNE },
            body: { x: 40, y: 40, width: 40, height: 50, direction: 1, velocityX: 2, velocityY: 3 },
        }));
        assert.equal(airborne.startMessageHold(), false);
        assert.equal(airborne.state.activeAction, null);

        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const platform = { id: 'window:1', rect: { x: 40, y: 120, width: 160, height: 50 } };
        const controller = new NoxV3Controller(state({
            screen,
            world: createWorldSnapshot(screen, [platform]),
            body: { x: 60, y: 70, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));
        assert.equal(controller.startMessageHold(), true);
        controller.tick(createWorldSnapshot(screen, []));
        assert.equal(controller.state.activeAction, null);
        assert.equal(controller.state.support, null);
        assert.equal(controller.state.motion.mode, MotionMode.AIRBORNE);
    });

    it('drag cancels message hold presentation', () => {
        const controller = new NoxV3Controller(state({
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));
        assert.equal(controller.startMessageHold(), true);
        controller.startDrag();
        assert.equal(controller.state.activeAction, null);
        assert.equal(controller.state.motion.mode, MotionMode.DRAGGING);
        assert.equal(controller.state.body.velocityX, 0);
        assert.equal(controller.state.body.velocityY, 0);
    });

    it('drag cancels both walk-stop and rest-hold lifecycle states', () => {
        const startStopping = () => {
            const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 8 };
            const controller = new NoxV3Controller(state({
                config,
                needs: { fatigue: FATIGUE_REST_THRESHOLD - 1, restCheckTicks: REST_CHECK_INTERVAL_TICKS - 1 },
                body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 8, velocityY: 0 },
            }), new WeightedSelector(() => 0), { rollD100: () => 8 });
            controller.tick();
            assert.equal(controller.state.activeAction.id, ActionStateId.WALK_STOP);
            return controller;
        };

        const stopping = startStopping();
        stopping.startDrag();
        assert.equal(stopping.state.activeAction, null);
        assert.equal(stopping.state.motion.mode, MotionMode.DRAGGING);

        const holding = startStopping();
        for (let i = 0; i < REST_DECELERATION_TICKS + 2 && holding.state.activeAction?.id !== ActionStateId.REST_HOLD; i++)
            holding.tick();
        assert.equal(holding.state.activeAction.id, ActionStateId.REST_HOLD);
        holding.startDrag();
        assert.equal(holding.state.activeAction, null);
        assert.equal(holding.state.motion.mode, MotionMode.DRAGGING);
    });

    it('support loss cancels both walk-stop and rest-hold lifecycle states', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const platform = { id: 'window:1', rect: { x: 40, y: 120, width: 160, height: 50 } };
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 8 };
        const startStopping = () => new NoxV3Controller(state({
            screen,
            world: createWorldSnapshot(screen, [platform]),
            config,
            needs: { fatigue: FATIGUE_REST_THRESHOLD - 1, restCheckTicks: REST_CHECK_INTERVAL_TICKS - 1 },
            body: { x: 60, y: 70, width: 40, height: 50, direction: 1, velocityX: 8, velocityY: 0 },
        }), new WeightedSelector(() => 0), { rollD100: () => 8 });

        const stopping = startStopping();
        stopping.tick(createWorldSnapshot(screen, [platform]));
        assert.equal(stopping.state.activeAction.id, ActionStateId.WALK_STOP);
        stopping.tick(createWorldSnapshot(screen, []));
        assert.equal(stopping.state.activeAction, null);
        assert.equal(stopping.state.support, null);
        assert.equal(stopping.state.motion.mode, MotionMode.AIRBORNE);

        const holding = startStopping();
        holding.tick(createWorldSnapshot(screen, [platform]));
        for (let i = 0; i < REST_DECELERATION_TICKS + 2 && holding.state.activeAction?.id !== ActionStateId.REST_HOLD; i++)
            holding.tick(createWorldSnapshot(screen, [platform]));
        assert.equal(holding.state.activeAction.id, ActionStateId.REST_HOLD);
        holding.tick(createWorldSnapshot(screen, []));
        assert.equal(holding.state.activeAction, null);
        assert.equal(holding.state.support, null);
        assert.equal(holding.state.motion.mode, MotionMode.AIRBORNE);
    });

    it('moved or occluded support cancels rest and starts falling', () => {
        const screen = { x: 0, y: 0, width: 300, height: 200 };
        const lower = { id: 'window:lower', rect: { x: 40, y: 120, width: 160, height: 50 }, stackIndex: 1 };
        const startOnSupport = () => {
            const controller = new NoxV3Controller(state({
                screen,
                world: createWorldSnapshot(screen, [lower]),
                needs: { fatigue: FATIGUE_REST_THRESHOLD - 1, restCheckTicks: REST_CHECK_INTERVAL_TICKS - 1 },
                body: { x: 60, y: 70, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
            }), new WeightedSelector(() => 0), { rollD100: () => 8 });
            controller.tick(createWorldSnapshot(screen, [lower]));
            assert.equal(controller.state.activeAction.id, ActionStateId.WALK_STOP);
            return controller;
        };

        const moved = startOnSupport();
        moved.tick(createWorldSnapshot(screen, [{ ...lower, rect: { x: 40, y: 119, width: 160, height: 50 } }]));
        assert.equal(moved.state.activeAction, null);
        assert.equal(moved.state.motion.mode, MotionMode.AIRBORNE);

        const occluded = startOnSupport();
        occluded.tick(createWorldSnapshot(screen, [
            lower,
            { id: 'window:max', rect: { x: 0, y: 0, width: 300, height: 200 }, stackIndex: 2, occludesLowerWindows: true },
        ]));
        assert.equal(occluded.state.activeAction, null);
        assert.equal(occluded.state.motion.mode, MotionMode.AIRBORNE);
    });

    it('config updates during rest do not restart walking movement', () => {
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 8 };
        const controller = new NoxV3Controller(state({
            config,
            needs: { fatigue: FATIGUE_REST_THRESHOLD - 1, restCheckTicks: REST_CHECK_INTERVAL_TICKS - 1 },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 },
        }), new WeightedSelector(() => 0), { rollD100: () => 8 });
        controller.tick();
        for (let i = 0; i < REST_DECELERATION_TICKS + 2 && controller.state.activeAction?.id !== ActionStateId.REST_HOLD; i++)
            controller.tick();
        assert.equal(controller.state.activeAction.id, ActionStateId.REST_HOLD);
        assert.equal(controller.state.body.velocityX, 0);
        controller.updateConfig({ ...config, walkSpeed: 20, runSpeed: 35 });
        assert.equal(controller.state.body.velocityX, 0);
        assert.equal(controller.state.activeAction.id, ActionStateId.REST_HOLD);
    });

    it('jump opportunity rolls once per interval before scanning and failed rolls keep walking', () => {
        let rolls = 0;
        const screen = { x: 0, y: 0, width: 700, height: 300 };
        const world = createWorldSnapshot(screen, [
            { id: 'near', rect: { x: 100, y: 220, width: 280, height: 50 } },
        ]);
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5, gravity: 1.2 };
        const controller = new NoxV3Controller(state({
            screen,
            world,
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            needs: { fatigue: 100, jumpCheckTicks: JUMP_CHECK_INTERVAL_TICKS - 2 },
            body: { x: 40, y: 250, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }), new WeightedSelector(() => 0), { rollD100: () => {
            rolls++;
            return JUMP_CHECK_DC + 1;
        } });

        controller.tick(world);
        assert.equal(rolls, 0);
        assert.equal(controller.state.needs.jumpCheckTicks, JUMP_CHECK_INTERVAL_TICKS - 1);
        assert.equal(controller.state.activeAction, null);

        const walked = controller.tick(world);
        assert.equal(rolls, 1);
        assert.equal(walked.node.id, 'ground.walk');
        assert.equal(controller.state.activeAction, null);
        assert.equal(controller.state.needs.jumpCheckTicks, 0);
        assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);
    });

    it('fatigue below jump minimum prevents scan and jump opportunity', () => {
        let rolls = 0;
        const screen = { x: 0, y: 0, width: 700, height: 300 };
        const world = createWorldSnapshot(screen, [
            { id: 'near', rect: { x: 180, y: 220, width: 100, height: 50 } },
        ]);
        const controller = new NoxV3Controller(state({
            screen,
            world,
            config: { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5, gravity: 1.2 },
            needs: { fatigue: JUMP_FATIGUE_MIN - 1, jumpCheckTicks: JUMP_CHECK_INTERVAL_TICKS - 1 },
            body: { x: 40, y: 250, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }), new WeightedSelector(() => 0), { rollD100: () => {
            rolls++;
            return 1;
        } });

        controller.tick(world);
        assert.equal(rolls, 0);
        assert.equal(controller.state.activeAction, null);
        assert.equal(controller.state.needs.jumpCheckTicks, 0);
    });

    it('jump holds grounded through impulse frames, accelerates airtime, contacts without snap, and resumes same direction', () => {
        const screen = { x: 0, y: 0, width: 700, height: 300 };
        const world = createWorldSnapshot(screen, [
            { id: 'near', rect: { x: 100, y: 220, width: 280, height: 50 } },
        ]);
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5, walkAccelerationTicks: 4 };
        const controller = new NoxV3Controller(state({
            screen,
            world,
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            needs: { fatigue: 100, jumpCheckTicks: JUMP_CHECK_INTERVAL_TICKS - 1 },
            body: { x: 40, y: 250, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }), new WeightedSelector(() => 0), { rollD100: () => 1 });

        const started = controller.tick(world);
        assert.equal(started.node, null);
        assert.equal(controller.state.activeAction.id, ActionStateId.JUMP);
        assert.equal(controller.state.activeAction.phase, ActionPhase.LAUNCH);
        assert.equal(controller.state.activeAction.phaseTick, JUMP_FRAME_STEP);
        assert.equal(controller.state.activeAction.targetSurfaceId, 'near');
        assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);
        assert.equal(controller.state.support.surfaceId, 'ground');
        assert.equal(controller.state.body.direction, 1);
        assert.equal(controller.state.needs.fatigue, 100);
        assert.deepEqual(JUMP_TAKEOFF_FRAMES, [3, 4, 5, 6, 7, 8]);
        assert.equal(JUMP_HOLD_FRAME, 7);
        assert.deepEqual(JUMP_LANDING_FRAMES, [9, 10, 11]);
        assert.equal(JUMP_TAKEOFF_TICKS, 6);
        assert.equal(JUMP_RECEPTION_TICKS, 3);
        assert.equal(JUMP_FRAME_STEP, 1);
        assert.equal(JUMP_REACH_DISTANCE, 280);
        assert.equal(JUMP_TRAJECTORY_GRAVITY, 0.95);
        const velocityX = controller.state.activeAction.launchVelocity.x;
        const velocityY = controller.state.activeAction.launchVelocity.y;
        assert.ok(Math.abs(velocityX) > 0);
        assert.ok(velocityY < 0);
        const startX = controller.state.body.x;
        const startY = controller.state.body.y;

        while (controller.state.activeAction.phase === ActionPhase.LAUNCH) {
            assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);
            assert.equal(controller.state.support.surfaceId, 'ground');
            assert.equal(controller.state.body.x, startX);
            assert.equal(controller.state.body.velocityX, 0);
            controller.tick(world);
        }

        assert.equal(controller.state.activeAction.phase, ActionPhase.AIRBORNE);
        assert.equal(controller.state.activeAction.phaseTick, 0);
        assert.equal(controller.state.motion.mode, MotionMode.AIRBORNE);
        assert.equal(controller.state.support, null);
        assert.ok(controller.state.needs.fatigue < 100);
        assert.equal(controller.state.body.x, startX);
        assert.equal(controller.state.body.y, startY);
        assert.equal(controller.state.body.velocityX, velocityX);
        assert.equal(controller.state.body.velocityY, velocityY);

        controller.tick(world);
        assert.equal(controller.state.activeAction.phase, ActionPhase.AIRBORNE);
        assert.equal(controller.state.body.velocityY, velocityY + JUMP_TRAJECTORY_GRAVITY);
        assert.equal(controller.state.body.x, startX + velocityX);
        assert.ok(Math.abs(controller.state.body.y - (startY + velocityY + JUMP_TRAJECTORY_GRAVITY)) < 0.0001);

        let previousY = controller.state.body.y;
        let sawRising = previousY < startY;
        for (let i = 0; i < JUMP_REACH_SIMULATION_TICKS && controller.state.activeAction?.phase === ActionPhase.AIRBORNE; i++) {
            controller.tick(world);
            assert.equal(controller.state.activeAction.id, ActionStateId.JUMP);
            assert.equal(controller.state.body.direction, 1);
            if (controller.state.activeAction.phase === ActionPhase.AIRBORNE) {
                if (controller.state.body.y < previousY)
                    sawRising = true;
                previousY = controller.state.body.y;
            }
        }

        assert.equal(sawRising, true);
        assert.equal(controller.state.activeAction.id, ActionStateId.JUMP);
        assert.equal(controller.state.activeAction.phase, ActionPhase.RECEPTION);
        assert.equal(controller.state.activeAction.phaseTick, 0);
        assert.equal(controller.state.support.surfaceId, 'near');
        assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);
        assert.equal(controller.state.body.velocityY, 0);
        assert.ok(controller.state.body.x >= 100);
        assert.ok(controller.state.body.x <= 100 + 280 - controller.state.body.width);

        for (let i = 0; i <= JUMP_RECEPTION_TICKS && controller.state.activeAction; i++)
            controller.tick(world);
        assert.equal(controller.state.activeAction, null);
        assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);
        assert.equal(controller.state.support.surfaceId, 'near');
        assert.equal(controller.state.body.direction, 1);
        assert.equal(controller.state.locomotion.walkRampTick, 0);

        const resumed = controller.tick(world);
        assert.equal(resumed.node.id, 'ground.walk');
        assert.equal(resumed.state.body.direction, 1);
        assert.equal(resumed.state.body.velocityX, walkRampSpeed(config, 0));
    });

    it('generated jump syncs launch to frame 22 and reception to actual landing collision', () => {
        const screen = { x: 0, y: 0, width: 700, height: 300 };
        const world = createWorldSnapshot(screen, [
            { id: 'near', rect: { x: 100, y: 220, width: 280, height: 50 } },
        ]);
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5, walkAccelerationTicks: 4 };
        const controller = new NoxV3Controller(state({
            screen,
            world,
            config,
            needs: { fatigue: 100, jumpCheckTicks: 0 },
            body: { x: 40, y: 250, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));

        assert.equal(controller.tryJumpNow(world, JumpAnimationVariant.GENERATED), 'started');
        assert.equal(controller.state.activeAction.animationVariant, JumpAnimationVariant.GENERATED);
        assert.equal(controller.state.activeAction.phase, ActionPhase.LAUNCH);
        assert.equal(controller.state.activeAction.phaseTick, 0);
        assert.equal(controller.state.activeAction.animationTick, 0);
        const startX = controller.state.body.x;
        const startY = controller.state.body.y;
        const velocityX = controller.state.activeAction.launchVelocity.x;
        const velocityY = controller.state.activeAction.launchVelocity.y;

        for (let i = 1; i < GENERATED_JUMP_TAKEOFF_FRAME; i++) {
            controller.tick(world);
            assert.equal(controller.state.activeAction.phase, ActionPhase.LAUNCH);
            assert.equal(controller.state.activeAction.phaseTick, i);
            assert.equal(controller.state.activeAction.animationTick, i);
            assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);
            assert.equal(controller.state.support.surfaceId, 'ground');
            assert.equal(controller.state.body.x, startX);
            assert.equal(controller.state.body.y, startY);
            assert.equal(controller.state.body.velocityX, 0);
            assert.equal(controller.state.body.velocityY, 0);
        }

        controller.tick(world);
        assert.equal(controller.state.activeAction.phase, ActionPhase.AIRBORNE);
        assert.equal(controller.state.activeAction.phaseTick, 0);
        assert.equal(controller.state.activeAction.animationTick, GENERATED_JUMP_TAKEOFF_FRAME);
        assert.equal(controller.state.motion.mode, MotionMode.AIRBORNE);
        assert.equal(controller.state.support, null);
        assert.equal(controller.state.body.x, startX);
        assert.equal(controller.state.body.y, startY);
        assert.equal(controller.state.body.velocityX, velocityX);
        assert.equal(controller.state.body.velocityY, velocityY);

        controller.tick(world);
        assert.equal(controller.state.activeAction.phase, ActionPhase.AIRBORNE);
        assert.ok(controller.state.activeAction.animationTick >= GENERATED_JUMP_AIR_START_FRAME);
        assert.equal(controller.state.body.x, startX + velocityX);
        assert.ok(Math.abs(controller.state.body.y - (startY + velocityY + JUMP_TRAJECTORY_GRAVITY)) < 0.0001);

        let airborneTicks = 1;
        while (airborneTicks <= JUMP_REACH_SIMULATION_TICKS && controller.state.activeAction?.phase === ActionPhase.AIRBORNE) {
            assert.notEqual(controller.state.activeAction.animationTick, GENERATED_JUMP_RECEPTION_START_FRAME);
            controller.tick(world);
            airborneTicks++;
        }

        assert.equal(controller.state.activeAction.phase, ActionPhase.RECEPTION);
        assert.equal(controller.state.activeAction.phaseTick, 0);
        assert.equal(controller.state.activeAction.animationTick, GENERATED_JUMP_RECEPTION_START_FRAME);
        assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);
        assert.equal(controller.state.support.surfaceId, 'near');
        assert.ok(airborneTicks > 1);

        controller.tick(world);
        assert.equal(controller.state.activeAction.phase, ActionPhase.RECEPTION);
        assert.equal(controller.state.activeAction.phaseTick, 1);
        assert.equal(controller.state.activeAction.animationTick, GENERATED_JUMP_RECEPTION_START_FRAME + 1);
    });

    it('jetpack jump stays in the shared jump lifecycle, launches at frame 42, powers airtime, and lands by collision', () => {
        const screen = { x: 0, y: 0, width: 900, height: 420 };
        const world = createWorldSnapshot(screen, [
            { id: 'high', rect: { x: 300, y: 240, width: 220, height: 50 } },
        ]);
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5, walkAccelerationTicks: 4, jumpReachDistance: 520 };
        const controller = new NoxV3Controller(state({
            screen,
            world,
            config,
            needs: { fatigue: 100, jumpCheckTicks: 0 },
            body: { x: 120, y: 370, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));

        assert.equal(controller.tryJumpNow(world, JumpAnimationVariant.JETPACK), 'started');
        assert.equal(controller.state.activeAction.id, ActionStateId.JUMP);
        assert.equal(controller.state.activeAction.animationVariant, JumpAnimationVariant.JETPACK);
        assert.equal(controller.state.activeAction.phase, ActionPhase.LAUNCH);
        assert.equal(controller.state.activeAction.targetSurfaceId, 'high');
        assert.equal(controller.state.activeAction.landingX, 300);
        assert.equal(controller.state.activeAction.targetY, 190);
        assert.ok(controller.state.activeAction.fatigueCost > 0);
        const startX = controller.state.body.x;
        const startY = controller.state.body.y;

        for (let i = 1; i < JETPACK_LAUNCH_FRAME; i++) {
            controller.tick(world);
            assert.equal(controller.state.activeAction.phase, ActionPhase.LAUNCH);
            assert.equal(controller.state.activeAction.phaseTick, i);
            assert.equal(controller.state.activeAction.animationTick, i);
            assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);
            assert.equal(controller.state.body.x, startX);
            assert.equal(controller.state.body.y, startY);
            assert.equal(controller.state.body.velocityX, 0);
            assert.equal(controller.state.body.velocityY, 0);
        }

        controller.tick(world);
        assert.equal(controller.state.activeAction.phase, ActionPhase.AIRBORNE);
        assert.equal(controller.state.activeAction.phaseTick, 0);
        assert.equal(controller.state.activeAction.animationTick, JETPACK_LAUNCH_FRAME);
        assert.equal(controller.state.motion.mode, MotionMode.AIRBORNE);
        assert.equal(controller.state.support, null);
        assert.equal(controller.state.body.x, startX);
        assert.equal(controller.state.body.y, startY);
        const launchVelocity = {
            x: controller.state.body.velocityX,
            y: controller.state.body.velocityY,
        };
        assert.equal(launchVelocity.x, JETPACK_INITIAL_HORIZONTAL_SPEED);
        assert.equal(launchVelocity.y, JETPACK_INITIAL_LIFT_SPEED);
        assert.ok(Math.abs(launchVelocity.x) < Math.abs(controller.state.activeAction.launchVelocity.x));
        assert.ok(Math.abs(launchVelocity.y) < Math.abs(controller.state.activeAction.launchVelocity.y));

        controller.tick(world);
        assert.equal(controller.state.activeAction.phase, ActionPhase.AIRBORNE);
        assert.ok(controller.state.activeAction.animationTick > JETPACK_LAUNCH_FRAME);
        assert.ok(controller.state.body.velocityX > launchVelocity.x);
        assert.ok(controller.state.body.velocityY < launchVelocity.y);
        assert.ok(controller.state.body.velocityY < 0);
        assert.ok(controller.state.body.y < startY);

        let sawPoweredFrame = false;
        let liftVelocityY = null;
        let cruiseVelocityY = null;
        let approachVelocityY = null;
        const horizontalVelocities = [];
        for (let i = 0; i < 160 && controller.state.activeAction?.phase === ActionPhase.AIRBORNE; i++) {
            if (controller.state.activeAction.animationTick <= JETPACK_POWERED_END_FRAME) {
                sawPoweredFrame = true;
                horizontalVelocities.push(controller.state.body.velocityX);
            }
            if (controller.state.activeAction.animationTick === JETPACK_LIFT_END_FRAME)
                liftVelocityY = controller.state.body.velocityY;
            if (controller.state.activeAction.animationTick === JETPACK_CRUISE_END_FRAME)
                cruiseVelocityY = controller.state.body.velocityY;
            if (controller.state.activeAction.animationTick === JETPACK_POWERED_END_FRAME)
                approachVelocityY = controller.state.body.velocityY;
            controller.tick(world);
        }

        assert.equal(sawPoweredFrame, true);
        assert.ok(liftVelocityY < -2.5);
        assert.ok(cruiseVelocityY > liftVelocityY);
        assert.ok(cruiseVelocityY < 0);
        assert.ok(approachVelocityY > cruiseVelocityY);
        assert.ok(Math.max(...horizontalVelocities) <= 7.5);
        assert.ok(horizontalVelocities.some((value, index) => index > 3 && value > horizontalVelocities[index - 1]));
        assert.equal(controller.state.activeAction.id, ActionStateId.JUMP);
        assert.equal(controller.state.activeAction.phase, ActionPhase.RECEPTION);
        assert.equal(controller.state.activeAction.phaseTick, 0);
        assert.equal(controller.state.activeAction.animationTick, JETPACK_LANDING_START_FRAME);
        assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);
        assert.equal(controller.state.support.surfaceId, 'high');
        assert.ok(controller.state.body.x + controller.state.body.width / 2 >= 300);
        assert.ok(controller.state.body.x + controller.state.body.width / 2 <= 300 + 220);

        for (let i = 0; i <= JETPACK_RECEPTION_TICKS && controller.state.activeAction; i++)
            controller.tick(world);
        assert.equal(controller.state.activeAction, null);
        assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);
        assert.equal(controller.state.support.surfaceId, 'high');
        assert.equal(controller.state.body.direction, 1);
    });

    it('moving the authorized target while airborne does not chase or snap landing', () => {
        const screen = { x: 0, y: 0, width: 900, height: 300 };
        const world = createWorldSnapshot(screen, [
            { id: 'near', rect: { x: 100, y: 220, width: 280, height: 50 } },
        ]);
        const movedWorld = createWorldSnapshot(screen, [
            { id: 'near', rect: { x: 650, y: 220, width: 120, height: 50 } },
        ]);
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5, walkAccelerationTicks: 4, jumpReachDistance: 260 };
        const controller = new NoxV3Controller(state({
            screen,
            world,
            config,
            needs: { fatigue: 100, jumpCheckTicks: 0 },
            body: { x: 40, y: 250, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));

        assert.equal(controller.tryJumpNow(world, JumpAnimationVariant.GENERATED), 'started');
        assert.equal(controller.state.activeAction.targetSurfaceId, 'near');
        assert.equal(controller.state.activeAction.landingX, 100);
        while (controller.state.activeAction.phase === ActionPhase.LAUNCH)
            controller.tick(world);

        assert.equal(controller.state.activeAction.phase, ActionPhase.AIRBORNE);
        const launchVelocity = { ...controller.state.body, velocityX: controller.state.body.velocityX, velocityY: controller.state.body.velocityY };
        for (let i = 0; i < 120 && controller.state.activeAction?.phase === ActionPhase.AIRBORNE; i++)
            controller.tick(movedWorld);

        assert.equal(controller.state.activeAction.phase, ActionPhase.RECEPTION);
        assert.equal(controller.state.support.surfaceId, 'ground');
        assert.equal(controller.state.body.x < 650, true);
        assert.notEqual(controller.state.body.x, 100);
        assert.equal(controller.state.body.velocityY, 0);
        assert.notEqual(controller.state.body.velocityX, launchVelocity.velocityX);
    });

    it('generated jump playback uses launch, airborne, and reception frame ranges without V1 phase shortcuts', () => {
        const frames = {
            walk: ['walk'],
            run: ['run'],
            rest: ['rest'],
            restProfile: ['rest-profile'],
            jump: Array.from({ length: JUMP_FRAME_COUNT }, (_unused, index) => `v1-${index}`),
            jumpGenerated: Array.from({ length: JUMP_GENERATED_FRAME_COUNT }, (_unused, index) => `generated-${index}`),
            jumpJetpack: Array.from({ length: JUMP_JETPACK_FRAME_COUNT }, (_unused, index) => `jetpack-${index}`),
        };
        const playback = new AnimationPlayback();
        const generatedState = (phase, animationTick, phaseTick = 0) => ({
            activeAction: {
                id: ActionStateId.JUMP,
                phase,
                phaseTick,
                animationTick,
                animationVariant: JumpAnimationVariant.GENERATED,
            },
            motion: { mode: MotionMode.GROUNDED },
        });

        assert.equal(playback.reset(RenderMode.JUMP, frames, generatedState(ActionPhase.LAUNCH, 0)), 'generated-0');
        assert.equal(playback.reset(RenderMode.JUMP, frames, generatedState(ActionPhase.LAUNCH, 21, 21)), 'generated-21');
        assert.equal(playback.reset(RenderMode.JUMP, frames, generatedState(ActionPhase.AIRBORNE, GENERATED_JUMP_TAKEOFF_FRAME)), 'generated-22');
        assert.equal(playback.reset(RenderMode.JUMP, frames, generatedState(ActionPhase.AIRBORNE, GENERATED_JUMP_AIR_START_FRAME)), 'generated-23');
        assert.equal(playback.reset(RenderMode.JUMP, frames, generatedState(ActionPhase.AIRBORNE, GENERATED_JUMP_RECEPTION_START_FRAME)), 'generated-106');
        assert.equal(playback.reset(RenderMode.JUMP, frames, generatedState(ActionPhase.RECEPTION, GENERATED_JUMP_RECEPTION_START_FRAME, 0)), 'generated-107');
        assert.equal(playback.reset(RenderMode.JUMP, frames, generatedState(ActionPhase.RECEPTION, GENERATED_JUMP_END_FRAME, GENERATED_JUMP_END_FRAME - GENERATED_JUMP_RECEPTION_START_FRAME)), 'generated-144');
    });

    it('jetpack jump playback uses equip, ignition, powered travel, landing, and recovery frame ranges', () => {
        const frames = {
            walk: ['walk'],
            run: ['run'],
            rest: ['rest'],
            restProfile: ['rest-profile'],
            jump: Array.from({ length: JUMP_FRAME_COUNT }, (_unused, index) => `v1-${index}`),
            jumpGenerated: Array.from({ length: JUMP_GENERATED_FRAME_COUNT }, (_unused, index) => `generated-${index}`),
            jumpJetpack: Array.from({ length: JUMP_JETPACK_FRAME_COUNT }, (_unused, index) => `jetpack-${index}`),
        };
        const playback = new AnimationPlayback();
        const jetpackState = (phase, animationTick, phaseTick = 0) => ({
            activeAction: {
                id: ActionStateId.JUMP,
                phase,
                phaseTick,
                animationTick,
                animationVariant: JumpAnimationVariant.JETPACK,
            },
            motion: { mode: MotionMode.GROUNDED },
        });

        assert.equal(playback.reset(RenderMode.JUMP, frames, jetpackState(ActionPhase.LAUNCH, 0)), `jetpack-${JETPACK_EQUIP_START_FRAME}`);
        assert.equal(playback.reset(RenderMode.JUMP, frames, jetpackState(ActionPhase.LAUNCH, JETPACK_IGNITION_START_FRAME)), `jetpack-${JETPACK_IGNITION_START_FRAME}`);
        assert.equal(playback.reset(RenderMode.JUMP, frames, jetpackState(ActionPhase.LAUNCH, JETPACK_PROTECTED_START_FRAME)), `jetpack-${JETPACK_PROTECTED_START_FRAME}`);
        assert.equal(playback.reset(RenderMode.JUMP, frames, jetpackState(ActionPhase.LAUNCH, JETPACK_PROTECTED_END_FRAME)), `jetpack-${JETPACK_PROTECTED_END_FRAME}`);
        assert.equal(playback.reset(RenderMode.JUMP, frames, jetpackState(ActionPhase.AIRBORNE, JETPACK_LAUNCH_FRAME)), `jetpack-${JETPACK_LAUNCH_FRAME}`);
        assert.equal(playback.reset(RenderMode.JUMP, frames, jetpackState(ActionPhase.AIRBORNE, JETPACK_POWERED_END_FRAME + 12)), `jetpack-${JETPACK_POWERED_END_FRAME}`);
        assert.equal(playback.reset(RenderMode.JUMP, frames, jetpackState(ActionPhase.RECEPTION, JETPACK_LANDING_START_FRAME, 0)), `jetpack-${JETPACK_LANDING_START_FRAME}`);
        assert.equal(playback.reset(RenderMode.JUMP, frames, jetpackState(ActionPhase.RECEPTION, JETPACK_LANDING_END_FRAME, JETPACK_LANDING_END_FRAME - JETPACK_LANDING_START_FRAME)), `jetpack-${JETPACK_LANDING_END_FRAME}`);
        assert.equal(playback.reset(RenderMode.JUMP, frames, jetpackState(ActionPhase.RECEPTION, JETPACK_RECOVERY_START_FRAME, JETPACK_LANDING_END_FRAME - JETPACK_LANDING_START_FRAME + 1)), `jetpack-${JETPACK_RECOVERY_START_FRAME}`);
        assert.equal(playback.reset(RenderMode.JUMP, frames, jetpackState(ActionPhase.RECEPTION, JETPACK_END_FRAME, JETPACK_RECEPTION_TICKS - 1)), `jetpack-${JETPACK_END_FRAME}`);
    });

    it('manual jump trigger uses the same scan path without interval or dice gating', () => {
        let rolls = 0;
        const screen = { x: 0, y: 0, width: 700, height: 300 };
        const world = createWorldSnapshot(screen, [
            { id: 'near', rect: { x: 180, y: 220, width: 100, height: 50 } },
        ]);
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5, walkAccelerationTicks: 4 };
        const controller = new NoxV3Controller(state({
            screen,
            world,
            config,
            needs: { fatigue: 100, jumpCheckTicks: 0 },
            body: { x: 40, y: 250, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }), new WeightedSelector(() => 0), { rollD100: () => {
            rolls++;
            return 100;
        } });

        assert.equal(controller.tryJumpNow(world), 'started');
        assert.equal(rolls, 0);
        assert.equal(controller.state.activeAction.id, ActionStateId.JUMP);
        assert.equal(controller.state.activeAction.animationVariant, JumpAnimationVariant.V1);
        assert.equal(controller.state.activeAction.phase, ActionPhase.LAUNCH);
        for (let i = 0; i < 20 && controller.state.activeAction.phase !== ActionPhase.AIRBORNE; i++)
            controller.tick(world);
        assert.equal(controller.state.activeAction.phase, ActionPhase.AIRBORNE);

        const generated = new NoxV3Controller(state({
            screen,
            world,
            config,
            needs: { fatigue: 100, jumpCheckTicks: 0 },
            body: { x: 40, y: 250, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));
        assert.equal(generated.tryJumpNow(world, JumpAnimationVariant.GENERATED), 'started');
        assert.equal(generated.state.activeAction.animationVariant, JumpAnimationVariant.GENERATED);

        const jetpack = new NoxV3Controller(state({
            screen,
            world,
            config,
            needs: { fatigue: 100, jumpCheckTicks: 0 },
            body: { x: 40, y: 250, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));
        assert.equal(jetpack.tryJumpNow(world, JumpAnimationVariant.JETPACK), 'started');
        assert.equal(jetpack.state.activeAction.animationVariant, JumpAnimationVariant.JETPACK);

        const noCandidate = new NoxV3Controller(state({
            screen,
            world: createWorldSnapshot(screen),
            config,
            needs: { fatigue: 100 },
            body: { x: 40, y: 250, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));
        assert.equal(noCandidate.tryJumpNow(createWorldSnapshot(screen)), 'no-candidate');

        const fatigued = new NoxV3Controller(state({
            screen,
            world,
            config,
            needs: { fatigue: JUMP_FATIGUE_MIN - 1 },
            body: { x: 40, y: 250, width: 40, height: 50, direction: 1, velocityX: 5, velocityY: 0 },
        }));
        assert.equal(fatigued.tryJumpNow(world), 'fatigued');
    });

    it('manual rest trigger uses the real walk-stop to rest lifecycle without dice or fatigue gating', () => {
        let rolls = 0;
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 8 };
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 900, height: 200 },
            config,
            locomotion: { walkRampTick: config.walkAccelerationTicks },
            needs: { fatigue: 100, restCheckTicks: 0 },
            body: { x: 40, y: 150, width: 40, height: 50, direction: 1, velocityX: 8, velocityY: 0 },
        }), new WeightedSelector(() => 0), { rollD100: () => {
            rolls++;
            return 100;
        } });

        assert.equal(controller.tryRestNow(), 'started');
        assert.equal(rolls, 0);
        assert.equal(controller.state.activeAction.id, ActionStateId.WALK_STOP);
        assert.equal(controller.state.activeAction.nextActionId, ActionStateId.REST_HOLD);
        assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);

        for (let i = 0; i < REST_DECELERATION_TICKS + 2 && controller.state.activeAction?.id !== ActionStateId.REST_HOLD; i++)
            controller.tick();
        assert.equal(controller.state.activeAction.id, ActionStateId.REST_HOLD);
        assert.equal(controller.state.body.velocityX, 0);
        assert.ok(controller.state.needs.fatigue <= 100);
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
        assert.equal(GRAVITY_PROFILES.earth.gravity, 2.4);
        assert.equal(DEFAULT_RUNTIME_CONFIG.gravity, GRAVITY_PROFILES.earth.gravity);
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
        let falling = earth.body;
        for (let i = 0; i < 20; i++)
            falling = stepAirborne(screen, falling, DEFAULT_RUNTIME_CONFIG).body;
        assert.ok(falling.velocityY <= DEFAULT_RUNTIME_CONFIG.maxFallSpeed);
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
            'extension/src/actions/lifecycle.js',
            'extension/src/actions/jump.js',
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
            'extension/src/actions/lifecycle.js',
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

    it('animation modules load frame sets and keep render selection out of actor chrome code', () => {
        const actorSource = readFileSync(join(root, 'extension/src/actor.js'), 'utf8');
        const catalogSource = readFileSync(join(root, 'extension/src/animation/catalog.js'), 'utf8');
        const playbackSource = readFileSync(join(root, 'extension/src/animation/playback.js'), 'utf8');
        const jetpackMotionSource = readFileSync(join(root, 'extension/src/actions/jetpack-jump.js'), 'utf8');
        assert.match(actorSource, /import \{ loadAnimationFrames \} from '\.\/animation\/catalog\.js'/);
        assert.match(actorSource, /import \{ AnimationPlayback, renderModeForState \} from '\.\/animation\/playback\.js'/);
        assert.match(actorSource, /this\.animation = new AnimationPlayback\(\)/);
        assert.match(actorSource, /this\.animation\.advance\(this\.controller\.state, this\.frames, this\.config\)/);
        assert.match(actorSource, /this\.animation\.reset\(mode, this\.frames, this\.controller\.state\)/);
        assert.doesNotMatch(actorSource, /const RenderMode|#chooseRestFrameSet|#framesForMode|#frameTicksForMode|frameIndex|frameTick|frameMode|restFrameSet|Gio/);
        assert.match(catalogSource, /walk: loadNumberedFrames\(root\.get_child\('walk'\), WALK_FRAME_COUNT\)/);
        assert.match(catalogSource, /run: loadNumberedFrames\(root\.get_child\('run'\), RUN_FRAME_COUNT\)/);
        assert.match(catalogSource, /jump: loadNumberedFrames\(root\.get_child\('jump'\), JUMP_FRAME_COUNT\)/);
        assert.match(catalogSource, /jumpGenerated: loadNumberedFrames\(root\.get_child\('jump-generated'\), JUMP_GENERATED_FRAME_COUNT\)/);
        assert.match(catalogSource, /jumpJetpack: loadNumberedFrames\(root\.get_child\('jump-jetpack'\), JUMP_JETPACK_FRAME_COUNT\)/);
        assert.match(catalogSource, /rest: loadNumberedFrames\(root\.get_child\('rest'\), REST_FRAME_COUNT\)/);
        assert.match(catalogSource, /restProfile: loadNumberedFrames\(root\.get_child\('rest-profile-cropped'\), REST_PROFILE_FRAME_COUNT\)/);
        assert.match(playbackSource, /isJumpAction\(state\.activeAction\)/);
        assert.match(playbackSource, /return RenderMode\.JUMP/);
        assert.match(playbackSource, /frames\.jump\[frameIndex\]/);
        assert.match(playbackSource, /JumpAnimationVariant\.GENERATED/);
        assert.match(playbackSource, /generatedJumpFrameForAction\(frames\.jumpGenerated, actionState\)/);
        assert.match(playbackSource, /JumpAnimationVariant\.JETPACK/);
        assert.match(playbackSource, /jetpackJumpFrameForAction\(frames\.jumpJetpack, actionState\)/);
        assert.match(playbackSource, /JETPACK_LAUNCH_FRAME/);
        assert.match(jetpackMotionSource, /stepJetpackAirborne/);
        assert.match(jetpackMotionSource, /stepAirborne\(screen, propelled/);
        assert.match(jetpackMotionSource, /poweredPhasePlan/);
        assert.match(jetpackMotionSource, /JETPACK_LIFT_END_FRAME/);
        assert.match(jetpackMotionSource, /JETPACK_CRUISE_END_FRAME/);
        assert.match(jetpackMotionSource, /JETPACK_HORIZONTAL_BRAKE_ACCELERATION/);
        assert.doesNotMatch(jetpackMotionSource, /bodyOnSupport|landingX:|targetSurfaceId:/);
        assert.match(playbackSource, /GENERATED_JUMP_TAKEOFF_FRAME/);
        assert.match(playbackSource, /GENERATED_JUMP_AIR_START_FRAME/);
        assert.match(playbackSource, /GENERATED_JUMP_RECEPTION_START_FRAME/);
        assert.match(playbackSource, /GENERATED_JUMP_RECEPTION_START_FRAME - 1/);
        assert.match(playbackSource, /GENERATED_JUMP_END_FRAME/);
        assert.match(playbackSource, /ActionPhase\.RECEPTION/);
        assert.match(playbackSource, /JUMP_LANDING_FRAMES/);
        assert.match(playbackSource, /ActionPhase\.AIRBORNE/);
        assert.match(playbackSource, /return JUMP_HOLD_FRAME/);
        assert.match(playbackSource, /JUMP_TAKEOFF_FRAMES/);
        assert.match(playbackSource, /isRestHoldAction\(state\.activeAction\)/);
        assert.match(playbackSource, /state\.motion\.mode === MotionMode\.RUNNING/);
        assert.match(playbackSource, /return RenderMode\.REST/);
        assert.match(playbackSource, /return RenderMode\.RUN/);
        assert.match(playbackSource, /return RenderMode\.WALK/);
        assert.match(playbackSource, /mode === RenderMode\.REST/);
        assert.match(playbackSource, /return this\.restFrameSet \|\| this\.#chooseRestFrameSet\(frames\)/);
        assert.match(playbackSource, /#chooseRestFrameSet/);
        assert.match(playbackSource, /Math\.random\(\) < 0\.5 \? frames\.rest : frames\.restProfile/);
        assert.match(playbackSource, /this\.restFrameSet = null/);
        assert.match(playbackSource, /return REST_FRAME_TICKS/);
        assert.match(playbackSource, /return RUN_FRAME_TICKS/);
        assert.match(playbackSource, /return config\.walkFrameTicks/);
        assert.match(playbackSource, /this\.frameIndex = 0/);
        assert.match(playbackSource, /this\.frameTick = 0/);
        assert.doesNotMatch(playbackSource, /isMessageHoldAction/);
        assert.doesNotMatch(playbackSource, /isLifecycleAction/);
        assert.equal(RUN_FRAME_COUNT, 14);
        assert.equal(JUMP_FRAME_COUNT, 14);
        assert.equal(JUMP_GENERATED_FRAME_COUNT, 145);
        assert.equal(JUMP_JETPACK_FRAME_COUNT, 145);
        assert.equal(GENERATED_JUMP_TAKEOFF_FRAME, 22);
        assert.equal(GENERATED_JUMP_AIR_START_FRAME, 23);
        assert.equal(GENERATED_JUMP_RECEPTION_START_FRAME, 107);
        assert.equal(GENERATED_JUMP_END_FRAME, 144);
        assert.equal(JETPACK_EQUIP_START_FRAME, 1);
        assert.equal(JETPACK_IGNITION_START_FRAME, 21);
        assert.equal(JETPACK_PROTECTED_START_FRAME, 35);
        assert.equal(JETPACK_PROTECTED_END_FRAME, 41);
        assert.equal(JETPACK_LAUNCH_FRAME, 42);
        assert.equal(JETPACK_LIFT_END_FRAME, 58);
        assert.equal(JETPACK_CRUISE_END_FRAME, 86);
        assert.equal(JETPACK_POWERED_END_FRAME, 99);
        assert.equal(JETPACK_INITIAL_HORIZONTAL_SPEED, 0.8);
        assert.equal(JETPACK_INITIAL_LIFT_SPEED, -0.9);
        assert.equal(JETPACK_LANDING_START_FRAME, 100);
        assert.equal(JETPACK_LANDING_END_FRAME, 108);
        assert.equal(JETPACK_RECOVERY_START_FRAME, 110);
        assert.equal(JETPACK_END_FRAME, 144);
        assert.equal(JETPACK_RECEPTION_TICKS, 44);
        assert.equal(JUMP_FRAME_STEP, 1);
        assert.deepEqual(JUMP_TAKEOFF_FRAMES, [3, 4, 5, 6, 7, 8]);
        assert.equal(JUMP_HOLD_FRAME, 7);
        assert.deepEqual(JUMP_LANDING_FRAMES, [9, 10, 11]);
        assert.equal(JUMP_TAKEOFF_TICKS, 6);
        assert.equal(JUMP_RECEPTION_TICKS, 3);
        assert.equal(JUMP_REACH_DISTANCE, 280);
        assert.equal(JUMP_REACH_SIMULATION_TICKS, 50);
        assert.equal(JumpAnimationVariant.V1, 'v1');
        assert.equal(JumpAnimationVariant.GENERATED, 'generated');
        assert.equal(JumpAnimationVariant.JETPACK, 'jetpack');
        assert.equal(RUN_FRAME_TICKS, 1);
        assert.equal(REST_FRAME_COUNT, 34);
        assert.equal(REST_PROFILE_FRAME_COUNT, 54);
        assert.equal(REST_FRAME_TICKS, 1);
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

    it('message receive path starts and releases presentation hold without changing ACK semantics', () => {
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
        assert.match(actorSource, /controller\.startMessageHold\(\)/);
        assert.match(actorSource, /controller\.releaseMessageHold\(\)/);
        assert.match(actorSource, /changed::jump-command-seq/);
        assert.match(actorSource, /'gravity-profile', 'jump-reach-distance'/);
        assert.match(actorSource, /JumpAnimationVariant\.V1/);
        assert.match(actorSource, /changed::generated-jump-command-seq/);
        assert.match(actorSource, /JumpAnimationVariant\.GENERATED/);
        assert.match(actorSource, /changed::jetpack-jump-command-seq/);
        assert.match(actorSource, /JumpAnimationVariant\.JETPACK/);
        assert.match(actorSource, /controller\.tryJumpNow\(this\.#worldSnapshot\(\), animationVariant\)/);
        assert.match(actorSource, /jump-command-result/);
        assert.match(actorSource, /generated-jump-command-result/);
        assert.match(actorSource, /jetpack-jump-command-result/);
        assert.match(actorSource, /changed::rest-command-seq/);
        assert.match(actorSource, /controller\.tryRestNow\(this\.#worldSnapshot\(\)\)/);
        assert.match(actorSource, /rest-command-result/);
        assert.match(actorSource, /clickDistance\(pendingDrag, stageX, stageY\) <= CLICK_RUN_MAX_DISTANCE && !this\.#messageBubbleVisible\(\)/);
        assert.doesNotMatch(actorSource, /ackAll\(message\.id\)/);
        assert.doesNotMatch(actorSource, /#setConnectionState\('message'\)/);
        assert.match(actorSource, /set_line_wrap\(true\)/);
        assert.match(actorSource, /set_line_wrap_mode\(Pango\.WrapMode\.WORD_CHAR\)/);
        assert.match(actorSource, /set_ellipsize\(Pango\.EllipsizeMode\.NONE\)/);
        assert.match(actorSource, /messageMovementConfig\(this\.config, this\.#messageBubbleVisible\(\)\)/);
        assert.match(actorSource, /#syncControllerConfig/);
        assert.match(actorSource, /#messageBubbleVisible/);
        assert.doesNotMatch(actorSource, /ELLIPSIZE_END|EllipsizeMode\.END|ellipsize:\s*true|text-overflow|truncate/i);
        assert.doesNotMatch(actorSource, /triggerMessage|messageAnimation|test-trigger-message|messageAction/);
    });

    it('fatigue rest opportunity stays outside selector weights and behavior tree', () => {
        const selectorSource = readFileSync(join(root, 'extension/src/behavior/selector.js'), 'utf8');
        const treeSource = readFileSync(join(root, 'extension/src/behavior/tree.js'), 'utf8');
        const controllerSource = readFileSync(join(root, 'extension/src/core/controller.js'), 'utf8');
        assert.doesNotMatch(selectorSource, /fatigue|restCheck|REST_CHECK|personality|band/i);
        assert.doesNotMatch(treeSource, /fatigue|restCheck|REST_CHECK|personality|band/i);
        assert.match(controllerSource, /#maybeStartRest/);
        assert.match(controllerSource, /this\.rollD100\(\) > REST_CHECK_DC/);
    });

    it('actor owns tiny always-visible fatigue gauge and only reads controller needs', () => {
        const actorSource = readFileSync(join(root, 'extension/src/actor.js'), 'utf8');
        const stylesheet = readFileSync(join(root, 'extension/stylesheet.css'), 'utf8');
        assert.match(actorSource, /fatigueGauge/);
        assert.match(actorSource, /reactive: false/);
        assert.match(actorSource, /this\.controller\.state\.needs\.fatigue/);
        assert.match(actorSource, /isRestHoldAction\(this\.controller\.state\.activeAction\)/);
        assert.match(actorSource, /#layoutFatigueGauge/);
        assert.match(actorSource, /nox-v3-fatigue-gauge/);
        assert.match(actorSource, /addNoxChrome\(this\.fatigueGauge\)/);
        assert.doesNotMatch(actorSource, /this\.actor\.add_child\(this\.fatigueGauge\)/);
        assert.match(actorSource, /const x = body\.x \+ \(body\.width - gaugeWidth\) \/ 2/);
        assert.match(actorSource, /const y = Math\.max\(screen\.y \+ 2, body\.y - gaugeHeight - 4\)/);
        assert.match(actorSource, /this\.fatigueGauge\.set_position\(Math\.round\(x\), Math\.round\(y\)\)/);
        assert.doesNotMatch(actorSource, /this\.controller\.state\.needs\.fatigue\s*=/);
        assert.match(stylesheet, /\.nox-v3-fatigue-gauge/);
        assert.match(stylesheet, /\.nox-v3-fatigue-fill-rested/);
        assert.match(stylesheet, /\.nox-v3-fatigue-fill-mid/);
        assert.match(stylesheet, /\.nox-v3-fatigue-fill-low/);
        assert.match(stylesheet, /\.nox-v3-fatigue-fill-resting/);
    });

    it('actor owns transient non-reactive Jump Reach ring visualization', () => {
        const actorSource = readFileSync(join(root, 'extension/src/actor.js'), 'utf8');
        const stylesheet = readFileSync(join(root, 'extension/stylesheet.css'), 'utf8');
        assert.match(actorSource, /reachRing/);
        assert.match(actorSource, /style_class: 'nox-v3-reach-ring'/);
        assert.match(actorSource, /reactive: false/);
        assert.match(actorSource, /addNoxChrome\(this\.reachRing\)/);
        assert.match(actorSource, /#layoutReachRing/);
        assert.match(actorSource, /const reach = this\.controller\.state\.config\.jumpReachDistance/);
        assert.match(actorSource, /const size = Math\.round\(reach \* 2\)/);
        assert.match(actorSource, /centerX - reach/);
        assert.match(actorSource, /centerY - reach/);
        assert.match(actorSource, /#showReachRing/);
        assert.match(actorSource, /changedKey === 'jump-reach-distance'/);
        assert.match(actorSource, /GLib\.timeout_add\(GLib\.PRIORITY_DEFAULT, 2500/);
        assert.doesNotMatch(actorSource, /this\.actor\.add_child\(this\.reachRing\)/);
        assert.match(stylesheet, /\.nox-v3-reach-ring/);
        assert.match(stylesheet, /border: 1px solid rgba\(80, 170, 220, 0\.42\)/);
        assert.match(stylesheet, /background-color: rgba\(80, 170, 220, 0\.05\)/);
        assert.match(stylesheet, /border-radius: 9999px/);
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
            'extension/src/actions/lifecycle.js',
            'extension/src/actions/flip-at-wall.js',
        ]) {
            const source = readFileSync(join(root, file), 'utf8');
            assert.doesNotMatch(source, /connection\/|transport|Soup|websocket|ack_all|helloFrame|message\//);
        }
    });
});
