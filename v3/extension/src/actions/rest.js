import { restHoldActionState } from '../core/action-state.js';
import { FATIGUE_MAX, FATIGUE_REST_RESTORE } from '../core/constants.js';
import { MotionMode } from '../core/types.js';
import { bodyOnSupport } from '../world/support.js';

export function restHoldAction(context) {
    const actionState = context.activeAction;
    const nextFatigue = context.needs.fatigue + FATIGUE_REST_RESTORE;
    const finished = nextFatigue >= FATIGUE_MAX;
    return Object.freeze({
        finished,
        body: bodyOnSupport(Object.freeze({
            ...context.body,
            x: actionState.anchorX,
            velocityX: 0,
            velocityY: 0,
        }), context.support),
        needs: Object.freeze({
            fatigue: nextFatigue,
            restCheckTicks: 0,
        }),
        locomotion: Object.freeze({
            walkRampTick: 0,
            runRampTick: 0,
        }),
        motion: Object.freeze({
            mode: MotionMode.GROUNDED,
        }),
        activeAction: finished ? null : restHoldActionState(actionState, actionState.phaseTick + 1),
    });
}
