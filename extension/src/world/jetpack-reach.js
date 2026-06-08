import {
    JETPACK_INITIAL_HORIZONTAL_SPEED,
    JETPACK_INITIAL_LIFT_SPEED,
    JETPACK_LAUNCH_FRAME,
    JUMP_FRAME_STEP,
    JUMP_REACH_SIMULATION_TICKS,
} from '../core/constants.js';
import { jetpackAirborneConfig, jetpackPoweredBody } from '../core/jetpack-motion.js';
import { startAirborne, stepAirborne } from '../core/physics.js';

export function jetpackCandidateLandsOnTarget(world, body, candidate, config) {
    let actionState = {
        animationTick: JETPACK_LAUNCH_FRAME,
        landingX: candidate.landingX,
        targetY: candidate.targetY,
    };
    let airborneBody = startAirborne(world.screen, {
        ...body,
        direction: candidate.direction || body.direction || 1,
    }, {
        x: (candidate.direction || body.direction || 1) * JETPACK_INITIAL_HORIZONTAL_SPEED,
        y: JETPACK_INITIAL_LIFT_SPEED,
    }).body;

    for (let i = 0; i < JUMP_REACH_SIMULATION_TICKS * 3; i++) {
        const update = stepAirborne(
            world.screen,
            jetpackPoweredBody(airborneBody, actionState),
            jetpackAirborneConfig(config, actionState.animationTick),
            world
        );
        if (update.landed)
            return update.support?.surfaceId === candidate.targetSurfaceId;
        airborneBody = update.body;
        actionState = {
            ...actionState,
            animationTick: actionState.animationTick + JUMP_FRAME_STEP,
        };
    }

    return false;
}
