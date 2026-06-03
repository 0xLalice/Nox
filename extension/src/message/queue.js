export function createMessageQueue() {
    return Object.freeze({
        messages: Object.freeze([]),
        activeIndex: 0,
        lastDisplayedId: '',
    });
}

export function enqueueMessage(queue, message) {
    if (queue.messages.some(item => item.id === message.id))
        return queue;
    return Object.freeze({
        ...queue,
        messages: Object.freeze([...queue.messages, message]),
    });
}

export function activeMessage(queue) {
    return queue.messages[queue.activeIndex] || null;
}

export function advanceAfterOk(queue) {
    const active = activeMessage(queue);
    if (!active)
        return Object.freeze({ queue, ackLastId: '', done: true });

    const lastDisplayedId = active.id;
    const nextIndex = queue.activeIndex + 1;
    if (nextIndex < queue.messages.length) {
        return Object.freeze({
            queue: Object.freeze({
                ...queue,
                activeIndex: nextIndex,
                lastDisplayedId,
            }),
            ackLastId: '',
            done: false,
        });
    }

    return Object.freeze({
        queue: createMessageQueue(),
        ackLastId: lastDisplayedId,
        done: true,
    });
}
