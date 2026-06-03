import { buildContext } from './context.js';
import { groundY } from './geometry.js';
import { BEHAVIOR_TREE } from '../behavior/tree.js';
import { WeightedSelector } from '../behavior/selector.js';
import { ACTION_REGISTRY, validateRegistry } from '../behavior/registry.js';

export class NoxV3Controller {
    constructor(state, selector = new WeightedSelector()) {
        validateRegistry(BEHAVIOR_TREE);
        this.state = {
            screen: { ...state.screen },
            body: { ...state.body },
        };
        this.selector = selector;
        this.activeAction = null;
    }

    tick() {
        const context = buildContext(this.state);
        const node = this.selector.select(BEHAVIOR_TREE, context);
        const action = node ? ACTION_REGISTRY[node.action] : null;
        const update = action ? action(context) : { finished: true, body: context.body };
        this.activeAction = update.finished ? null : action;
        this.state = {
            screen: this.state.screen,
            body: {
                ...this.state.body,
                ...update.body,
            },
        };
        this.state.body.y = groundY(this.state.screen, this.state.body);
        return Object.freeze({
            node,
            state: {
                screen: { ...this.state.screen },
                body: { ...this.state.body },
            },
        });
    }
}
