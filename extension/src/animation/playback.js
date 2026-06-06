import { ActionPhase, isJumpAction, isRestHoldAction } from '../core/action-state.js';
import {
    GENERATED_JUMP_AIR_START_FRAME,
    GENERATED_JUMP_END_FRAME,
    GENERATED_JUMP_RECEPTION_START_FRAME,
    GENERATED_JUMP_TAKEOFF_FRAME,
    JUMP_HOLD_FRAME,
    JUMP_LANDING_FRAMES,
    JUMP_TAKEOFF_FRAMES,
    JumpAnimationVariant,
    REST_FRAME_TICKS,
    RUN_FRAME_TICKS,
} from '../core/constants.js';
import { MotionMode } from '../core/types.js';

export const RenderMode = Object.freeze({
    WALK: 'walk',
    RUN: 'run',
    JUMP: 'jump',
    REST: 'rest',
});

export class AnimationPlayback {
    constructor() {
        this.frameIndex = 0;
        this.frameTick = 0;
        this.frameMode = RenderMode.WALK;
        this.restFrameSet = null;
    }

    advance(state, frames, config) {
        const mode = renderModeForState(state);
        if (mode === RenderMode.JUMP)
            return this.#jumpFrameForAction(frames, state.activeAction);
        if (mode !== this.frameMode)
            this.reset(mode, frames);

        const frameSet = this.#framesForMode(frames, mode);
        const frameTicks = frameTicksForMode(config, mode);
        this.frameTick++;
        if (this.frameTick < frameTicks)
            return null;

        this.frameTick = 0;
        this.frameIndex = (this.frameIndex + 1) % frameSet.length;
        return frameSet[this.frameIndex];
    }

    reset(mode, frames, state = null) {
        this.frameMode = mode;
        if (mode === RenderMode.REST)
            this.#chooseRestFrameSet(frames);
        else
            this.restFrameSet = null;

        this.frameIndex = 0;
        this.frameTick = 0;
        if (mode === RenderMode.JUMP && state?.activeAction)
            return this.#jumpFrameForAction(frames, state.activeAction);
        return this.#framesForMode(frames, this.frameMode)[0];
    }

    clearRestVariant() {
        this.restFrameSet = null;
    }

    #framesForMode(frames, mode) {
        if (mode === RenderMode.JUMP)
            return frames.jump;
        if (mode === RenderMode.REST)
            return this.restFrameSet || this.#chooseRestFrameSet(frames);
        if (mode === RenderMode.RUN)
            return frames.run;
        return frames.walk;
    }

    #chooseRestFrameSet(frames) {
        this.restFrameSet = Math.random() < 0.5 ? frames.rest : frames.restProfile;
        return this.restFrameSet;
    }

    #jumpFrameForAction(frames, actionState) {
        this.restFrameSet = null;
        this.frameMode = RenderMode.JUMP;
        if (actionState?.animationVariant === JumpAnimationVariant.GENERATED)
            return generatedJumpFrameForAction(frames.jumpGenerated, actionState);
        const frameIndex = jumpFrameIndexForAction(actionState);
        return frames.jump[frameIndex];
    }
}

function generatedJumpFrame(frames, tick) {
    const frameIndex = Math.min(frames.length - 1, Math.max(0, Math.floor(tick || 0)));
    return frames[frameIndex];
}

function generatedJumpFrameForAction(frames, actionState) {
    if (actionState?.phase === ActionPhase.RECEPTION)
        return generatedJumpFrame(
            frames,
            Math.min(GENERATED_JUMP_END_FRAME, GENERATED_JUMP_RECEPTION_START_FRAME + (actionState.phaseTick || 0))
        );
    if (actionState?.phase === ActionPhase.AIRBORNE) {
        const floorFrame = (actionState.animationTick || 0) <= GENERATED_JUMP_TAKEOFF_FRAME
            ? GENERATED_JUMP_TAKEOFF_FRAME
            : GENERATED_JUMP_AIR_START_FRAME;
        const frame = Math.max(
            floorFrame,
            Math.min(GENERATED_JUMP_RECEPTION_START_FRAME - 1, Math.floor(actionState.animationTick || 0))
        );
        return frames[frame];
    }
    return generatedJumpFrame(frames, Math.min(GENERATED_JUMP_TAKEOFF_FRAME, actionState?.animationTick || 0));
}

function jumpFrameIndexForAction(actionState) {
    if (actionState?.phase === ActionPhase.RECEPTION)
        return sequenceFrame(JUMP_LANDING_FRAMES, actionState.phaseTick);
    if (actionState?.phase === ActionPhase.AIRBORNE)
        return JUMP_HOLD_FRAME;
    return sequenceFrame(JUMP_TAKEOFF_FRAMES, actionState?.phaseTick || 0);
}

function sequenceFrame(frames, tick) {
    return frames[Math.min(frames.length - 1, Math.max(0, Math.floor(tick)))];
}

export function renderModeForState(state) {
    if (isJumpAction(state.activeAction))
        return RenderMode.JUMP;
    if (isRestHoldAction(state.activeAction))
        return RenderMode.REST;
    if (state.motion.mode === MotionMode.RUNNING)
        return RenderMode.RUN;
    return RenderMode.WALK;
}

function frameTicksForMode(config, mode) {
    if (mode === RenderMode.REST)
        return REST_FRAME_TICKS;
    if (mode === RenderMode.RUN)
        return RUN_FRAME_TICKS;
    return config.walkFrameTicks;
}
