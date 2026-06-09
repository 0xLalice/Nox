import { buildContext } from './context.js';
import { clampX } from './geometry.js';
import { scaledHeight, scaledWidth } from './body.js';
import { createLocomotion, runRampSpeed } from './locomotion.js';
import { dragPreviewBody, dropDirection } from './drag-drop.js';
import { createMotion, startAirborne, stepAirborne } from './physics.js';
import { MotionMode } from './types.js';
import {
    ActionPhase,
    ActionStateId,
    createJumpActionState,
    createRunActionState,
    createWalkStopActionState,
    isLifecycleAction,
    isJumpAction,
    isMessageHoldAction,
    isRunAction,
    isWalkStopAction,
    jumpActionState,
} from './action-state.js';
import {
    FATIGUE_MAX,
    FATIGUE_REST_THRESHOLD,
    GENERATED_JUMP_RECEPTION_START_FRAME,
    JETPACK_LANDING_START_FRAME,
    JUMP_CHECK_DC,
    JUMP_CHECK_INTERVAL_TICKS,
    JUMP_FATIGUE_MIN,
    JUMP_FRAME_STEP,
    JUMP_TRAJECTORY_GRAVITY,
    JumpAnimationVariant,
    REST_CHECK_DC,
    REST_CHECK_INTERVAL_TICKS,
} from './constants.js';
import { createWorldSnapshot } from '../world/world.js';
import { bodyOnSupport, revalidateSupport, supportAtBody } from '../world/support.js';
import { BEHAVIOR_TREE } from '../behavior/tree.js';
import { WeightedSelector } from '../behavior/selector.js';
import { ACTION_REGISTRY, validateRegistry } from '../behavior/registry.js';
import { DEFAULT_RUNTIME_CONFIG } from '../config/settings.js';
import { lifecycleActionFor } from '../actions/lifecycle.js';
import { stepJetpackAirborne } from '../actions/jetpack-jump.js';
import { affordableJumpCandidates, reachableJumps } from '../world/reach.js';

export class NoxV3Controller {
    constructor(state, selector = new WeightedSelector(), options = {}) {
        validateRegistry(BEHAVIOR_TREE);
        const world = state.world || createWorldSnapshot(state.screen);
        const support = state.support || supportAtBody(world, state.body);
        this.state = {
            screen: { ...world.screen },
            world,
            support,
            body: { ...state.body },
            config: { ...(state.config || DEFAULT_RUNTIME_CONFIG) },
            locomotion: { ...(state.locomotion || createLocomotion()) },
            motion: { ...(state.motion || createMotion()) },
            needs: createNeeds(state.needs),
            activeAction: state.activeAction || null,
        };
        this.selector = selector;
        this.rollD100 = options.rollD100 || rollD100;
    }

    get activeAction() {
        return this.state.activeAction;
    }

