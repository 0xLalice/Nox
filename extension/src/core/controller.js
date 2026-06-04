import { buildContext } from './context.js';
import { clampX } from './geometry.js';
import { scaledHeight, scaledWidth } from './body.js';
import { createLocomotion, runRampSpeed } from './locomotion.js';
import { dragPreviewBody, dropDirection } from './drag-drop.js';
import { createMotion, startAirborne, stepAirborne } from './physics.js';
import { MotionMode } from './types.js';
import {
    ActionStateId,
    createRunActionState,
    createWalkStopActionState,
    isLifecycleAction,
    isRestHoldAction,
    isRunAction,
    isWalkStopAction,
} from './action-state.js';
import {
    FATIGUE_MAX,
    FATIGUE_REST_THRESHOLD,
    REST_CHECK_DC,
    REST_CHECK_INTERVAL_TICKS,
} from './constants.js';
import { createWorldSnapshot } from '../world/world.js';
import { bodyOnSupport, revalidateSupport, supportAtBody } from '../world/support.js';
import { BEHAVIOR_TREE } from '../behavior/tree.js';
import { WeightedSelector } from '../behavior/selector.js';
import { ACTION_REGISTRY, validateRegistry } from '../behavior/registry.js';
import { DEFAULT_RUNTIME_CONFIG } from '../config/settings.js';
import { restHoldAction } from '../actions/rest.js';
import { walkStopAction } from '../actions/walk.js';

export class NoxV3Controller {
    constructor(state, selector = new WeightedSelector(), options = {}) {
        validateRegistry(BEHAVIOR_TREE);
        const world = state.world || createWorldSnapshot(state.screen);
        const support = state.support || supportAtBody(world, state.body);
        this.state = {
            screen: { ...world.screen },
            world,
            support,
            body: { ...state.body },
            config: { ...(state.config || DEFAULT_RUNTIME_CONFIG) },
            locomotion: { ...(state.locomotion || createLocomotion()) },
            motion: { ...(state.motion || createMotion()) },
            needs: createNeeds(state.needs),
            activeAction: state.activeAction || null,
        };
        this.selector = selector;
        this.rollD100 = options.rollD100 || rollD100;
    }

    get activeAction() {
        return this.state.activeAction;
    }

    updateConfig(config) {
        this.state.config = { ...config };
        this.state.body.width = scaledWidth(config);
        this.state.body.height = scaledHeight(config);
        this.state.body.x = clampX(this.state.body.x, this.state.screen, this.state.body);
        if (this.state.motion.mode === MotionMode.GROUNDED || this.state.motion.mode === MotionMode.RUNNING) {
            if (!this.#revalidateGroundedSupport())
                return;
            if (isLifecycleAction(this.activeAction))
                return;
            const speed = isRunAction(this.activeAction)
                ? runRampSpeed(config, this.state.locomotion.runRampTick || 0)
                : config.walkSpeed;
            this.state.body.velocityX = this.state.body.direction * speed;
        }
    }

    startRun() {
        if (this.state.motion.mode !== MotionMode.GROUNDED && this.state.motion.mode !== MotionMode.RUNNING)
            return false;
        if (this.state.activeAction)
            return false;
        if (!this.state.support)
            return false;
        const direction = this.state.body.direction || 1;
        this.state.activeAction = createRunActionState(this.state.config, this.state.support);
        this.state.needs = createNeeds({
            ...this.state.needs,
            restCheckTicks: 0,
        });
        this.state.motion = { mode: MotionMode.RUNNING };
        this.state.locomotion = {
            ...createLocomotion(),
            walkRampTick: this.state.config.walkAccelerationTicks,
        };
        this.state.body.velocityX = direction * this.state.config.runSpeed * this.state.config.walkStartSpeedFactor;
        return true;
    }

    startDrag() {
        this.#cancelActiveAction();
        this.state.motion = { mode: MotionMode.DRAGGING };
        this.state.body.velocityX = 0;
        this.state.body.velocityY = 0;
    }

    previewDrag(pointerX, pointerY, grabOffset) {
        this.state.body = dragPreviewBody(this.state.screen, this.state.body, pointerX, pointerY, grabOffset);
    }

    releaseDrag(pointerX, dragStartX, velocity) {
        const direction = dropDirection(dragStartX, pointerX, this.state.body.direction);
        const airborne = startAirborne(this.state.screen, {
            ...this.state.body,
            direction,
        }, velocity);
        this.state.body = { ...airborne.body };
        this.state.motion = { ...airborne.motion };
        this.state.support = null;
        this.#cancelActiveAction();
        this.state.locomotion = createLocomotion();
    }

    dropAt(pointerX, dragStartX) {
        this.releaseDrag(pointerX, dragStartX, { x: 0, y: 0 });
    }

    snapshot() {
        return this.#snapshot(null).state;
    }

    tick(world = null) {
        this.#setWorld(world);
        if (this.state.motion.mode === MotionMode.AIRBORNE)
            return this.#tickAirborne();
        if (this.state.motion.mode === MotionMode.DRAGGING)
            return this.#snapshot(null);
        if (!this.#revalidateGroundedSupport())
            return this.#snapshot(null);

        this.#maybeStartRest();
        const context = buildContext(this.state);
        const lifecycleAction = this.#lifecycleAction(this.state.activeAction);
        const node = lifecycleAction ? null : this.selector.select(BEHAVIOR_TREE, context);
        const action = lifecycleAction || (node ? ACTION_REGISTRY[node.action] : null);
        const update = action ? action(context) : { finished: true, body: context.body };
        this.state = {
            screen: this.state.screen,
            world: this.state.world,
            support: this.state.support,
            config: this.state.config,
            activeAction: this.state.activeAction,
            body: {
                ...this.state.body,
                ...update.body,
            },
            locomotion: {
                ...this.state.locomotion,
                ...update.locomotion,
            },
            motion: {
                ...this.state.motion,
                ...update.motion,
            },
            needs: createNeeds({
                ...this.state.needs,
                ...update.needs,
            }),
        };
        if ('activeAction' in update)
            this.state.activeAction = update.activeAction || null;
        if (isRunAction(this.state.activeAction) && this.state.motion.mode !== MotionMode.RUNNING)
            this.#cancelActiveAction();
        if (isLifecycleAction(this.state.activeAction) && this.state.motion.mode !== MotionMode.GROUNDED)
            this.#cancelActiveAction();
        this.#revalidateGroundedSupport();
        return this.#snapshot(node);
    }

    #tickAirborne() {
        const update = stepAirborne(this.state.screen, this.state.body, this.state.config, this.state.world);
        this.state.body = { ...update.body };
        this.state.motion = { ...update.motion };
        this.state.support = update.support || null;
        this.#cancelActiveAction();
        if (update.landed)
            this.state.locomotion = createLocomotion();
        return this.#snapshot(null);
    }

    #setWorld(world) {
        if (!world)
            return;
        this.state.world = world;
        this.state.screen = { ...world.screen };
        this.state.body.x = clampX(this.state.body.x, this.state.screen, this.state.body);
    }

