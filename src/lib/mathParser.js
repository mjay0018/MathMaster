// Utility to parse and clean user math input

import { create, all } from 'mathjs';

const math = create(all);

export function parseMathExpression(input) {
  let cleaned = input.trim();

  // First, protect mathematical constants and functions by replacing them with placeholders
  const protectedTerms = [];
  let placeholder = 0;

  // Protect trig functions and constants (must be done before implicit multiplication)
  const constants = ['pi', 'PI', 'e', 'E', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'sqrt', 'log', 'ln', 'exp', 'abs'];
  constants.forEach(term => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    cleaned = cleaned.replace(regex, (match) => {
      const token = `__PROTECTED_${placeholder}__`;
      protectedTerms.push({ token, value: match });
      placeholder++;
      return token;
    });
  });

  // Convert common math notation to JavaScript-friendly format
  cleaned = cleaned
    // Handle superscripts (x² → x^2)
    .replace(/([a-z])²/gi, '$1^2')
    .replace(/([a-z])³/gi, '$1^3')
    // Handle multiplication (2x → 2*x) - now safe because constants are protected
    .replace(/(\d)([a-z])/gi, '$1*$2')
    // Handle implicit multiplication (x(x+1) → x*(x+1))
    .replace(/([a-z])\(/gi, '$1*(')
    .replace(/\)([a-z])/gi, ')*$1')
    // Handle division symbol (÷ → /)
    .replace(/÷/g, '/')
    // Handle multiplication symbol (× → *)
    .replace(/×/g, '*')
    // Handle spaces around operators
    .replace(/\s+/g, '');

  // Restore protected terms
  protectedTerms.forEach(({ token, value }) => {
    cleaned = cleaned.replace(token, value);
  });

  return cleaned;
}

// Names that are values rather than variables to solve for.
const KNOWN_CONSTANTS = new Set([
  'pi', 'PI', 'tau', 'e', 'E', 'i', 'phi', 'Infinity', 'NaN',
  'true', 'false', 'null', 'undefined'
]);

// When an expression contains several variables, these are the conventional
// ones to differentiate or solve with respect to, in order of preference.
const PREFERRED_VARIABLES = ['x', 'y', 't', 'z', 'u', 'v', 'n', 'k', 's', 'r'];

export function extractVariable(expression) {
  // Find the main variable (usually x, but could be y, t, etc.).
  //
  // This must not simply take the first letter: in "sin(x)" that is the "s" of
  // the function name, which sends the whole solver off differentiating with
  // respect to a variable that does not exist.
  const symbols = collectSymbols(expression);

  if (symbols.length === 0) {
    return 'x';
  }

  for (const preferred of PREFERRED_VARIABLES) {
    if (symbols.includes(preferred)) {
      return preferred;
    }
  }

  return symbols[0];
}

// Collect candidate variable names, excluding function names and constants.
function collectSymbols(expression) {
  const text = String(expression || '');
  const found = [];

  const add = (name) => {
    if (!KNOWN_CONSTANTS.has(name) && !found.includes(name)) {
      found.push(name);
    }
  };

  // math.js reads "x^2 - 4 = 0" as an assignment and rejects it, so parse each
  // side of an equation separately.
  let parsed = false;
  for (const part of text.split('=')) {
    if (!part.trim()) continue;

    try {
      const node = math.parse(part);
      parsed = true;

      node.traverse((current, path, parent) => {
        // A FunctionNode holds its name in `fn`; that is not a variable.
        const isFunctionName = parent && parent.isFunctionNode && path === 'fn';
        if (current.isSymbolNode && !isFunctionName) {
          add(current.name);
        }
      });
    } catch (e) {
      // Unparseable side - fall back to the textual scan below.
    }
  }

  if (parsed) {
    return found;
  }

  // Fallback for input math.js cannot parse: drop function calls, then take
  // whatever identifiers remain.
  const withoutCalls = text.replace(/[a-zA-Z_]\w*\s*\(/g, '(');
  for (const name of withoutCalls.match(/[a-zA-Z_]\w*/g) || []) {
    add(name);
  }

  return found;
}

export function extractFunctionFromProblem(problemText) {
  // Extract mathematical expression from natural language
  // Examples:
  // "Find the derivative of x^2 + 3x" -> "x^2 + 3x"
  // "Integrate 2x + 1" -> "2x + 1"
  // "Solve x^2 - 4 = 0" -> "x^2 - 4 = 0"

  const patterns = [
    /(?:derivative of|differentiate)\s+(.+)/i,
    /(?:integrate|integral of)\s+(.+)/i,
    /(?:solve|find)\s+(.+)/i,
    /(?:simplify|expand)\s+(.+)/i,
    /(?:factor|factorize)\s+(.+)/i,
    /(?:limit|lim)\s+.*?of\s+(.+?)(?:\s+as|$)/i,
    /f\(.\)\s*=\s*(.+)/i, // f(x) = ...
  ];

  for (const pattern of patterns) {
    const match = problemText.match(pattern);
    if (match) {
      return parseMathExpression(match[1]);
    }
  }

  // If no pattern matches, assume the entire input is the expression
  return parseMathExpression(problemText);
}

export function isEquation(expression) {
  return expression.includes('=');
}
