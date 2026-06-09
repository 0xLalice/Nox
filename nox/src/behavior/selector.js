import { CONDITIONS } from './conditions.js';

export class WeightedSelector {
    constructor(random = Math.random) {
        this.random = random;
    }

    select(tree, context) {
        const eligible = tree.filter(node => this.#eligible(node, context));
        if (!eligible.length)
            return null;
        const priority = Math.max(...eligible.map(node => node.priority));
        const top = eligible.filter(node => node.priority === priority);
        return chooseWeighted(top, this.random);
    }

    #eligible(node, context) {
        if (node.context !== context.context)
            return false;
        return (node.conditions || []).every(condition => CONDITIONS[condition]?.(context));
    }
}

function chooseWeighted(nodes, random) {
    if (nodes.length === 1)
        return nodes[0];
    const total = nodes.reduce((sum, node) => sum + node.weight, 0);
    let pick = random() * total;
    for (const node of nodes) {
        pick -= node.weight;
        if (pick <= 0)
            return node;
    }
    return nodes[nodes.length - 1];
}
