import { jetpackAirborneConfig, jetpackPoweredBody } from '../core/jetpack-motion.js';
import { stepAirborne } from '../core/physics.js';

export function stepJetpackAirborne(screen, body, actionState, config, world) {
    return stepAirborne(
        screen,
        jetpackPoweredBody(body, actionState),
        jetpackAirborneConfig(config, actionState.animationTick),
        world
    );
}