    updateConfig(config) {
        this.state.config = { ...config };
        this.state.body.width = scaledWidth(config);
        this.state.body.height = scaledHeight(config);
        this.state.body.x = clampX(this.state.body.x, this.state.screen, this.state.body);
        if (this.state.motion.mode === MotionMode.GROUNDED || this.state.motion.mode === MotionMode.RUNNING) {
            if (!this.#revalidateGroundedSupport())
                return;
            if (isLifecycleAction(this.activeAction))
                return;
            const speed = isRunAction(this.activeAction)
                ? runRampSpeed(config, this.state.locomotion.runRampTick || 0)
                : config.walkSpeed;
            this.state.body.velocityX = this.state.body.direction * speed;
        }
    }

    startRun() {
        if (this.state.motion.mode !== MotionMode.GROUNDED && this.state.motion.mode !== MotionMode.RUNNING)
            return false;
        if (this.state.activeAction)
            return false;
        if (!this.state.support)
            return false;
        const direction = this.state.body.direction || 1;
        this.state.activeAction = createRunActionState(this.state.config, this.state.support);
        this.state.needs = createNeeds({
            ...this.state.needs,
            restCheckTicks: 0,
        });
        this.state.motion = { mode: MotionMode.RUNNING };
        this.state.locomotion = {
            ...createLocomotion(),
            walkRampTick: this.state.config.walkAccelerationTicks,
        };
        this.state.body.velocityX = direction * this.state.config.runSpeed * this.state.config.walkStartSpeedFactor;
        return true;
    }

    startMessageHold() {
        if (this.state.motion.mode !== MotionMode.GROUNDED && this.state.motion.mode !== MotionMode.RUNNING)
            return false;
        if (!this.state.support)
            return false;
        if (isJumpAction(this.state.activeAction))
            return false;
        if (isMessageHoldAction(this.state.activeAction))
            return true;
        if (isWalkStopAction(this.state.activeAction) && this.state.activeAction.nextActionId === ActionStateId.MESSAGE_HOLD)
            return true;

        this.state.activeAction = createWalkStopActionState(this.state.support, ActionStateId.MESSAGE_HOLD);
        this.state.motion = { mode: MotionMode.GROUNDED };
        this.state.needs = createNeeds({
            ...this.state.needs,
            restCheckTicks: 0,
        });
        this.state.locomotion = {
            ...this.state.locomotion,
            walkRampTick: 0,
            runRampTick: 0,
        };
        return true;
    }

    releaseMessageHold() {
        if (!isMessageHoldAction(this.state.activeAction) &&
            !(isWalkStopAction(this.state.activeAction) && this.state.activeAction.nextActionId === ActionStateId.MESSAGE_HOLD))
            return false;
        this.#cancelActiveAction();
        this.state.locomotion = createLocomotion();
        return true;
    }

    tryJumpNow(world = null, animationVariant = null) {
        this.#setWorld(world);
        if (!this.#revalidateGroundedSupport())
            return 'unsupported';
        return this.#startJumpOpportunity({ force: true, animationVariant });
    }

    tryRestNow(world = null) {
        this.#setWorld(world);
        if (!this.#revalidateGroundedSupport())
            return 'unsupported';
        return this.#startRestOpportunity({ force: true });
    }

    startDrag() {
        this.#cancelActiveAction();
        this.state.motion = { mode: MotionMode.DRAGGING };
        this.state.body.velocityX = 0;
        this.state.body.velocityY = 0;
    }

    previewDrag(pointerX, pointerY, grabOffset) {
        this.state.body = dragPreviewBody(this.state.screen, this.state.body, pointerX, pointerY, grabOffset);
    }

    releaseDrag(pointerX, dragStartX, velocity) {
        const direction = dropDirection(dragStartX, pointerX, this.state.body.direction);
        const airborne = startAirborne(this.state.screen, {
            ...this.state.body,
            direction,
        }, velocity);
        this.state.body = { ...airborne.body };
        this.state.motion = { ...airborne.motion };
        this.state.support = null;
        this.#cancelActiveAction();
        this.state.locomotion = createLocomotion();
    }

    dropAt(pointerX, dragStartX) {
        this.releaseDrag(pointerX, dragStartX, { x: 0, y: 0 });
    }

    snapshot() {
        return this.#snapshot(null).state;
    }

    tick(world = null) {
        this.#setWorld(world);
        if (this.state.motion.mode === MotionMode.AIRBORNE && isJumpAction(this.state.activeAction))
            return this.#tickJumpAirborne();
        if (this.state.motion.mode === MotionMode.AIRBORNE)
            return this.#tickAirborne();
        if (this.state.motion.mode === MotionMode.DRAGGING)
            return this.#snapshot(null);
        if (!this.#revalidateGroundedSupport())
            return this.#snapshot(null);

        this.#maybeStartRest();
        this.#maybeStartJump();
        const context = buildContext(this.state);
        const lifecycleAction = lifecycleActionFor(this.state.activeAction);
        const node = lifecycleAction ? null : this.selector.select(BEHAVIOR_TREE, context);
        const action = lifecycleAction || (node ? ACTION_REGISTRY[node.action] : null);
        const update = action ? action(context) : { finished: true, body: context.body };
        this.state = {
            screen: this.state.screen,
            world: this.state.world,
            support: this.state.support,
            config: this.state.config,
            activeAction: this.state.activeAction,
            body: {
                ...this.state.body,
                ...update.body,
            },
            locomotion: {
                ...this.state.locomotion,
                ...update.locomotion,
            },
            motion: {
                ...this.state.motion,
                ...update.motion,
            },
            needs: createNeeds({
                ...this.state.needs,
                ...update.needs,
            }),
        };
        if ('support' in update)
            this.state.support = update.support || null;
        if ('activeAction' in update)
            this.state.activeAction = update.activeAction || null;
        if (isRunAction(this.state.activeAction) && this.state.motion.mode !== MotionMode.RUNNING)
            this.#cancelActiveAction();
        if (isLifecycleAction(this.state.activeAction) && !isJumpAction(this.state.activeAction) && this.state.motion.mode !== MotionMode.GROUNDED)
            this.#cancelActiveAction();
        this.#revalidateGroundedSupport();
        return this.#snapshot(node);
    }

    #tickJumpAirborne() {
        const phaseTick = this.state.activeAction.phaseTick + JUMP_FRAME_STEP;
        const update = this.state.activeAction.animationVariant === JumpAnimationVariant.JETPACK
            ? stepJetpackAirborne(this.state.screen, this.state.body, this.state.activeAction, this.state.config, this.state.world)
            : stepAirborne(this.state.screen, this.state.body, this.#jumpTrajectoryConfig(), this.state.world);
        const landed = Boolean(update.landed);
        this.state.body = {
            ...update.body,
            direction: this.state.activeAction.direction || update.body.direction,
        };
        this.state.motion = landed ? { mode: MotionMode.GROUNDED } : { mode: MotionMode.AIRBORNE };
        this.state.support = landed ? update.support : null;
        this.state.activeAction = jumpActionState(this.state.activeAction, {
            phase: landed ? ActionPhase.RECEPTION : ActionPhase.AIRBORNE,
            phaseTick: landed ? 0 : phaseTick,
            animationTick: this.#nextJumpAnimationTick(landed),
        });
        if (landed)
            this.state.locomotion = createLocomotion();
        return this.#snapshot(null);
    }

    #nextJumpAnimationTick(landed) {
        if (!landed)
            return this.state.activeAction.animationTick + JUMP_FRAME_STEP;
        if (this.state.activeAction.animationVariant === JumpAnimationVariant.GENERATED)
            return GENERATED_JUMP_RECEPTION_START_FRAME;
        if (this.state.activeAction.animationVariant === JumpAnimationVariant.JETPACK)
            return JETPACK_LANDING_START_FRAME;
        return this.state.activeAction.animationTick + JUMP_FRAME_STEP;
    }

    #jumpTrajectoryConfig() {
        return {
            ...this.state.config,
            gravity: JUMP_TRAJECTORY_GRAVITY,
        };
    }

    #tickAirborne() {
        const update = stepAirborne(this.state.screen, this.state.body, this.state.config, this.state.world);
        this.state.body = { ...update.body };
        this.state.motion = { ...update.motion };
        this.state.support = update.support || null;
        this.#cancelActiveAction();
        if (update.landed)
            this.state.locomotion = createLocomotion();
        return this.#snapshot(null);
    }

    #setWorld(world) {
        if (!world)
            return;
        this.state.world = world;
        this.state.screen = { ...world.screen };
        this.state.body.x = clampX(this.state.body.x, this.state.screen, this.state.body);
    }

