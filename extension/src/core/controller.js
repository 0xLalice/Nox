import { buildContext } from './context.js';
import { clampX, groundY } from './geometry.js';
import { scaledHeight, scaledWidth } from './body.js';
import { createLocomotion } from './locomotion.js';
import { dragPreviewBody, dropBodyOnGround } from './drag-drop.js';
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
        };
        this.selector = selector;
        this.activeAction = null;
    }

    updateConfig(config) {
        this.state.config = { ...config };
        this.state.body.width = scaledWidth(config);
        this.state.body.height = scaledHeight(config);
        this.state.body.x = clampX(this.state.body.x, this.state.screen, this.state.body);
        this.state.body.y = groundY(this.state.screen, this.state.body);
        this.state.body.velocityX = this.state.body.direction * config.walkSpeed;
    }

    previewDrag(pointerX, pointerY, grabOffset) {
        this.state.body = dragPreviewBody(this.state.screen, this.state.body, pointerX, pointerY, grabOffset);
    }

    dropAt(pointerX, dragStartX) {
        this.state.body = dropBodyOnGround(
            this.state.screen,
            this.state.body,
            this.state.config,
            dragStartX,
            pointerX
        );
        this.state.locomotion = createLocomotion();
    }

    tick() {
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
        };
        this.state.body.y = groundY(this.state.screen, this.state.body);
        return Object.freeze({
            node,
            state: {
                screen: { ...this.state.screen },
                config: { ...this.state.config },
                body: { ...this.state.body },
                locomotion: { ...this.state.locomotion },
            },
        });
    }
}
