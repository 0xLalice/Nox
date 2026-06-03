import { PlannerContext } from './types.js';
import { createLocomotion } from './locomotion.js';

export function buildContext(state) {
    return Object.freeze({
        context: PlannerContext.GROUND,
        body: Object.freeze({ ...state.body }),
        screen: Object.freeze({ ...state.screen }),
        config: Object.freeze({ ...state.config }),
        locomotion: Object.freeze({ ...(state.locomotion || createLocomotion()) }),
    });
}