    #revalidateGroundedSupport() {
        if (this.state.motion.mode !== MotionMode.GROUNDED && this.state.motion.mode !== MotionMode.RUNNING)
            return true;
        const support = revalidateSupport(this.state.world, this.state.body, this.state.support);
        if (!support) {
            this.state.motion = { mode: MotionMode.AIRBORNE };
            this.state.support = null;
            this.#cancelActiveAction();
            return false;
        }
        this.state.support = support;
        this.state.body = { ...bodyOnSupport(this.state.body, support) };
        return true;
    }

    #maybeStartRest() {
        if (this.state.motion.mode !== MotionMode.GROUNDED)
            return false;
        if (this.state.activeAction)
            return false;
        if (!this.state.support)
            return false;
        if (this.state.needs.fatigue >= FATIGUE_REST_THRESHOLD) {
            this.state.needs = createNeeds({
                ...this.state.needs,
                restCheckTicks: 0,
            });
            return false;
        }

        const restCheckTicks = this.state.needs.restCheckTicks + 1;
        if (restCheckTicks < REST_CHECK_INTERVAL_TICKS) {
            this.state.needs = createNeeds({
                ...this.state.needs,
                restCheckTicks,
            });
            return false;
        }

        this.state.needs = createNeeds({
            ...this.state.needs,
            restCheckTicks: 0,
        });
        if (this.rollD100() > REST_CHECK_DC)
            return false;

        this.state.activeAction = createWalkStopActionState(this.state.support, ActionStateId.REST_HOLD);
        this.state.locomotion = {
            ...this.state.locomotion,
            walkRampTick: 0,
            runRampTick: 0,
        };
        return true;
    }

    #lifecycleAction(activeAction) {
        if (isWalkStopAction(activeAction))
            return walkStopAction;
        if (isRestHoldAction(activeAction))
            return restHoldAction;
        return null;
    }

    #cancelActiveAction() {
        this.state.activeAction = null;
    }

    #snapshot(node) {
        return Object.freeze({
            node,
            state: {
                screen: { ...this.state.screen },
                world: this.state.world,
                support: this.state.support ? { ...this.state.support } : null,
                config: { ...this.state.config },
                body: { ...this.state.body },
                locomotion: { ...this.state.locomotion },
                motion: { ...this.state.motion },
                needs: { ...this.state.needs },
                activeAction: this.state.activeAction ? { ...this.state.activeAction } : null,
            },
        });
    }
}

function createNeeds(needs = {}) {
    return {
        fatigue: clampFatigue(needs.fatigue ?? FATIGUE_MAX),
        restCheckTicks: Math.max(0, Math.floor(needs.restCheckTicks || 0)),
    };
}

function clampFatigue(fatigue) {
    if (!Number.isFinite(fatigue))
        return FATIGUE_MAX;
    return Math.max(0, Math.min(FATIGUE_MAX, fatigue));
}

function rollD100() {
    return Math.floor(Math.random() * 100) + 1;
}
