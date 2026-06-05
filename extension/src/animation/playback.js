import { isJumpAction, isRestHoldAction } from '../core/action-state.js';
import { REST_FRAME_TICKS, RUN_FRAME_TICKS } from '../core/constants.js';
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

    reset(mode, frames) {
        this.frameMode = mode;
        if (mode === RenderMode.REST)
            this.#chooseRestFrameSet(frames);
        else
            this.restFrameSet = null;

        this.frameIndex = 0;
        this.frameTick = 0;
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
        const frameIndex = Math.min(frames.jump.length - 1, Math.max(0, actionState?.phaseTick || 0));
        return frames.jump[frameIndex];
    }
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
