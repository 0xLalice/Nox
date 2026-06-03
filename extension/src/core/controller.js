import { buildContext } from './context.js';
import { clampX, groundY } from './geometry.js';
import { scaledHeight, scaledWidth } from './body.js';
import { createLocomotion } from './locomotion.js';
import { dragPreviewBody, dropDirection } from './drag-drop.js';
import { createMotion, startAirborne, stepAirborne } from './physics.js';
import { MotionMode } from './types.js';
import { BEHAVIOR_TREE } from '../behavior/tree.js';
import { WeightedSelector } from '../behavior/selector.js';
import { ACTION_REGISTRY, validateRegistry } from '../behavior/registry.js';
import { DEFAULT_RUNTIME_CONFIG } from '../config/settings.js';

export class NoxV3Controller {
    constructor(state, selector = new WeightedSelector()) {
        validateRegistry(BEHAVIOR_TREE);
        this.state = {
            screen: { ...state.screen },
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
        if (this.state.motion.mode === MotionMode.GROUNDED)
            this.state.body.y = groundY(this.state.screen, this.state.body);
        this.state.body.velocityX = this.state.body.direction * config.walkSpeed;
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
        this.state.body = airborne.body;
        this.state.motion = airborne.motion;
        this.state.locomotion = createLocomotion();
    }

    dropAt(pointerX, dragStartX) {
        this.releaseDrag(pointerX, dragStartX, { x: 0, y: 0 });
    }

    tick() {
        if (this.state.motion.mode === MotionMode.AIRBORNE)
            return this.#tickAirborne();
        if (this.state.motion.mode === MotionMode.DRAGGING)
            return this.#snapshot(null);

        const context = buildContext(this.state);
        const node = this.selector.select(BEHAVIOR_TREE, context);
        const action = node ? ACTION_REGISTRY[node.action] : null;
        const update = action ? action(context) : { finished: true, body: context.body };
        this.activeAction = update.finished ? null : action;
        this.state = {
            screen: this.state.screen,
            config: this.state.config,
            body: {
                ...this.state.body,
                ...update.body,
            },
            locomotion: {
                ...this.state.locomotion,
                ...update.locomotion,
            },
            motion: this.state.motion,
        };
        if (this.state.motion.mode === MotionMode.GROUNDED)
            this.state.body.y = groundY(this.state.screen, this.state.body);
        return this.#snapshot(node);
    }

    #tickAirborne() {
        const update = stepAirborne(this.state.screen, this.state.body, this.state.config);
        this.state.body = update.body;
        this.state.motion = update.motion;
        if (update.landed)
            this.state.locomotion = createLocomotion();
        return this.#snapshot(null);
    }

    #snapshot(node) {
        return Object.freeze({
            node,
            state: {
                screen: { ...this.state.screen },
                config: { ...this.state.config },
                body: { ...this.state.body },
                locomotion: { ...this.state.locomotion },
                motion: { ...this.state.motion },
            },
        });
    }
}
