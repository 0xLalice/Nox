import Gio from 'gi://Gio';

import {
    JUMP_GENERATED_FRAME_COUNT,
    JUMP_FRAME_COUNT,
    JUMP_JETPACK_FRAME_COUNT,
    REST_FRAME_COUNT,
    REST_PROFILE_FRAME_COUNT,
    RUN_FRAME_COUNT,
    WALK_FRAME_COUNT,
} from '../core/constants.js';

export function loadAnimationFrames(extensionUrl) {
    const root = Gio.File.new_for_uri(extensionUrl)
        .get_parent()
        .get_child('assets')
        .get_child('nox')
    return Object.freeze({
        walk: loadNumberedFrames(root.get_child('walk'), WALK_FRAME_COUNT),
        run: loadNumberedFrames(root.get_child('run'), RUN_FRAME_COUNT),
        jump: loadNumberedFrames(root.get_child('jump'), JUMP_FRAME_COUNT),
        jumpGenerated: loadNumberedFrames(root.get_child('jump-generated'), JUMP_GENERATED_FRAME_COUNT),
        jumpJetpack: loadNumberedFrames(root.get_child('jump-jetpack'), JUMP_JETPACK_FRAME_COUNT),
        rest: loadNumberedFrames(root.get_child('rest'), REST_FRAME_COUNT),
        restProfile: loadNumberedFrames(root.get_child('rest-profile-cropped'), REST_PROFILE_FRAME_COUNT),
    });
}

function loadNumberedFrames(root, count) {
    const frames = [];
    for (let i = 0; i < count; i++)
        frames.push(new Gio.FileIcon({ file: root.get_child(`${i}.webp`) }));
    return frames;
}
