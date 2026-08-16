// Unit tests for the engine-result validation gate.

import test from 'node:test';
import assert from 'node:assert/strict';
import { create, all } from 'mathjs';
import {
  describeResult,
  isUnevaluatedSymbolic,
  unsupportedSolution
} from '../src/lib/resultGuard.js';

const math = create(all);

test('rejects function objects returned by math.js assignments', () => {
  // `sin(x) = 1/2` is a function assignment to math.js, not an equation.
  const result = math.evaluate('sin(x) = 1/2');
  assert.equal(typeof result, 'function');

  const check = describeResult(result);
  assert.equal(check.ok, false);
  assert.match(check.reason, /function definition/);
});

test('rejects null, undefined and NaN', () => {
  assert.equal(describeResult(null).ok, false);
  assert.equal(describeResult(undefined).ok, false);
  assert.equal(describeResult(NaN).ok, false);
});

test('rejects unrecognised plain objects', () => {
  assert.equal(describeResult({ toString: () => 'looks harmless' }).ok, false);
});

test('rejects strings, which are never a math answer here', () => {
  assert.equal(describeResult('some text').ok, false);
});

test('accepts plain numbers, including infinity', () => {
  assert.deepEqual(describeResult(42), { ok: true, text: '42' });
  assert.equal(describeResult(Infinity).ok, true);
});

test('accepts the math.js value types the solvers can produce', () => {
  for (const expression of ['sqrt(-4)', '5 kg + 3 kg', 'bignumber(1)/3', '2 > 1']) {
    const check = describeResult(math.evaluate(expression));
    assert.equal(check.ok, true, `${expression} should be renderable`);
    assert.ok(check.text.length > 0);
  }
});

test('caps absurdly long output even if the type is allowed', () => {
  const longUnit = { toString: () => 'x'.repeat(5000) };
  assert.equal(describeResult(longUnit).ok, false);
});

test('detects Algebrite operators returned unevaluated', () => {
  assert.equal(isUnevaluatedSymbolic('d(asin(x),x)'), true);
  assert.equal(isUnevaluatedSymbolic('integral(exp(x^2),x)'), true);
  assert.equal(isUnevaluatedSymbolic('defint(x,x,0,1)'), true);
});

test('detects partially unevaluated results', () => {
  // Differentiating asin(x) + x^2: one term solved, one term not.
  assert.equal(isUnevaluatedSymbolic('2*x+d(asin(x),x)'), true);
  assert.equal(isUnevaluatedSymbolic('asin(x)+x*d(asin(x),x)'), true);
});

test('does not mistake real answers for failures', () => {
  assert.equal(isUnevaluatedSymbolic('2*x'), false);
  assert.equal(isUnevaluatedSymbolic('-cos(x)'), false);
  assert.equal(isUnevaluatedSymbolic('sgn(x)'), false);
  assert.equal(isUnevaluatedSymbolic('1/((-x^2+1)^(1/2))'), false);
  // Function names ending in "d" must not trip the word boundary.
  assert.equal(isUnevaluatedSymbolic('rad(x)+mod(x,2)'), false);
});

test('unsupportedSolution matches the shape the UI expects', () => {
  const solution = unsupportedSolution('Could not solve this');

  assert.equal(solution.answer, 'Could not solve this');
  assert.equal(solution.unsupported, true);
  assert.ok(Array.isArray(solution.steps));
  assert.ok(Array.isArray(solution.tips));
  assert.ok(Array.isArray(solution.common_mistakes));
  assert.equal(solution.graph, null);
});
