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
    REST_CHECK_DC,
    REST_CHECK_DICE,
    REST_CHECK_INTERVAL_TICKS,
    REST_DECELERATION_TICKS,
    JUMP_AIR_START_FRAME,
    JUMP_AIRBORNE_TICKS,
    JUMP_CONTACT_FRAME,
    JUMP_CHECK_DC,
    JUMP_CHECK_INTERVAL_TICKS,
    JUMP_FATIGUE_MIN,
    JUMP_BASE_FRAME_STEP,
    JUMP_FRAME_COUNT,
    JUMP_FRAME_STEP,
    JUMP_PLAYBACK_SPEED,
    JUMP_RECEPTION_END_FRAME,
    JUMP_TRAJECTORY_GRAVITY,
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
import { bodyOnSupport, revalidateSupport, SUPPORT_FOOT_EDGE_TOLERANCE, supportAtBody } from '../extension/src/world/support.js';
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

    it('jump reach scans deterministic up, level, and down support candidates with variable launch cost', () => {
        const screen = { x: 0, y: 0, width: 700, height: 300 };
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5, gravity: 1.2 };
        const world = createWorldSnapshot(screen, [
            { id: 'near', rect: { x: 180, y: 220, width: 100, height: 50 } },
            { id: 'far', rect: { x: 330, y: 220, width: 100, height: 50 } },
            { id: 'up', rect: { x: 210, y: 160, width: 120, height: 50 } },
        ]);
        const body = { x: 40, y: 250, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 };
        const support = supportAtBody(world, body);
        const supportedBody = bodyOnSupport(body, support);

        const candidates = reachableJumps(world, supportedBody, support, config);
        const repeated = reachableJumps(world, supportedBody, support, config);
        assert.deepEqual(candidates, repeated);

        const near = candidates.find(candidate => candidate.targetSurfaceId === 'near');
        const far = candidates.find(candidate => candidate.targetSurfaceId === 'far');
        const up = candidates.find(candidate => candidate.targetSurfaceId === 'up');
        assert.ok(near);
        assert.ok(far);
        assert.ok(up);
        assert.equal(up.kind, 'up');
        assert.ok(Math.abs(far.launchVelocity.x) > Math.abs(near.launchVelocity.x));
        assert.ok(far.fatigueCost > near.fatigueCost);
        assert.ok(up.fatigueCost > near.fatigueCost);
        for (const candidate of [near, far, up]) {
            assert.equal(candidate.expectedContactFrame, JUMP_CONTACT_FRAME);
            assert.equal(candidate.animationTicks, JUMP_RECEPTION_END_FRAME);
        }
        assert.deepEqual(affordableJumpCandidates(candidates, 100, JUMP_FATIGUE_MIN), candidates);
        assert.deepEqual(affordableJumpCandidates(candidates, JUMP_FATIGUE_MIN + 1, JUMP_FATIGUE_MIN), []);
    });

    it('jump reach ignores the current support and rejects unreachable far surfaces', () => {
        const screen = { x: 0, y: 0, width: 2400, height: 300 };
        const config = { ...DEFAULT_RUNTIME_CONFIG, walkSpeed: 5, gravity: 1.2 };
        const world = createWorldSnapshot(screen, [
            { id: 'start', rect: { x: 40, y: 160, width: 100, height: 50 } },
            { id: 'down', rect: { x: 180, y: 220, width: 100, height: 50 } },
            { id: 'too-far', rect: { x: 2100, y: 220, width: 40, height: 50 } },
        ]);
        const body = { x: 70, y: 110, width: 40, height: 50, direction: 1, velocityX: 0, velocityY: 0 };
        const support = supportAtBody(world, body);
        const supportedBody = bodyOnSupport(body, support);
        const candidates = reachableJumps(world, supportedBody, support, config);

        assert.equal(candidates.some(candidate => candidate.targetSurfaceId === 'start'), false);
        assert.equal(candidates.some(candidate => candidate.targetSurfaceId === 'too-far'), false);
        const down = candidates.find(candidate => candidate.targetSurfaceId === 'down');
        assert.ok(down);
        assert.equal(down.kind, 'down');
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
            { id: 'near', rect: { x: 180, y: 220, width: 100, height: 50 } },
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
            { id: 'near', rect: { x: 180, y: 220, width: 100, height: 50 } },
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
        assert.equal(JUMP_AIR_START_FRAME, 22);
        assert.equal(JUMP_PLAYBACK_SPEED, 1.55);
        assert.equal(JUMP_BASE_FRAME_STEP, 4);
        assert.equal(JUMP_FRAME_STEP, 6.2);
        assert.equal(JUMP_AIRBORNE_TICKS, 14);
        assert.equal(JUMP_TRAJECTORY_GRAVITY, 0.95);
        const landingX = controller.state.activeAction.landingX;
        const velocityX = controller.state.activeAction.launchVelocity.x;
        assert.ok(Math.abs(velocityX) > config.walkSpeed);
        const startX = controller.state.body.x;

        while (controller.state.activeAction.phase === ActionPhase.LAUNCH) {
            assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);
            assert.equal(controller.state.support.surfaceId, 'ground');
            assert.equal(controller.state.body.x, startX);
            assert.equal(controller.state.body.velocityX, 0);
            controller.tick(world);
        }

        assert.equal(controller.state.activeAction.phase, ActionPhase.AIRBORNE);
        assert.equal(controller.state.activeAction.phaseTick, JUMP_AIR_START_FRAME);
        assert.equal(controller.state.motion.mode, MotionMode.AIRBORNE);
        assert.equal(controller.state.support, null);
        assert.ok(controller.state.needs.fatigue < 100);
        assert.equal(controller.state.body.x, startX);

        for (let i = 1; i < JUMP_AIRBORNE_TICKS; i++) {
            controller.tick(world);
            assert.equal(controller.state.activeAction.id, ActionStateId.JUMP);
            assert.equal(controller.state.activeAction.phase, ActionPhase.AIRBORNE);
            assert.equal(controller.state.support, null);
            assert.equal(controller.state.body.direction, 1);
        }
        assert.ok(Math.abs(controller.state.body.x - (landingX - velocityX)) < 0.0001);
        assert.ok(controller.state.activeAction.phaseTick < JUMP_CONTACT_FRAME);

        controller.tick(world);
        assert.equal(controller.state.activeAction.id, ActionStateId.JUMP);
        assert.equal(controller.state.activeAction.phase, ActionPhase.RECEPTION);
        assert.equal(controller.state.activeAction.phaseTick, JUMP_CONTACT_FRAME);
        assert.equal(controller.state.support.surfaceId, 'near');
        assert.equal(controller.state.motion.mode, MotionMode.GROUNDED);
        assert.equal(controller.state.body.velocityX, 0);
        assert.ok(Math.abs(controller.state.body.x - landingX) < 0.0001);

        for (let i = 0; i < JUMP_FRAME_COUNT && controller.state.activeAction; i++)
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
        assert.equal(controller.state.activeAction.phase, ActionPhase.LAUNCH);
        for (let i = 0; i < 20 && controller.state.activeAction.phase !== ActionPhase.AIRBORNE; i++)
            controller.tick(world);
        assert.equal(controller.state.activeAction.phase, ActionPhase.AIRBORNE);

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
        assert.match(actorSource, /import \{ loadAnimationFrames \} from '\.\/animation\/catalog\.js'/);
        assert.match(actorSource, /import \{ AnimationPlayback, renderModeForState \} from '\.\/animation\/playback\.js'/);
        assert.match(actorSource, /this\.animation = new AnimationPlayback\(\)/);
        assert.match(actorSource, /this\.animation\.advance\(this\.controller\.state, this\.frames, this\.config\)/);
        assert.match(actorSource, /this\.animation\.reset\(mode, this\.frames\)/);
        assert.doesNotMatch(actorSource, /const RenderMode|#chooseRestFrameSet|#framesForMode|#frameTicksForMode|frameIndex|frameTick|frameMode|restFrameSet|Gio/);
        assert.match(catalogSource, /walk: loadNumberedFrames\(root\.get_child\('walk'\), WALK_FRAME_COUNT\)/);
        assert.match(catalogSource, /run: loadNumberedFrames\(root\.get_child\('run'\), RUN_FRAME_COUNT\)/);
        assert.match(catalogSource, /jump: loadNumberedFrames\(root\.get_child\('jump'\), JUMP_FRAME_COUNT\)/);
        assert.match(catalogSource, /rest: loadNumberedFrames\(root\.get_child\('rest'\), REST_FRAME_COUNT\)/);
        assert.match(catalogSource, /restProfile: loadNumberedFrames\(root\.get_child\('rest-profile-cropped'\), REST_PROFILE_FRAME_COUNT\)/);
        assert.match(playbackSource, /isJumpAction\(state\.activeAction\)/);
        assert.match(playbackSource, /return RenderMode\.JUMP/);
        assert.match(playbackSource, /frames\.jump\[frameIndex\]/);
        assert.match(playbackSource, /Math\.floor\(Math\.min\(frames\.jump\.length - 1, Math\.max\(0, actionState\?\.phaseTick \|\| 0\)\)\)/);
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
        assert.equal(JUMP_FRAME_COUNT, 145);
        assert.equal(JUMP_PLAYBACK_SPEED, 1.55);
        assert.equal(JUMP_BASE_FRAME_STEP, 4);
        assert.equal(JUMP_FRAME_STEP, 6.2);
        assert.equal(JUMP_AIR_START_FRAME, 22);
        assert.equal(JUMP_CONTACT_FRAME, 107);
        assert.equal(JUMP_AIRBORNE_TICKS, 14);
        assert.equal(JUMP_RECEPTION_END_FRAME, 144);
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
        assert.match(actorSource, /controller\.tryJumpNow\(this\.#worldSnapshot\(\)\)/);
        assert.match(actorSource, /jump-command-result/);
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
