import type { RuleContext } from '@/utils/create-eslint-rule';
import { walkNodes } from '@/utils/ast';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { TSESLint, ASTUtils } from '@typescript-eslint/utils';

// --- Scope helpers ---

export function *getAllScopeRefs(
  scope: TSESLint.Scope.Scope
): Generator<TSESLint.Scope.Reference> {
  const stack: TSESLint.Scope.Scope[] = [scope];
  while (stack.length > 0) {
    const current = stack.pop()!;
    yield *current.references;
    for (let i = current.childScopes.length - 1; i >= 0; i--) {
      stack.push(current.childScopes[i]);
    }
  }
}

export function resolveToArrayExpression(
  context: RuleContext<string, unknown[]>,
  node: TSESTree.Node
): TSESTree.ArrayExpression | null {
  if (node.type === AST_NODE_TYPES.ArrayExpression) return node;
  if (node.type !== AST_NODE_TYPES.Identifier) return null;

  let current: TSESTree.Identifier = node;
  for (;;) {
    const scope = context.sourceCode.getScope(current);
    const variable = ASTUtils.findVariable(scope, current.name);
    if (variable == null) return null;
    const def = variable.defs[0];
    if (def.type !== TSESLint.Scope.DefinitionType.Variable || def.node.init == null) return null;
    if (def.node.init.type === AST_NODE_TYPES.ArrayExpression) return def.node.init;
    if (def.node.init.type === AST_NODE_TYPES.Identifier) {
      current = def.node.init;
      continue;
    }
    return null;
  }
}

// --- Type aliases ---

export type FunctionNode = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

// --- Naming conventions ---

// 'A'(65) through 'Z'(90)
export function isComponentName(name: string): boolean {
  const firstChar = name.codePointAt(0);
  return firstChar != null && firstChar >= 65 && firstChar <= 90;
}

export function isHookName(name: string): boolean {
  if (name === 'use') return true;
  if (!name.startsWith('use')) return false;
  // 'A'(65) through 'Z'(90): use followed by uppercase letter
  const ch = name.codePointAt(3);
  return ch != null && ch >= 65 && ch <= 90;
}

export function isComponentOrHookName(name: string): boolean {
  return isComponentName(name) || isHookName(name);
}

const WRAPPER_COMPONENT_NAMES = new Set(['memo', 'forwardRef']);

export function isWrapperComponentCall(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return WRAPPER_COMPONENT_NAMES.has(callee.name);
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression
    && callee.object.type === AST_NODE_TYPES.Identifier
    && callee.object.name === 'React'
    && callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return WRAPPER_COMPONENT_NAMES.has(callee.property.name);
  }
  return false;
}

// --- Component detection ---

export function getWrapperComponentName(callExpr: TSESTree.CallExpression): string | null {
  if (!isWrapperComponentCall(callExpr)) return null;

  const parent = callExpr.parent;
  if (
    parent.type === AST_NODE_TYPES.VariableDeclarator
    && parent.id.type === AST_NODE_TYPES.Identifier
    && isComponentName(parent.id.name)
  ) {
    return parent.id.name;
  }

  if (parent.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
    return 'default';
  }

  return null;
}

export function getComponentName(node: FunctionNode): string | null {
  if (node.type === AST_NODE_TYPES.FunctionDeclaration && node.id != null) {
    return isComponentName(node.id.name) ? node.id.name : null;
  }

  if (node.type === AST_NODE_TYPES.FunctionExpression && node.id != null && isComponentName(node.id.name)) {
    return node.id.name;
  }

  const parent = node.parent;

  if (
    parent.type === AST_NODE_TYPES.VariableDeclarator
    && parent.id.type === AST_NODE_TYPES.Identifier
    && isComponentName(parent.id.name)
  ) {
    return parent.id.name;
  }

  if (
    parent.type === AST_NODE_TYPES.CallExpression
    && parent.arguments[0] === node
  ) {
    return getWrapperComponentName(parent);
  }

  if (parent.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
    return 'default';
  }

  return null;
}

// --- AST helpers ---
const isUseEffectNames = (name: string) => name.startsWith('use') && name.endsWith('Effect');

export function isUseEffectCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) return isUseEffectNames(callee.name);
  if (
    callee.type === AST_NODE_TYPES.MemberExpression
    && callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return isUseEffectNames(callee.property.name);
  }
  return false;
}

const isUseStateLikeNames = (name: string) => name.startsWith('use') && name.endsWith('State');
export function isUseStateLikeCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) return isUseStateLikeNames(callee.name);
  if (
    callee.type === AST_NODE_TYPES.MemberExpression
    && callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return isUseStateLikeNames(callee.property.name);
  }
  return false;
}

export function isUseStateCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) return callee.name === 'useState';
  if (
    callee.type === AST_NODE_TYPES.MemberExpression
    && callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name === 'useState';
  }
  return false;
}

