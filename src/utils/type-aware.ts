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

/** Symbol flags that mean a property access invokes an accessor. */
const ACCESSOR_SYMBOL_FLAGS = setBit(ts.SymbolFlags.GetAccessor, ts.SymbolFlags.SetAccessor);

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

/**
 * Whether a property access provably reads a plain data property — never an
 * accessor, and never anything that could run user code.
 *
 * `hasSideEffect({ considerGetters: true })` has to assume every `obj.x` might
 * be a getter, because syntax alone cannot tell. With the checker we can look
 * the symbol up and find out, which lets a rule treat a genuine field read as
 * the cheap operation it is.
 *
 * Positive proof only: an unresolved symbol, a union with an accessor member,
 * an index signature, or anything the checker cannot pin down all answer
 * `false`, so callers keep their conservative syntactic behaviour.
 */
export function isDefinitelyDataPropertyAccess(
  typeAware: TypeAware,
  object: TSESTree.Node,
  propertyName: string
): boolean {
  const { checker } = typeAware;
  const objectType = checker.getNonNullableType(typeAware.getTypeAtLocation(object));

  // Every constituent of a union has to be a plain field: if any branch could
  // be an accessor, the read might invoke one.
  const constituents = objectType.isUnion() ? objectType.types : [objectType];

  for (let i = 0, len = constituents.length; i < len; i++) {
    const constituent = checker.getNonNullableType(constituents[i]);
    if (getBit(constituent.flags, INDETERMINATE_TYPE_FLAGS)) return false;

    const symbol = constituent.getProperty(propertyName);
    // No declared symbol means an index signature, a `Proxy`, or a property the
    // checker cannot see — all of which may run code on access.
    if (symbol == null) return false;
    if (getBit(symbol.flags, ACCESSOR_SYMBOL_FLAGS)) return false;

    const declarations = symbol.getDeclarations();
    if (declarations == null || declarations.length === 0) return false;

    for (let j = 0, declarationsLen = declarations.length; j < declarationsLen; j++) {
      if (!ts.isPropertyDeclaration(declarations[j])
        && !ts.isPropertySignature(declarations[j])
        && !ts.isParameterPropertyDeclaration(declarations[j], declarations[j].parent)
        && !ts.isPropertyAssignment(declarations[j])
        && !ts.isShorthandPropertyAssignment(declarations[j])
        && !ts.isBindingElement(declarations[j])
        && !ts.isEnumMember(declarations[j])
      ) {
        return false;
      }
    }
  }

  return constituents.length > 0;
}
