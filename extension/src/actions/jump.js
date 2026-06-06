import { ActionPhase, jumpActionState } from '../core/action-state.js';
import {
    JUMP_AIR_START_FRAME,
    JUMP_FRAME_STEP,
    JUMP_IMPULSE_END_FRAME,
    JUMP_RECEPTION_END_FRAME,
} from '../core/constants.js';
import { startAirborne } from '../core/physics.js';
import { MotionMode } from '../core/types.js';
import { bodyOnSupport } from '../world/support.js';

export function jumpAction(context) {
    const actionState = context.activeAction;
    if (actionState.phase === ActionPhase.LAUNCH)
        return launchJump(context, actionState);
    if (actionState.phase === ActionPhase.RECEPTION)
        return receiveJump(context, actionState);
    return Object.freeze({
        finished: false,
        body: context.body,
        activeAction: actionState,
    });
}

function launchJump(context, actionState) {
    const nextFrame = Math.min(JUMP_AIR_START_FRAME, actionState.phaseTick + JUMP_FRAME_STEP);
    if (actionState.phaseTick < JUMP_IMPULSE_END_FRAME && nextFrame < JUMP_AIR_START_FRAME) {
        return Object.freeze({
            finished: false,
            body: bodyOnSupport(Object.freeze({
                ...context.body,
                direction: actionState.direction || context.body.direction || 1,
                velocityX: 0,
                velocityY: 0,
            }), context.support),
            locomotion: Object.freeze({
                walkRampTick: 0,
                runRampTick: 0,
            }),
            motion: Object.freeze({
                mode: MotionMode.GROUNDED,
            }),
            activeAction: jumpActionState(actionState, {
                phaseTick: nextFrame,
            }),
        });
    }

    const direction = actionState.direction || context.body.direction || 1;
    const airborne = startAirborne(context.screen, {
        ...context.body,
        direction,
    }, actionState.launchVelocity);
    return Object.freeze({
        finished: false,
        body: airborne.body,
        support: null,
        needs: Object.freeze({
            fatigue: context.needs.fatigue - actionState.fatigueCost,
            jumpCheckTicks: 0,
            restCheckTicks: 0,
        }),
        locomotion: Object.freeze({
            walkRampTick: 0,
            runRampTick: 0,
        }),
        motion: airborne.motion,
        activeAction: jumpActionState(actionState, {
            phase: ActionPhase.AIRBORNE,
            phaseTick: JUMP_AIR_START_FRAME,
        }),
    });
}

function receiveJump(context, actionState) {
    if (actionState.phaseTick >= JUMP_RECEPTION_END_FRAME) {
        return Object.freeze({
            finished: true,
            body: bodyOnSupport(Object.freeze({
                ...context.body,
                direction: actionState.direction || context.body.direction || 1,
                velocityX: 0,
                velocityY: 0,
            }), context.support),
            locomotion: Object.freeze({
                walkRampTick: 0,
                runRampTick: 0,
            }),
            motion: Object.freeze({
                mode: MotionMode.GROUNDED,
            }),
            activeAction: null,
        });
    }
    return Object.freeze({
        finished: false,
        body: bodyOnSupport(Object.freeze({
            ...context.body,
            direction: actionState.direction || context.body.direction || 1,
            velocityX: 0,
            velocityY: 0,
        }), context.support),
        locomotion: Object.freeze({
            walkRampTick: 0,
            runRampTick: 0,
        }),
        motion: Object.freeze({
            mode: MotionMode.GROUNDED,
        }),
        activeAction: jumpActionState(actionState, {
            phaseTick: Math.min(JUMP_RECEPTION_END_FRAME, actionState.phaseTick + JUMP_FRAME_STEP),
        }),
    });
}
