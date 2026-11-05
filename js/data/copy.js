/**
 * Every learner-facing string. All wording comes from the source deck
 * ("Untitled presentation.pdf", pages 3-19); nothing academic is invented here.
 */
export const COPY = Object.freeze({
  title: {
    eyebrow: 'TRIANGLES',
    headline: 'BRIDGE BUILDER',
    subline: 'Help the builder choose the right frames.',
    start: 'Start',
  },
  screens: {
    meetBuilder: {
      code: 'G0.1',
      title: 'Meet the Builder',
      line: "I have all these triangular frames, but I can't remember which ones go where!",
      cta: 'Next',
    },
    helpNeeded: {
      code: 'G0.2',
      title: 'Your Help Is Needed',
      line: 'Can you help me choose the right frames?',
      cta: 'Next',
    },
    howToPlay: {
      code: 'G0.3',
      title: 'How to Play',
      intro: 'Use the crane to pick the triangle we need and place it on the bridge.',
      steps: ['Move the crane', 'Pick the triangle', 'Place it on the bridge'],
      cta: "Let's do a practice round first!",
    },
  },
  builderName: 'Builder',
  completion: {
    banner: 'Excellent work! Our bridge is complete.',
    headline: 'BRIDGE BUILT!',
    subline: 'Great work, Engineer!',
    builderLine: 'The bridge is complete! Now the people of both towns can visit each other!',
    badge: 'AMAZING JOB!',
    together: 'TOGETHER WE CONNECT',     // the two banners on the bridge (PDF p19)
    replay: 'Build it again',
  },
  controls: {
    title: 'CRANE CONTROLS',
    pick: 'PICK',
    drop: 'DROP',
  },
  hints: {
    moveToFrame: 'Move the crane over a frame.',
    pressPick: 'Press PICK to lift this frame.',
    carryToMark: 'Carry the frame to the glowing spot on the bridge.',
    pressDrop: 'Press DROP to place it.',
    returnFrame: 'Press DROP to put the frame back.',
    building: 'The crew is building…',
    collapsing: 'Hold on…',
    rebuild: "Let's rebuild from the start.",
  },
  feedback: {
    correct: 'Great choice!',
    incorrect: 'That frame does not fit.',
  },
  progress: (current, total) => `Task ${current} of ${total}`,
});
