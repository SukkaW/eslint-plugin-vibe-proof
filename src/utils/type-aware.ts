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

const INDETERMINATE_TYPE_FLAGS = setBit(ts.TypeFlags.Any, ts.TypeFlags.Unknown);

/**
 * Tests `match` against a type, unwrapping nullability, unions, intersections
 * and type parameter constraints. `indeterminate` is the verdict for types the
 * checker cannot pin down (any / unknown / unresolved, or an unconstrained
 * type parameter): pass `true` when the caller falls back to a syntactic
 * heuristic on uncertainty ("could be"), `false` when the caller reports only
 * on positive proof ("definitely is").
 */
function matchesType(
  checker: ts.TypeChecker,
  type: ts.Type,
  match: (t: ts.Type) => boolean,
  indeterminate: boolean
): boolean {
  let t: ts.Type = checker.getNonNullableType(type);

  // unwrap type parameters to their base constraint
  while (t.isTypeParameter()) {
    const constraint = checker.getBaseConstraintOfType(t);
    if (constraint === t || constraint == null) return indeterminate;
    t = checker.getNonNullableType(constraint);
  }

  const $t: ts.Type = t;

  if (getBit($t.flags, INDETERMINATE_TYPE_FLAGS)) return indeterminate;
  if ($t.isUnion()) return $t.types.every((part) => matchesType(checker, part, match, indeterminate));
  if ($t.isIntersection()) return $t.types.some((part) => matchesType(checker, part, match, indeterminate));

  return match(t);
}

const TYPED_ARRAY_TYPE_NAMES = new Set<string>([
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
  'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array',
  'Float16Array', 'Float32Array', 'Float64Array',
  'BigInt64Array', 'BigUint64Array'
]);

// Arrays, tuples and typed arrays — index- and `.length`-accessible
function isIndexableArrayType(checker: ts.TypeChecker, t: ts.Type): boolean {
  if (checker.isArrayType(t) || checker.isTupleType(t)) return true;
  const symbol = t.getSymbol();
  return symbol != null && TYPED_ARRAY_TYPE_NAMES.has(symbol.getName());
}

export function couldBeArrayType(checker: ts.TypeChecker, type: ts.Type): boolean {
  return matchesType(checker, type, (t) => checker.isArrayType(t) || checker.isTupleType(t), true);
}

/** Positive proof only — any / unknown / unconstrained generics are NOT arrays. */
export function isDefinitelyIndexableArrayType(checker: ts.TypeChecker, type: ts.Type): boolean {
  return matchesType(checker, type, (t) => isIndexableArrayType(checker, t), false);
}

/** Positive proof that every possible constituent is assignable to `target`. */
export function isDefinitelyAssignableToType(
  checker: ts.TypeChecker,
  type: ts.Type,
  target: ts.Type
): boolean {
  return matchesType(checker, type, (t) => checker.isTypeAssignableTo(t, target), false);
}

// Built-in collections (besides Array) whose callback-taking iteration methods
// (forEach / map / etc.) invoke the callback synchronously.
const SYNC_ITERABLE_TYPE_NAMES = new Set<string>([
  'Set', 'ReadonlySet', 'Map', 'ReadonlyMap',
  'NodeList', 'NodeListOf', 'DOMTokenList',
  'URLSearchParams', 'FormData', 'Headers',
  ...TYPED_ARRAY_TYPE_NAMES
]);

export function couldBeSyncIterationReceiver(checker: ts.TypeChecker, type: ts.Type): boolean {
  return matchesType(checker, type, (t) => {
    if (checker.isArrayType(t) || checker.isTupleType(t)) return true;
    const symbol = t.getSymbol();
    return symbol != null && SYNC_ITERABLE_TYPE_NAMES.has(symbol.getName());
  }, true);
}
