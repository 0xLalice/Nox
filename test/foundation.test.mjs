import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createBody } from '../extension/src/core/body.js';
import { NoxV3Controller } from '../extension/src/core/controller.js';
import { buildContext } from '../extension/src/core/context.js';
import { wallHit } from '../extension/src/core/geometry.js';
import { BEHAVIOR_TREE } from '../extension/src/behavior/tree.js';
import { WeightedSelector } from '../extension/src/behavior/selector.js';
import { ACTION_CONTRACTS, ACTION_REGISTRY, validateRegistry } from '../extension/src/behavior/registry.js';

function state(overrides = {}) {
    const screen = overrides.screen || { x: 0, y: 0, width: 300, height: 200 };
    return {
        screen,
        body: {
            ...createBody(screen),
            ...overrides.body,
        },
    };
}

describe('Nox V3 foundation behavior', () => {
    it('walks right on ground', () => {
        const controller = new NoxV3Controller(state({ body: { x: 20, direction: 1, speed: 5, velocityX: 5 } }));
        const result = controller.tick();
        assert.equal(result.node.id, 'ground.walk');
        assert.equal(result.state.body.x, 25);
        assert.equal(result.state.body.y, 36);
        assert.equal(result.state.body.direction, 1);
    });

    it('walks left on ground', () => {
        const controller = new NoxV3Controller(state({ body: { x: 20, direction: -1, speed: 5, velocityX: -5 } }));
        const result = controller.tick();
        assert.equal(result.node.id, 'ground.walk');
        assert.equal(result.state.body.x, 15);
        assert.equal(result.state.body.direction, -1);
    });

    it('clamps and flips at right wall', () => {
        const controller = new NoxV3Controller(state({
            screen: { x: 0, y: 0, width: 300, height: 200 },
            body: { x: 124, direction: 1, speed: 5, velocityX: 5 },
        }));
        const result = controller.tick();
        assert.equal(result.node.id, 'wall.flip');
        assert.equal(result.state.body.x, 126);
        assert.equal(result.state.body.direction, -1);
        assert.equal(result.state.body.velocityX, -5);
    });

    it('clamps and flips at left wall', () => {
        const controller = new NoxV3Controller(state({ body: { x: 2, direction: -1, speed: 5, velocityX: -5 } }));
        const result = controller.tick();
        assert.equal(result.node.id, 'wall.flip');
        assert.equal(result.state.body.x, 0);
        assert.equal(result.state.body.direction, 1);
        assert.equal(result.state.body.velocityX, 5);
    });

    it('builds context without mutating state', () => {
        const input = state({ body: { x: 42 } });
        const before = JSON.stringify(input);
        const context = buildContext(input);
        assert.equal(JSON.stringify(input), before);
        assert.equal(context.body.x, 42);
    });

    it('selector chooses wall flip before walk when projected body hits wall', () => {
        const input = state({ body: { x: 124, direction: 1, speed: 5, velocityX: 5 } });
        const context = buildContext(input);
        assert.equal(wallHit(context.body, context.screen), 'right');
        assert.equal(new WeightedSelector(() => 0).select(BEHAVIOR_TREE, context).id, 'wall.flip');
    });

    it('behavior tree nodes have action registry entries and contracts', () => {
        assert.equal(validateRegistry(BEHAVIOR_TREE), true);
        for (const node of BEHAVIOR_TREE) {
            assert.ok(node.weight > 0);
            assert.ok(ACTION_REGISTRY[node.action]);
            assert.ok(ACTION_CONTRACTS[node.action]);
            assert.equal(ACTION_CONTRACTS[node.action].returnsBodyUpdate, true);
        }
    });
});
