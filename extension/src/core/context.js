import { PlannerContext } from './types.js';
import { createLocomotion } from './locomotion.js';
import { createMotion } from './physics.js';

export function buildContext(state) {
    const motion = state.motion || createMotion();
    return Object.freeze({
        context: contextFromMotion(motion),
        body: Object.freeze({ ...state.body }),
        screen: Object.freeze({ ...state.screen }),
        world: state.world,
        support: state.support ? Object.freeze({ ...state.support }) : null,
        config: Object.freeze({ ...state.config }),
        locomotion: Object.freeze({ ...(state.locomotion || createLocomotion()) }),
        motion: Object.freeze({ ...motion }),
        activeAction: state.activeAction ? Object.freeze({ ...state.activeAction }) : null,
    });
}

function contextFromMotion(motion) {
    if (motion.mode === 'airborne')
        return PlannerContext.AIRBORNE;
    if (motion.mode === 'dragging')
        return PlannerContext.DRAGGING;
    if (motion.mode === 'running')
        return PlannerContext.RUNNING;
    return PlannerContext.GROUND;
}
