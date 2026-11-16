/** Flip to true for the development overlay, categorised logging and the window.__bridgeGame test hooks. */
export const DEBUG_MODE = false;

export const GAME_VERSION = '1.0.0';

/**
 * Draft, switched off: the drone flight over the canal town after Start (js/screens/drone-intro.js,
 * shots in assets/images/drone/). true plays it again; false goes straight from Start to the story.
 */
export const DRONE_INTRO = false;

/** TEMPORARY (review aid): a "Skip to end" button that builds the whole bridge and jumps to the ending. Set false to remove. */
export const SKIP_TO_END_BUTTON = true;


/**
 * The Triangle Workshop (js/learning/): after "Your help is needed" the operator takes the learner into his
 * workshop on the yard to explore triangles before the crane game. false skips straight to "How to play".
 */
export const LEARNING_SECTION = true;
