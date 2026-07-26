import type { Linter } from 'eslint';

const plugin = {
  configs: {
    recommended: {
      name: 'eslint-plugin-vibe-proof/recommended',
      plugins: {
        get 'vibe-proof'() {
          return plugin;
        }
      },
      rules: {

      } as Linter.RulesRecord
    }
  },
  rules: {}
} as const;

export default plugin;
export { plugin as eslint_plugin_vibe_proof };

import { createRule, isParserWithTypeInformation, ensureParserWithTypeInformation } from '@/utils/create-eslint-rule';

export { createRule, isParserWithTypeInformation, ensureParserWithTypeInformation };
export type { RuleModule, ExportedRuleModule } from '@/utils/create-eslint-rule';

if (typeof module !== 'undefined' && module.exports) {
  module.exports = plugin;
  Object.assign(module.exports, {
    default: plugin,
    createRule,
    isParserWithTypeInformation,
    ensureParserWithTypeInformation,
    eslint_plugin_vibe_proof: plugin
  });
}
