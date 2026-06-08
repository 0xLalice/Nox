import { ActionPhase, jumpActionState } from '../core/action-state.js';
import {
    GENERATED_JUMP_END_FRAME,
    GENERATED_JUMP_RECEPTION_START_FRAME,
    GENERATED_JUMP_TAKEOFF_FRAME,
    JETPACK_LAUNCH_FRAME,
    JETPACK_RECEPTION_TICKS,
    JUMP_FRAME_STEP,
    JUMP_RECEPTION_TICKS,
    JUMP_TAKEOFF_TICKS,
    JumpAnimationVariant,
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
    const nextTick = actionState.phaseTick + JUMP_FRAME_STEP;
    if (nextTick < takeoffTicksForAction(actionState)) {
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
                phaseTick: nextTick,
                animationTick: actionState.animationTick + JUMP_FRAME_STEP,
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
            phaseTick: 0,
            animationTick: actionState.animationTick + JUMP_FRAME_STEP,
        }),
    });
}

function receiveJump(context, actionState) {
    if (actionState.phaseTick >= receptionTicksForAction(actionState)) {
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
            phaseTick: actionState.phaseTick + JUMP_FRAME_STEP,
            animationTick: actionState.animationTick + JUMP_FRAME_STEP,
        }),
    });
}

function takeoffTicksForAction(actionState) {
    if (actionState.animationVariant === JumpAnimationVariant.GENERATED)
        return GENERATED_JUMP_TAKEOFF_FRAME;
    if (actionState.animationVariant === JumpAnimationVariant.JETPACK)
        return JETPACK_LAUNCH_FRAME;
    return JUMP_TAKEOFF_TICKS;
}

function receptionTicksForAction(actionState) {
    if (actionState.animationVariant === JumpAnimationVariant.GENERATED)
        return GENERATED_JUMP_END_FRAME - GENERATED_JUMP_RECEPTION_START_FRAME + 1;
    if (actionState.animationVariant === JumpAnimationVariant.JETPACK)
        return JETPACK_RECEPTION_TICKS;
    return JUMP_RECEPTION_TICKS;
}
