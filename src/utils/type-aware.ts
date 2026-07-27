import ts from 'typescript';
import { getBit, setBit } from 'foxts/bitwise';
import type { TSESLint } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/types';
import { isParserWithTypeInformation } from '@/utils/create-eslint-rule';

export interface TypeAware {
  checker: ts.TypeChecker,
  getTypeAtLocation(node: TSESTree.Node): ts.Type
}

/**
 * Returns type-aware helpers when typed linting is enabled, `null` otherwise.
 * Rules should fall back to their syntactic heuristics on `null`.
 */
export function getTypeAware(sourceCode: TSESLint.SourceCode): TypeAware | null {
  const services = sourceCode.parserServices;
  if (!isParserWithTypeInformation(services)) return null;
  return {
    checker: services.program.getTypeChecker(),
    getTypeAtLocation: (node) => services.getTypeAtLocation(node)
  };
}

/**
 * Tests `match` against a type, unwrapping nullability, unions, intersections
 * and type parameter constraints. Indeterminate types (any / unknown /
 * unresolved, or an unconstrained type parameter) return `true` so callers keep
 * their syntactic-heuristic behavior when the checker cannot tell.
 */
const INDETERMINATE_TYPE_FLAGS = setBit(ts.TypeFlags.Any, ts.TypeFlags.Unknown);

function couldBe(checker: ts.TypeChecker, type: ts.Type, match: (t: ts.Type) => boolean): boolean {
  let t = checker.getNonNullableType(type);

  // unwrap type parameters to their base constraint
  while (t.isTypeParameter()) {
    const constraint = checker.getBaseConstraintOfType(t);
    if (constraint === t || constraint == null) return true;
    t = checker.getNonNullableType(constraint);
  }

  if (getBit(t.flags, INDETERMINATE_TYPE_FLAGS)) return true;
  if (t.isUnion()) return t.types.every((part) => couldBe(checker, part, match));
  if (t.isIntersection()) return t.types.some((part) => couldBe(checker, part, match));

  return match(t);
}

export function couldBeArrayType(checker: ts.TypeChecker, type: ts.Type): boolean {
  return couldBe(checker, type, (t) => checker.isArrayType(t) || checker.isTupleType(t));
}

// Built-in collections (besides Array) whose callback-taking iteration methods
// (forEach / map / etc.) invoke the callback synchronously.
const SYNC_ITERABLE_TYPE_NAMES = new Set([
  'Set', 'ReadonlySet', 'Map', 'ReadonlyMap',
  'NodeList', 'NodeListOf', 'DOMTokenList',
  'URLSearchParams', 'FormData', 'Headers',
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
  'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array',
  'Float16Array', 'Float32Array', 'Float64Array',
  'BigInt64Array', 'BigUint64Array'
]);

export function couldBeSyncIterationReceiver(checker: ts.TypeChecker, type: ts.Type): boolean {
  return couldBe(checker, type, (t) => {
    if (checker.isArrayType(t) || checker.isTupleType(t)) return true;
    const symbol = t.getSymbol();
    return symbol != null && SYNC_ITERABLE_TYPE_NAMES.has(symbol.getName());
  });
}
