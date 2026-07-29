import { createRule } from '@/utils/create-eslint-rule';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';

const RE_NON_NEGATIVE_INT = /^(?:0|[1-9]\d*)$/;
const RE_VALID_IDENTIFIER = /^[a-z_$][\w$]*$/i;

// Beyond this, an array pattern would need too many holes — use an object pattern
// with numeric keys instead: `const { 20: foo } = arr`
const MAX_ARRAY_PATTERN_INDEX = 10;

function renderPattern(reads: Array<{ key: string, name: string }>): string {
  const allInt = reads.every((r) => RE_NON_NEGATIVE_INT.test(r.key));
  const hasDuplicate = new Set(reads.map((r) => r.key)).size !== reads.length;
  const maxIndex = allInt ? Math.max(...reads.map((r) => Number(r.key))) : 0;

  if (allInt && !hasDuplicate && maxIndex <= MAX_ARRAY_PATTERN_INDEX) {
    const indexToName = new Map(reads.map((r) => [Number(r.key), r.name]));
    const elements: string[] = [];
    for (let i = 0; i <= maxIndex; i++) {
      elements.push(indexToName.get(i) ?? '');
    }
    return `[${elements.join(', ')}]`;
  }

  const properties = reads.map(({ key, name }) => {
    if (key === name) return name;
    if (RE_VALID_IDENTIFIER.test(key) || RE_NON_NEGATIVE_INT.test(key)) return `${key}: ${name}`;
    return `${JSON.stringify(key)}: ${name}`;
  });
  return `{ ${properties.join(', ')} }`;
}

// Note: `export const [a, b] = ...` is incompatible with TypeScript's
// `isolatedDeclarations`. Disable this rule if you use that compiler option.
export default createRule({
  name: 'prefer-export-destructuring',
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description: 'Prefer exporting destructured bindings directly (`export const [a, b] = value` / `export const { a, b } = value`) over assigning to a temporary variable and exporting its elements one by one.'
    },
    messages: {
      default: 'Destructure directly in the export instead: `export const {{pattern}} = ...`.'
    },
    schema: []
  },
  create(context) {
    return {
      'Program > VariableDeclaration[kind="const"] > VariableDeclarator': (node: TSESTree.VariableDeclarator) => {
        if (node.id.type !== AST_NODE_TYPES.Identifier) return;
        if (node.init == null) return;
        // The temporary itself must not be exported
        if (node.parent.parent.type === AST_NODE_TYPES.ExportNamedDeclaration) return;

        const variable = ASTUtils.findVariable(context.sourceCode.getScope(node.id), node.id.name);
        if (variable == null) return;

        const readRefs = variable.references.filter((ref) => ref.isRead());
        if (readRefs.length === 0) return;

        const reads: Array<{ key: string, name: string }> = [];
        const readDeclarators = new Set<TSESTree.VariableDeclarator>();
        const exportStatements = new Set<TSESTree.ExportNamedDeclaration>();

        for (let i = 0, len = readRefs.length; i < len; i++) {
          const ref = readRefs[i];
          const id = ref.identifier;

          // Every read must be a static-key member access: tmp[0], tmp.prop, tmp['prop']
          const member = id.parent;
          if (member.type !== AST_NODE_TYPES.MemberExpression || member.object !== id) return;

          let key: string;
          if (!member.computed && member.property.type === AST_NODE_TYPES.Identifier) {
            key = member.property.name;
          } else if (
            member.computed
            && member.property.type === AST_NODE_TYPES.Literal
            && (typeof member.property.value === 'string' || typeof member.property.value === 'number')
          ) {
            key = String(member.property.value);
          } else {
            return;
          }

          // ... and used as the sole initializer of `export const X = tmp[key]`
          const declarator = member.parent;
          if (
            declarator.type !== AST_NODE_TYPES.VariableDeclarator
            || declarator.init !== member
            || declarator.id.type !== AST_NODE_TYPES.Identifier
          ) return;
          const declaration = declarator.parent;
          if (
            declaration.kind !== 'const'
            || declaration.parent.type !== AST_NODE_TYPES.ExportNamedDeclaration
          ) return;

          reads.push({ key, name: declarator.id.name });
          readDeclarators.add(declarator);
          exportStatements.add(declaration.parent);
        }

        const declarationNode = node.parent;
        const program = declarationNode.parent as TSESTree.Program;

        // The fix moves the member reads up to the temp's position, so nothing
        // may sit between the declaration and the exports — an intervening
        // statement could mutate the object through another alias
        const declarationIndex = program.body.indexOf(declarationNode);
        const exportIndices = [...exportStatements]
          .map((statement) => program.body.indexOf(statement))
          .sort((a, b) => a - b);
        const contiguous = exportIndices.every((exportIndex, i) => exportIndex === declarationIndex + 1 + i);
        const lastExportEnd = Math.max(...[...exportStatements].map((statement) => statement.range[1]));
        const hasCommentsInFixRange = context.sourceCode.getAllComments().some((comment) => (
          comment.range[0] >= declarationNode.range[0]
          && comment.range[1] <= lastExportEnd
        ));

        const canFix = contiguous
          // the temp must be the statement's only declarator, and every removed
          // export must contain only declarators absorbed into the pattern
          && declarationNode.declarations.length === 1
          // Reconstructing either side would discard type annotations or comments.
          && node.id.typeAnnotation == null
          && !hasCommentsInFixRange
          && [...exportStatements].every((statement) => (
            statement.declaration?.type === AST_NODE_TYPES.VariableDeclaration
            && statement.declaration.declarations.every((d) => (
              readDeclarators.has(d)
              && d.id.type === AST_NODE_TYPES.Identifier
              && d.id.typeAnnotation == null
            ))
          ));

        context.report({
          node,
          messageId: 'default',
          data: { pattern: renderPattern(reads) },
          fix: canFix
            ? (fixer) => {
              const { text } = context.sourceCode;
              const equalsToken = context.sourceCode.getTokenAfter(node.id);
              if (equalsToken?.value !== '=') return null;
              const initializerText = text.slice(equalsToken.range[1], node.range[1]).trim();
              const fixes = [
                fixer.replaceText(
                  declarationNode,
                  `export const ${renderPattern(reads)} = ${initializerText};`
                )
              ];

              for (const statement of exportStatements) {
                // eat the preceding indentation and line break along with the statement
                let start = statement.range[0];
                while (start > 0 && (text[start - 1] === ' ' || text[start - 1] === '\t')) start--;
                if (start > 0 && text[start - 1] === '\n') start--;
                if (start > 0 && text[start - 1] === '\r') start--;
                fixes.push(fixer.removeRange([start, statement.range[1]]));
              }

              return fixes;
            }
            : null
        });
      }
    };
  }
});
