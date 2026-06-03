import { buildContext } from './context.js';
import { clampX } from './geometry.js';
import { scaledHeight, scaledWidth } from './body.js';
import { createLocomotion, runRampSpeed } from './locomotion.js';
import { dragPreviewBody, dropDirection } from './drag-drop.js';
import { createMotion, startAirborne, stepAirborne } from './physics.js';
import { MotionMode } from './types.js';
import { createWorldSnapshot } from '../world/world.js';
import { bodyOnSupport, revalidateSupport, supportAtBody } from '../world/support.js';
import { BEHAVIOR_TREE } from '../behavior/tree.js';
import { WeightedSelector } from '../behavior/selector.js';
import { ACTION_REGISTRY, validateRegistry } from '../behavior/registry.js';
import { DEFAULT_RUNTIME_CONFIG } from '../config/settings.js';

export class NoxV3Controller {
    constructor(state, selector = new WeightedSelector()) {
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
        };
        this.selector = selector;
        this.activeAction = null;
    }

    updateConfig(config) {
        this.state.config = { ...config };
        this.state.body.width = scaledWidth(config);
        this.state.body.height = scaledHeight(config);
        this.state.body.x = clampX(this.state.body.x, this.state.screen, this.state.body);
        if (this.state.motion.mode === MotionMode.GROUNDED || this.state.motion.mode === MotionMode.RUNNING) {
            if (!this.#revalidateGroundedSupport())
                return;
            const speed = this.state.motion.mode === MotionMode.RUNNING
                ? runRampSpeed(config, this.state.locomotion.runRampTick || 0)
                : config.walkSpeed;
            this.state.body.velocityX = this.state.body.direction * speed;
        }
    }

    startRun() {
        if (this.state.motion.mode !== MotionMode.GROUNDED && this.state.motion.mode !== MotionMode.RUNNING)
            return false;
        const direction = this.state.body.direction || 1;
        this.state.motion = {
            mode: MotionMode.RUNNING,
            runTicksRemaining: this.state.config.runDurationTicks,
        };
        this.state.locomotion = {
            ...createLocomotion(),
            walkRampTick: this.state.config.walkAccelerationTicks,
        };
        this.state.body.velocityX = direction * this.state.config.runSpeed * this.state.config.walkStartSpeedFactor;
        return true;
    }

    startDrag() {
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

        const context = buildContext(this.state);
        const node = this.selector.select(BEHAVIOR_TREE, context);
        const action = node ? ACTION_REGISTRY[node.action] : null;
        const update = action ? action(context) : { finished: true, body: context.body };
        this.activeAction = update.finished ? null : action;
        this.state = {
            screen: this.state.screen,
            world: this.state.world,
            support: this.state.support,
            config: this.state.config,
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
        };
        this.#revalidateGroundedSupport();
        return this.#snapshot(node);
    }

    #tickAirborne() {
        const update = stepAirborne(this.state.screen, this.state.body, this.state.config, this.state.world);
        this.state.body = { ...update.body };
        this.state.motion = { ...update.motion };
        this.state.support = update.support || null;
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
            return false;
        }
        this.state.support = support;
        this.state.body = { ...bodyOnSupport(this.state.body, support) };
        return true;
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
            },
        });
    }
}
