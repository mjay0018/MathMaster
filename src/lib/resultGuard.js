// Validation gate for values produced by the math engines.
//
// The engines can hand back things that are not answers:
//
//   - math.js parses `sin(x) = 1/2` as a *function assignment*, not an equation,
//     so evaluate() returns a typed-function object whose toString() is minified
//     JavaScript source.
//   - Algebrite echoes the original operator back when it cannot process an
//     expression, e.g. derivative('asin(x)', 'x') returns the string
//     "d(asin(x),x)".
//
// Neither should ever reach a student labelled as a solved answer. Everything
// that flows from an engine to the UI goes through this module first.

import { create, all } from 'mathjs';

const math = create(all);

// Longest answer we will render. Nothing legitimate comes close; the cap is a
// backstop so that an unrecognised type can never dump a wall of source text
// into the UI even if it passes the type check below.
const MAX_ANSWER_LENGTH = 200;

// Operators Algebrite returns unchanged when it cannot evaluate them.
//
// Not anchored: a partial failure is the common case. Differentiating
// `asin(x) + x^2` yields "2*x+d(asin(x),x)", where most of the answer is
// correct and one term was never evaluated. The word boundary keeps this from
// matching function names that merely end in "d", such as "rad(".
const UNEVALUATED_OPERATOR = /\b(d|integral|defint)\s*\(/;

/**
 * Decide whether an engine result can be shown to the user.
 *
 * Deliberately an allow-list: math.js can return functions, matrices, units,
 * complex numbers, big numbers and fractions, and new types arrive with new
 * releases. Anything not recognised here is treated as unsupported rather than
 * stringified and hoped for.
 *
 * @returns {{ok: true, text: string} | {ok: false, reason: string}}
 */
export function describeResult(value) {
  if (typeof value === 'function') {
    return {
      ok: false,
      reason: 'that looks like a function definition rather than a problem to evaluate'
    };
  }

  if (value === null || value === undefined) {
    return { ok: false, reason: 'the math engine did not return a value' };
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return { ok: false, reason: 'the result is undefined for this input' };
    }
    return renderable(String(value));
  }

  if (typeof value === 'boolean') {
    return renderable(String(value));
  }

  if (
    math.isComplex(value) ||
    math.isUnit(value) ||
    math.isBigNumber(value) ||
    math.isFraction(value) ||
    math.isMatrix(value)
  ) {
    return renderable(value.toString());
  }

  return { ok: false, reason: 'the math engine returned a result this app cannot display' };
}

/**
 * True when a symbolic engine handed back the operator it was asked to apply,
 * which means it could not evaluate the expression.
 *
 * Matches Algebrite's unevaluated forms: "d(asin(x),x)", "integral(...)".
 */
export function isUnevaluatedSymbolic(text) {
  return typeof text === 'string' && UNEVALUATED_OPERATOR.test(text);
}

/**
 * Build the standard solution object used for anything the app cannot solve.
 *
 * Uses the same shape as a real solution so the UI needs no special case, but
 * never claims a result. `unsupported: true` is available for callers that want
 * to style these differently later.
 */
export function unsupportedSolution(answer, options = {}) {
  return {
    steps: options.steps || ['MathMaster could not solve this problem.'],
    answer,
    tips: options.tips || [
      'Check that the expression uses standard notation, e.g. 2*x instead of 2x',
      'Try rewriting the problem in a simpler form'
    ],
    common_mistakes: options.common_mistakes || [
      'Using notation the solver does not recognise',
      'Entering an equation where an expression is expected'
    ],
    graph: options.graph || null,
    unsupported: true
  };
}

function renderable(text) {
  if (text.length > MAX_ANSWER_LENGTH) {
    return { ok: false, reason: 'the math engine returned a result this app cannot display' };
  }
  return { ok: true, text };
}
