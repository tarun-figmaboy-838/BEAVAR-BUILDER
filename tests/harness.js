/** Tiny test harness that runs under Node (`node tests/*.test.js`) and JavaScriptCore (`jsc -m`). */
const output = globalThis.console?.log?.bind(globalThis.console) ?? globalThis.print;
let failures = 0;
let passes = 0;

export function test(name, fn) {
  try {
    fn();
    passes += 1;
    output(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    output(`  FAIL ${name}\n       ${error.message}`);
  }
}

export const assert = {
  ok(value, message = 'expected truthy value') {
    if (!value) throw new Error(message);
  },
  equal(actual, expected, message) {
    if (actual !== expected) throw new Error(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
  deepEqual(actual, expected, message) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new Error(message ?? `expected ${b}, got ${a}`);
  },
};

export function report(suite) {
  output(`${suite}: ${passes} passed, ${failures} failed`);
  if (failures && typeof process !== 'undefined') process.exitCode = 1;
  return failures === 0;
}
