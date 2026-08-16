// End-to-end regression tests for the solvers.
//
// Two kinds of test live here:
//
//   1. Ordinary tests, which must pass. These cover the result-validation gate
//      and behaviour that is known to be correct today.
//   2. Tests marked `{ todo: ... }`, which assert the *correct* answer for a
//      known open defect. Node reports these as TODO rather than failures, so
//      the suite stays green while the bug list stays visible and executable.
//      When a defect is fixed, remove the todo marker.

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { solveTrigonometry, solveFunctions, solveLimit } from '../src/lib/solvers/otherSolvers.js';
import { solveArithmetic } from '../src/lib/solvers/arithmeticSolver.js';
import { solveDerivative } from '../src/lib/solvers/derivativesSolver.js';
import { solveIntegral } from '../src/lib/solvers/integralsSolver.js';
import { solveAlgebra } from '../src/lib/solvers/algebraSolver.js';
import { extractFunctionFromProblem, extractVariable } from '../src/lib/mathParser.js';

// Anything that looks like JavaScript source must never reach the user.
function assertNoSourceLeak(solution) {
  const rendered = [solution.answer, ...(solution.steps || [])].join('\n');

  for (const marker of ['function ', 'arguments.length', 'apply(this', '=>', 'prototype']) {
    assert.ok(
      !rendered.includes(marker),
      `solution leaked JavaScript source (found ${JSON.stringify(marker)}): ${rendered.slice(0, 120)}`
    );
  }
}

