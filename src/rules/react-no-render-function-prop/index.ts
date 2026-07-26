import { createRule } from '@/utils/create-eslint-rule';
import { getComponentName } from '@/utils/react-hooks';
import type { FunctionNode } from '@/utils/react-hooks';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { appendArrayInPlace } from 'foxts/append-array-in-place';

const JSX_RETURN_TYPE_NAMES = new Set([
  'ReactNode',
  'ReactElement',
  'JSX.Element',
  'Element'
]);

function getPropsTypeMembers(
  node: FunctionNode,
  typeMap: Map<string, TSESTree.TSPropertySignature[]>
): TSESTree.TSPropertySignature[] | null {
  const [propsParam] = node.params;
  if (propsParam == null) return null;

  let typeAnnotation: TSESTree.TypeNode | null = null;

  if ((
    propsParam.type === AST_NODE_TYPES.Identifier
    || propsParam.type === AST_NODE_TYPES.ObjectPattern
  ) && propsParam.typeAnnotation != null) {
    typeAnnotation = propsParam.typeAnnotation.typeAnnotation;
  }

  if (typeAnnotation == null) return null;

  return resolveTypeMembers(typeAnnotation, typeMap);
}

function resolveTypeMembers(
  typeNode: TSESTree.TypeNode,
  typeMap: Map<string, TSESTree.TSPropertySignature[]>
): TSESTree.TSPropertySignature[] | null {
  if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
    return typeNode.members.filter(
      (m): m is TSESTree.TSPropertySignature => m.type === AST_NODE_TYPES.TSPropertySignature
    );
  }

  if (typeNode.type === AST_NODE_TYPES.TSTypeReference && typeNode.typeName.type === AST_NODE_TYPES.Identifier) {
    return typeMap.get(typeNode.typeName.name) ?? null;
  }

  if (typeNode.type === AST_NODE_TYPES.TSIntersectionType) {
    const allMembers: TSESTree.TSPropertySignature[] = [];
    for (const member of typeNode.types) {
      const resolved = resolveTypeMembers(member, typeMap);
      if (resolved != null) {
        appendArrayInPlace(allMembers, resolved);
      }
    }
    return allMembers.length > 0 ? allMembers : null;
  }

  return null;
}

function getReturnTypeName(node: TSESTree.TypeNode): string | null {
  if (
    node.type === AST_NODE_TYPES.TSTypeReference
    && node.typeName.type === AST_NODE_TYPES.TSQualifiedName
    && node.typeName.left.type === AST_NODE_TYPES.Identifier
    && node.typeName.left.name === 'React'
  ) {
    return node.typeName.right.name;
  }

  if (node.type === AST_NODE_TYPES.TSTypeReference && node.typeName.type === AST_NODE_TYPES.Identifier) {
    return node.typeName.name;
  }

  if (
    node.type === AST_NODE_TYPES.TSTypeReference
    && node.typeName.type === AST_NODE_TYPES.TSQualifiedName
    && node.typeName.left.type === AST_NODE_TYPES.Identifier
    && node.typeName.left.name === 'JSX'
    && node.typeName.right.name === 'Element'
  ) {
    return 'JSX.Element';
  }

  return null;
}

function isJsxReturnType(node: TSESTree.TypeNode): boolean {
  const name = getReturnTypeName(node);
  if (name != null && JSX_RETURN_TYPE_NAMES.has(name)) return true;

  if (node.type === AST_NODE_TYPES.TSUnionType) {
    return node.types.some((t) => {
      const n = getReturnTypeName(t);
      return n != null && JSX_RETURN_TYPE_NAMES.has(n);
    });
  }

  return false;
}

/**
 * `null` when the type is not a render function at all. Otherwise whether the
 * render function takes parameters, which decides how it can be refactored:
 * a parameterless one can be replaced by the JSX itself, a parameterized one
 * cannot, since the caller does not have the arguments.
 */
function getRenderFunctionKind(typeNode: TSESTree.TypeNode): 'parameterized' | 'parameterless' | null {
  if (typeNode.type === AST_NODE_TYPES.TSFunctionType && typeNode.returnType != null) {
    if (!isJsxReturnType(typeNode.returnType.typeAnnotation)) return null;
    return typeNode.params.length > 0 ? 'parameterized' : 'parameterless';
  }

  if (typeNode.type === AST_NODE_TYPES.TSUnionType) {
    let kind: 'parameterized' | 'parameterless' | null = null;
    for (const t of typeNode.types) {
      const resolved = getRenderFunctionKind(t);
      if (resolved === 'parameterized') return 'parameterized';
      if (resolved != null) kind = resolved;
    }
    return kind;
  }

  return null;
}

function getPropName(node: TSESTree.TSPropertySignature): string | null {
  if (node.key.type === AST_NODE_TYPES.Identifier) return node.key.name;
  if (node.key.type === AST_NODE_TYPES.Literal && typeof node.key.value === 'string') return node.key.value;
  return null;
}

function collectTypeMembers(node: TSESTree.TSInterfaceBody | TSESTree.TSTypeLiteral): TSESTree.TSPropertySignature[] {
  const members = node.type === AST_NODE_TYPES.TSTypeLiteral ? node.members : node.body;
  return members.filter(
    (m): m is TSESTree.TSPropertySignature => m.type === AST_NODE_TYPES.TSPropertySignature
  );
}

export default createRule({
  name: 'react-no-render-function-prop',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow declaring React component props that accept render functions returning JSX. Prefer hooks and direct rendering.'
    },
    messages: {
      parameterless: 'Prop "{{name}}" is a render function returning JSX, but it takes no arguments, so it has nothing to contribute over the JSX itself. Pass the element instead, e.g. `{{name}}={<Foo />}`, or use `children`.',
      parameterized: 'Prop "{{name}}" is a render function returning JSX. It only exists to hand data back to the caller, which couples this component to how the caller renders. Extract that data into a hook, then let a child component call the hook and render itself, and pass that child in as an element or `children`.'
    },
    schema: []
  },
  create(context) {
    const typeMap = new Map<string, TSESTree.TSPropertySignature[]>();

    function checkComponent(node: FunctionNode) {
      const name = getComponentName(node);
      if (name == null) return;

      const members = getPropsTypeMembers(node, typeMap);
      if (members == null) return;

      for (const member of members) {
        if (member.typeAnnotation == null) continue;

        const kind = getRenderFunctionKind(member.typeAnnotation.typeAnnotation);
        if (kind == null) continue;

        const propName = getPropName(member);
        if (propName == null) continue;

        context.report({
          node: member,
          messageId: kind,
          data: { name: propName }
        });
      }
    }

    return {
      TSInterfaceDeclaration(node) {
        typeMap.set(node.id.name, collectTypeMembers(node.body));
      },
      TSTypeAliasDeclaration(node) {
        const resolved = resolveTypeMembers(node.typeAnnotation, typeMap);
        if (resolved != null) {
          typeMap.set(node.id.name, resolved);
        }
      },
      FunctionDeclaration: checkComponent,
      FunctionExpression: checkComponent,
      ArrowFunctionExpression: checkComponent
    };
  }
});
