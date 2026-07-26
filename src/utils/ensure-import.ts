import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESLint } from '@typescript-eslint/utils';

/**
 * Yield fixes that guarantee `import { name } from 'source'` exists.
 *
 * - Already imported → yields nothing.
 * - An import from `source` exists → merges the specifier into it.
 * - Otherwise → inserts a fresh import line after the last import
 *   (or before the first statement).
 *
 * Stateless by design: it inspects the AST on every call. When several fixes
 * in one lint pass insert the same import, the overlapping fixes are dropped
 * by ESLint and re-applied on the next pass, which then merges cleanly.
 */
export function *ensureNamedImport(
  fixer: TSESLint.RuleFixer,
  sourceCode: TSESLint.SourceCode,
  source: string,
  name: string
): Generator<TSESLint.RuleFix> {
  const imports = sourceCode.ast.body.filter((s) => s.type === AST_NODE_TYPES.ImportDeclaration);
  // Short circuit: if the module specifier never appears in the file text,
  // there is nothing to merge with — jump straight to inserting
  const existing = sourceCode.text.includes(source)
    ? imports.find((d) => d.source.value === source)
    : undefined;

  if (existing != null) {
    const specifiers = existing.specifiers.filter((s) => s.type === AST_NODE_TYPES.ImportSpecifier);
    if (specifiers.some((s) => s.local.name === name)) return;

    const lastSpecifier = specifiers.at(-1);
    if (lastSpecifier != null) {
      yield fixer.insertTextAfter(lastSpecifier, `, ${name}`);
      return;
    }
  }

  const importText = `import { ${name} } from '${source}';\n`;
  const lastImport = imports.at(-1);
  if (lastImport == null) {
    yield fixer.insertTextBefore(sourceCode.ast.body[0], importText);
  } else {
    yield fixer.insertTextAfter(lastImport, '\n' + importText);
  }
}