export function getHookCalleeName(node: TSESTree.CallExpression): string | null {
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) return callee.name;
  if (
    callee.type === AST_NODE_TYPES.MemberExpression
    && callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name;
  }
  return null;
}

// Any `useXxx(...)` / `React.useXxx(...)` call
export function isHookCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;
  return getHookCalleeName(node)?.startsWith('use') === true;
}

// Whether the function is (named like) a React component or a custom hook
export function isComponentOrHookFunction(node: FunctionNode): boolean {
  // Components, incl. memo/forwardRef wrappers and export default
  if (getComponentName(node) != null) return true;

  let name: string | null = null;
  if (
    (node.type === AST_NODE_TYPES.FunctionDeclaration || node.type === AST_NODE_TYPES.FunctionExpression)
    && node.id != null
  ) {
    name = node.id.name;
  } else if (
    node.parent.type === AST_NODE_TYPES.VariableDeclarator
    && node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    name = node.parent.id.name;
  }
  return name != null && isHookName(name);
}

// a setXxx name (state setter / store action by convention)
const RE_SETTER_NAME = /^set[A-Z]/;

// Whether `id` names a value that is "reactive origin" — it comes from a hook
// return, or is a prop/argument of a component or custom hook (which in turn is
// almost always a hook return passed down from a parent), or is derived from
// such a value (e.g. `const store = storeFor(editor)` where `editor` is a hook
// return). Such values carry the same staleness/identity concerns as state.
function isReactiveOriginIdentifier(
  sourceCode: TSESLint.SourceCode,
  id: TSESTree.Identifier,
  visited = new Set<TSESLint.Scope.Variable>()
): boolean {
  const variable = ASTUtils.findVariable(sourceCode.getScope(id), id.name);
  if (variable == null || visited.has(variable)) return false;
  visited.add(variable);

  const def = variable.defs.at(0);
  if (def == null) return false;

  // Prop / custom-hook argument
  if (def.type === TSESLint.Scope.DefinitionType.Parameter) {
    return ASTUtils.isFunction(def.node) && isComponentOrHookFunction(def.node);
  }

  if (def.type !== TSESLint.Scope.DefinitionType.Variable || def.node.init == null) return false;

  // Directly a hook return
  if (isHookCall(def.node.init)) return true;

  // Derived from a reactive origin — any identifier referenced in the
  // initializer that is itself a reactive origin makes this one too.
  let derived = false;
  walkNodes(def.node.init, sourceCode.visitorKeys, (n) => {
    if (derived) return false;
    // don't descend into nested functions — those are their own scope
    if (n !== def.node.init && ASTUtils.isFunction(n)) return false;
    if (n.type === AST_NODE_TYPES.Identifier && n.name !== id.name && isReactiveOriginIdentifier(sourceCode, n, visited)) {
      derived = true;
      return false;
    }
  });
  return derived;
}

/**
 * Whether `node` (a call's callee) is a state setter. A setter is a `set*`-named
 * function reached from a reactive origin (a hook return, or a prop passed down
 * from a parent — which is itself typically a hook return):
 * - `const setValue = useX(...)` / `const [v, setValue] = useX(...)` / `{ setValue }`
 * - `setValue` received as a prop: `function C({ setValue }) { setValue(...) }`
 * - `store.setValue(...)` where `store` is a hook return or prop
 */
export function isSetStateCallee(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node
): boolean {
  // `obj.setXxx(...)` — a setter method on a reactive-origin object
  if (
    node.type === AST_NODE_TYPES.MemberExpression
    && !node.computed
    && node.property.type === AST_NODE_TYPES.Identifier
    && RE_SETTER_NAME.test(node.property.name)
    && node.object.type === AST_NODE_TYPES.Identifier
  ) {
    return isReactiveOriginIdentifier(sourceCode, node.object);
  }

  // `setXxx(...)` — a setter identifier
  if (node.type !== AST_NODE_TYPES.Identifier) return false;
  if (!RE_SETTER_NAME.test(node.name)) return false;

  return isReactiveOriginIdentifier(sourceCode, node);
}

export function findParentNode(
  node: TSESTree.Node,
  predicate: (n: TSESTree.Node) => boolean
): TSESTree.Node | null {
  let current = node.parent ?? null;
  while (current != null) {
    if (predicate(current)) return current;
    current = current.parent ?? null;
  }
  return null;
}

export type EffectCallback = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;

export function isRangeInside(range: TSESTree.Range, outer: TSESTree.Range) {
  return outer[0] <= range[0] && range[1] <= outer[1];
}

export function getEffectCallback(node: TSESTree.CallExpression): EffectCallback | null {
  return node.arguments.length > 0 && ASTUtils.isFunction(node.arguments[0])
    ? node.arguments[0]
    : null;
}

export function getNearestFunctionAncestor(node: TSESTree.Node): FunctionNode | null {
  let current = node.parent ?? null;
  while (current != null) {
    if (ASTUtils.isFunction(current)) return current;
    current = current.parent ?? null;
  }
  return null;
}
