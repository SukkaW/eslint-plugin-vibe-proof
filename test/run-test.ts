import path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';
import type { InvalidTestCase, ValidTestCase, TestCaseError } from '@typescript-eslint/rule-tester';

import type { ExportedRuleModule } from '@/utils/create-eslint-rule';
import { after, describe, it } from 'mocha';
import type { TSESLint } from '@typescript-eslint/utils';
import { noop } from 'foxts/noop';

RuleTester.afterAll = after;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.itSkip = it.skip;
RuleTester.describe = describe;
RuleTester.describeSkip = describe.skip;

const $tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    parserOptions: {
      ecmaFeatures: { jsx: true },
      projectService: true,
      tsconfigRootDir: path.join(__dirname, 'fixtures'),
      warnOnUnsupportedTypeScriptVersion: false
    },
    globals: {
      document: 'readonly',
      window: 'readonly',
      globalThis: 'readonly',
      self: 'readonly',
      location: 'readonly'
    }
  },
  linterOptions: {
    reportUnusedDisableDirectives: false
  }
});

interface InvalidTestCaseWithNumberFormOfErrors<TMessageIds extends string, TOptions extends readonly unknown[]> extends Omit<InvalidTestCase<TMessageIds, TOptions>, 'errors'> {
  errors: number | ReadonlyArray<TestCaseError<TMessageIds>>
}

interface RunOptions<TOptions extends readonly unknown[], TMessageIds extends string> {
  module: ExportedRuleModule<TOptions, TMessageIds>,
  valid: Array<string | ValidTestCase<TOptions>>,
  invalid: Array<InvalidTestCaseWithNumberFormOfErrors<TMessageIds, TOptions>>
}

function runTest<TOptions extends readonly unknown[], TMessageIds extends string>(
  { module: mod, valid, invalid }: RunOptions<TOptions, TMessageIds>,
  extraRules?: Record<string, TSESLint.AnyRuleModule>,
  withTypedLinting = true
) {
  const tester = extraRules
    ? (() => {
      const tester = new RuleTester({
        languageOptions: {
          ecmaVersion: 'latest',
          parserOptions: {
            ecmaFeatures: { jsx: true },
            project: withTypedLinting ? 'tsconfig.json' : undefined,
            tsconfigRootDir: path.join(__dirname, 'fixtures'),
            warnOnUnsupportedTypeScriptVersion: false
          },
          globals: {
            document: 'readonly',
            window: 'readonly',
            globalThis: 'readonly',
            self: 'readonly',
            location: 'readonly'
          }
        },
        linterOptions: {
          reportUnusedDisableDirectives: false
        }
      });

      Object.entries(extraRules).forEach(([name, rule]) => tester.defineRule(name, rule));

      return tester;
    })()
    : $tester;

  // eslint-disable-next-line sukka/type/no-force-cast-via-top-type -- mismatch between me and typescript-eslint
  tester.run(mod.name, mod as unknown as TSESLint.RuleModule<TMessageIds, TOptions>, {
    valid: valid.flat().map((item, index) => {
      if (typeof item === 'string') {
        return item;
      }

      return {
        ...item,
        name: `${item.name || 'valid'} #${index}`
      };
    }),
    invalid: invalid.flat().map((item, index) => ({
      ...item,
      name: `${item.name || 'invalid'} #${index}`
    })) as Array<InvalidTestCase<TMessageIds, TOptions>>
  });
}

export { runTest };

runTest.skip = noop as <TOptions extends readonly unknown[], TMessageIds extends string>(
  _args: RunOptions<TOptions, TMessageIds>
) => void;