    #revalidateGroundedSupport() {
        if (this.state.motion.mode !== MotionMode.GROUNDED && this.state.motion.mode !== MotionMode.RUNNING)
            return true;
        const support = revalidateSupport(this.state.world, this.state.body, this.state.support);
        if (!support) {
            this.state.motion = { mode: MotionMode.AIRBORNE };
            this.state.support = null;
            this.#cancelActiveAction();
            return false;
        }
        this.state.support = support;
        this.state.body = { ...bodyOnSupport(this.state.body, support) };
        return true;
    }

    #maybeStartRest() {
        return this.#startRestOpportunity({ force: false });
    }

    #startRestOpportunity({ force }) {
        if (this.state.motion.mode !== MotionMode.GROUNDED)
            return 'not-grounded';
        if (this.state.activeAction)
            return 'busy';
        if (!this.state.support)
            return 'unsupported';
        if (!force && this.state.needs.fatigue >= FATIGUE_REST_THRESHOLD) {
            this.state.needs = createNeeds({
                ...this.state.needs,
                restCheckTicks: 0,
            });
            return 'not-fatigued';
        }

        const restCheckTicks = this.state.needs.restCheckTicks + 1;
        if (!force && restCheckTicks < REST_CHECK_INTERVAL_TICKS) {
            this.state.needs = createNeeds({
                ...this.state.needs,
                restCheckTicks,
            });
            return 'waiting';
        }

        this.state.needs = createNeeds({
            ...this.state.needs,
            restCheckTicks: 0,
        });
        if (!force && this.rollD100() > REST_CHECK_DC)
            return 'roll-failed';

        this.state.activeAction = createWalkStopActionState(this.state.support, ActionStateId.REST_HOLD);
        this.state.locomotion = {
            ...this.state.locomotion,
            walkRampTick: 0,
            runRampTick: 0,
        };
        return 'started';
    }

    #maybeStartJump() {
        return this.#startJumpOpportunity({ force: false, animationVariant: null });
    }

    #startJumpOpportunity({ force, animationVariant }) {
        if (this.state.motion.mode !== MotionMode.GROUNDED && this.state.motion.mode !== MotionMode.RUNNING)
            return 'not-grounded';
        if (this.state.activeAction)
            return 'busy';
        if (!this.state.support)
            return 'unsupported';
        if (this.state.needs.fatigue < JUMP_FATIGUE_MIN) {
            this.state.needs = createNeeds({
                ...this.state.needs,
                jumpCheckTicks: 0,
            });
            return 'fatigued';
        }

        const jumpCheckTicks = this.state.needs.jumpCheckTicks + 1;
        if (!force && jumpCheckTicks < JUMP_CHECK_INTERVAL_TICKS) {
            this.state.needs = createNeeds({
                ...this.state.needs,
                jumpCheckTicks,
            });
            return 'waiting';
        }

        this.state.needs = createNeeds({
            ...this.state.needs,
            jumpCheckTicks: 0,
        });
        if (!force && this.rollD100() > JUMP_CHECK_DC)
            return 'roll-failed';

        const selectedAnimationVariant = animationVariant || randomJumpVariant(this.rollD100());
        const candidates = affordableJumpCandidates(
            reachableJumps(this.state.world, this.state.body, this.state.support, this.state.config, {
                animationVariant: selectedAnimationVariant,
            }),
            this.state.needs.fatigue,
            JUMP_FATIGUE_MIN
        );
        if (!candidates.length)
            return 'no-candidate';

        this.state.activeAction = createJumpActionState(candidates[0], this.state.support, this.state.body);
        this.state.locomotion = {
            ...this.state.locomotion,
            walkRampTick: 0,
            runRampTick: 0,
        };
        return 'started';
    }

    #cancelActiveAction() {
        this.state.activeAction = null;
    }

    #snapshot(node) {
        return Object.freeze({
            node,
            state: {
                screen: { ...this.state.screen },
                world: this.state.world,
                support: this.state.support ? { ...this.state.support } : null,
                config: { ...this.state.config },
                body: { ...this.state.body },
                locomotion: { ...this.state.locomotion },
                motion: { ...this.state.motion },
                needs: { ...this.state.needs },
                activeAction: this.state.activeAction ? { ...this.state.activeAction } : null,
            },
        });
    }
}

function createNeeds(needs = {}) {
    return {
        fatigue: clampFatigue(needs.fatigue ?? FATIGUE_MAX),
        restCheckTicks: Math.max(0, Math.floor(needs.restCheckTicks || 0)),
        jumpCheckTicks: Math.max(0, Math.floor(needs.jumpCheckTicks || 0)),
    };
}

function clampFatigue(fatigue) {
    if (!Number.isFinite(fatigue))
        return FATIGUE_MAX;
    return Math.max(0, Math.min(FATIGUE_MAX, fatigue));
}

function rollD100() {
    return Math.floor(Math.random() * 100) + 1;
}

function randomJumpVariant(roll) {
    if (roll <= 33)
        return JumpAnimationVariant.V1;
    if (roll <= 66)
        return JumpAnimationVariant.GENERATED;
    return JumpAnimationVariant.JETPACK;
}
