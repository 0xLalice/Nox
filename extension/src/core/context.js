import { PlannerContext } from './types.js';

export function buildContext(state) {
    return Object.freeze({
        context: PlannerContext.GROUND,
        body: Object.freeze({ ...state.body }),
        screen: Object.freeze({ ...state.screen }),
    });
}
