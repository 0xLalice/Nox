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

export function messageControls(queue) {
    const total = queue.messages.length;
    const active = activeMessage(queue);
    const position = active ? queue.activeIndex + 1 : 0;
    return Object.freeze({
        position,
        total,
        counterLabel: active ? `< ${position}/${total} >` : '',
        canPrevious: position > 1,
        canNext: active && position < total,
        canDone: active && position === total,
    });
}

export function previousMessage(queue) {
    if (queue.activeIndex <= 0)
        return queue;
    return Object.freeze({
        ...queue,
        activeIndex: queue.activeIndex - 1,
    });
}

export function nextMessage(queue) {
    const active = activeMessage(queue);
    if (!active || queue.activeIndex >= queue.messages.length - 1)
        return queue;
    return Object.freeze({
        ...queue,
        activeIndex: queue.activeIndex + 1,
        lastDisplayedId: active.id,
    });
}

export function ackDisplayedSequence(queue) {
    const active = activeMessage(queue);
    if (!active)
        return Object.freeze({ queue, ackLastId: '', done: true });

    if (!messageControls(queue).canDone)
        return Object.freeze({ queue, ackLastId: '', done: false });

    return Object.freeze({
        queue: createMessageQueue(),
        ackLastId: active.id,
        done: true,
    });
}