describe('result validation gate', () => {
  test('sin(x)=1/2 never exposes function source', () => {
    const solution = solveTrigonometry(extractFunctionFromProblem('sin(x)=1/2'));

    assertNoSourceLeak(solution);
    assert.equal(solution.unsupported, true);
    assert.match(solution.answer, /not supported yet/i);
  });

  test('trig equations are routed out before evaluation', () => {
    for (const problem of ['cos(x)=0', 'tan(x)=1', 'sin(2*x)=0.5']) {
      const solution = solveTrigonometry(extractFunctionFromProblem(problem));

      assertNoSourceLeak(solution);
      assert.equal(solution.unsupported, true, `${problem} should be reported as unsupported`);
    }
  });

  test('arithmetic rejects equations instead of evaluating an assignment', () => {
    // Note: "f(x)=1/2" is rewritten to "1/2" by the parser before it reaches a
    // solver, so it is a legitimate calculation. These reach the solver intact.
    for (const problem of ['x=5', '2+2=5']) {
      const solution = solveArithmetic(extractFunctionFromProblem(problem));

      assertNoSourceLeak(solution);
      assert.equal(solution.unsupported, true, `${problem} should be reported as unsupported`);
      assert.match(solution.answer, /equation/i);
    }
  });

  test('an unchanged symbolic operator is not reported as solved', () => {
    // Algebrite returns "d(asin(x),x)" unchanged; that must not be an answer.
    const solution = solveDerivative('x+asin(x)');

    assert.equal(solution.unsupported, true);
    assert.ok(!/^f'\(.\) = .*\bd\(/.test(solution.answer), 'unevaluated operator shown as an answer');
    assert.match(solution.answer, /could not differentiate/i);
  });

  test('valid work is still solved normally', () => {
    const derivative = solveDerivative('x^2 + 3*x');
    assert.equal(derivative.unsupported, undefined);
    assert.equal(derivative.answer, "f'(x) = 2*x+3");

    const integral = solveIntegral('x^2');
    assert.equal(integral.unsupported, undefined);
    assert.match(integral.answer, /1\/3\*x\^3/);

    const arithmetic = solveArithmetic('(5+3)*4-2^3');
    assert.equal(arithmetic.unsupported, undefined);
    assert.equal(arithmetic.answer, '24');

    const trig = solveTrigonometry('sin(pi/4)');
    assert.equal(trig.unsupported, undefined);
    assert.match(trig.answer, /0\.7071/);

    const algebra = solveAlgebra('2*x+5=11');
    assert.equal(algebra.answer, 'x = 3.0000');
  });

  test('every solver returns the full solution shape', () => {
    const solutions = [
      solveDerivative('x^2'),
      solveIntegral('x^2'),
      solveArithmetic('1+1'),
      solveTrigonometry('sin(x)=1/2'),
      solveAlgebra('x^2-4=0')
    ];

    for (const solution of solutions) {
      assert.ok(Array.isArray(solution.steps), 'steps must be an array');
      assert.equal(typeof solution.answer, 'string', 'answer must be a string');
      assert.ok(Array.isArray(solution.tips), 'tips must be an array');
      assert.ok(Array.isArray(solution.common_mistakes), 'common_mistakes must be an array');
      assert.ok('graph' in solution, 'graph key must be present');
    }
  });
});

describe('variable detection', () => {
  test('ignores function names and constants', () => {
    assert.equal(extractVariable('sin(x)'), 'x');
    assert.equal(extractVariable('ln(x)'), 'x');
    assert.equal(extractVariable('sqrt(x-2)'), 'x');
    assert.equal(extractVariable('2*sin(3*x)'), 'x');
    // e is Euler's number, not the variable.
    assert.equal(extractVariable('e^x'), 'x');
  });

  test('finds the variable actually used', () => {
    assert.equal(extractVariable('cos(2*t)'), 't');
    assert.equal(extractVariable('2*y+5=11'), 'y');
    // Both sides of an equation are considered.
    assert.equal(extractVariable('x^2-4=0'), 'x');
  });

  test('falls back to x when there is no variable', () => {
    assert.equal(extractVariable('2+2'), 'x');
    assert.equal(extractVariable(''), 'x');
  });

  test('differentiates and integrates named functions correctly', () => {
    assert.equal(solveDerivative('sin(x)').answer, "f'(x) = cos(x)");
    assert.equal(solveDerivative('cos(2*x)').answer, "f'(x) = -2*sin(2*x)");
    assert.equal(solveDerivative('ln(x)').answer, "f'(x) = 1/x");
    assert.match(solveIntegral('sin(x)').answer, /-cos\(x\)/);
    assert.match(solveIntegral('1/x').answer, /log\(x\)/);
  });
});

describe('known defects', () => {
  test('implicit multiplication must not break function calls', { todo: '2sin(x) parses to 2*sin*(x)' }, () => {
    assert.equal(extractFunctionFromProblem('2sin(x)'), '2*sin(x)');
  });

  test('natural language must not leak filler words into the expression', { todo: 'parser keeps "for x:" and "the roots of"' }, () => {
    assert.equal(extractFunctionFromProblem('Solve for x: 2*x + 3 = 7'), '2*x+3=7');
    assert.equal(extractFunctionFromProblem('Find the roots of x^2-4'), 'x^2-4');
  });

  test('limits must evaluate the classic example', { todo: 'whitespace is stripped before the limit regex can match' }, () => {
    const solution = solveLimit(extractFunctionFromProblem('lim x->0 (sin(x)/x)'));
    assert.match(solution.answer, /= 1\b/);
  });

  test('inverse trig aliases behave like their long forms', { todo: 'Algebrite only knows arcsin/arccos/arctan' }, () => {
    assert.equal(solveDerivative('asin(x)').answer, solveDerivative('arcsin(x)').answer);
  });

  test('extrema must include cusps and domain endpoints', { todo: 'findVertex returns the largest |y|, i.e. an endpoint' }, () => {
    // Vertex of x^2 - 4x + 3 is (2, -1), not the sampling boundary.
    const solution = solveFunctions('x^2-4*x+3');
    assert.ok(
      solution.steps.some(step => step.includes('(2.00, -1.00)')),
      `expected the true vertex, got: ${solution.steps.join(' | ')}`
    );
  });

  test('arithmetic step numbering is sequential', { todo: 'stepNum uses steps.length, which counts sub-lines' }, () => {
    const steps = solveArithmetic('(5+3)*4-2^3').steps.filter(step => step.startsWith('Step '));
    const numbers = steps.map(step => Number(step.match(/^Step (\d+)/)[1]));

    assert.deepEqual(numbers, numbers.map((_, index) => index + 1));
  });

  test('simplification must not claim work it did not do', { todo: 'comparison does not normalise whitespace' }, () => {
    const solution = solveAlgebra('(x+2)*(x-3)');
    assert.ok(
      !solution.steps.includes('Combine like terms and simplify') || solution.answer !== '(x + 2) * (x - 3)',
      'claimed simplification while returning the input unchanged'
    );
  });

  test('exact values are preferred over decimals', { todo: 'toFixed(4) is applied to every non-integer result' }, () => {
    assert.match(solveArithmetic('1/3+1/6').answer, /1\/2/);
  });
});
