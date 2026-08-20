import type { ESLint, Rule } from 'eslint';

// common
import ban_eslint_disable from './rules/ban-eslint-disable';
import no_chain_array_higher_order_functions from './rules/no-chain-array-higher-order-functions';
import no_constant_array_includes from './rules/no-constant-array-includes';
import no_eager_await_in_condition from './rules/no-eager-await-in-condition';
import prefer_array_reduce_to_object from './rules/prefer-array-reduce-to-object';
import prefer_export_destructuring from './rules/prefer-export-destructuring';
import prefer_hoisted_regex from './rules/prefer-hoisted-regex';
import prefer_array_at_for_last_item from './rules/prefer-array-at-for-last-item';
import prefer_array_from_mapper from './rules/prefer-array-from-mapper';
import prefer_string_code_point_operations from './rules/prefer-string-code-point-operations';
import prefer_array_some from './rules/prefer-array-some';
import prefer_timer_args from './rules/prefer-timer-args';
import prefer_static_collator from './rules/prefer-static-collator';
import prefer_throw_if_no_entry from './rules/prefer-throw-if-no-entry';

// common (requires type information)
import prefer_indexed_array_loop from './rules/prefer-indexed-array-loop';
import no_indexof_equality from './rules/no-indexof-equality';

// jsx
import jsx_no_duplicate_props from './rules/jsx-no-duplicate-props';
import jsx_no_explicit_spread_props from './rules/jsx-no-explicit-spread-props';

// react
import no_location_assign_relative_destination from './rules/no-location-assign-relative-destination';
import react_ban_peak_via_ref from './rules/react-ban-peak-via-ref';
import react_detect_potential_race_condition from './rules/react-detect-potential-race-condition';
import react_no_circular_effect from './rules/react-no-circular-effect';
import react_no_manual_use_effect_race_condition_prevention from './rules/react-no-manual-use-effect-race-condition-prevention';
import react_no_mixing_controlled_and_uncontrolled_props from './rules/react-no-mixing-controlled-and-uncontrolled-props';
import react_no_performance_impacting_array_find from './rules/react-no-performance-impacting-array-find';
import react_no_render_function_prop from './rules/react-no-render-function-prop';
import react_no_unnecessary_use_callback from './rules/react-no-unnecessary-use-callback';
import react_no_unnecessary_use_memo from './rules/react-no-unnecessary-use-memo';
import react_no_use_effect_watching from './rules/react-no-use-effect-watching';
import react_no_use_state_as_ref from './rules/react-no-use-state-as-ref';
import react_no_useless_components from './rules/react-no-useless-components';
import react_prefer_props_with_children from './rules/react-prefer-props-with-children';
import react_prefer_state_updater_function from './rules/react-prefer-state-updater-function';

// react + foxact
import react_prefer_foxact_compose_context_provider from './rules/react-prefer-foxact-compose-context-provider';
import react_prefer_foxact_persistent from './rules/react-prefer-foxact-persistent';
import react_prefer_foxact_use_abortable_effect from './rules/react-prefer-foxact-use-abortable-effect';
import react_prefer_foxact_use_clipboard from './rules/react-prefer-foxact-use-clipboard';
import react_prefer_foxact_use_media_query from './rules/react-prefer-foxact-use-media-query';

const plugin: ESLint.Plugin = {
  configs: {
    common: {
      name: 'eslint-plugin-vibe-proof/common',
      plugins: {
        get 'vibe-proof'() {
          return plugin;
        }
      },
      rules: {
        'vibe-proof/ban-eslint-disable': 'error',
        'vibe-proof/no-chain-array-higher-order-functions': 'error',
        'vibe-proof/no-constant-array-includes': 'error',
        'vibe-proof/no-eager-await-in-condition': 'error',
        'vibe-proof/prefer-array-reduce-to-object': 'error',
        'vibe-proof/prefer-export-destructuring': 'error',
        'vibe-proof/prefer-hoisted-regex': 'error',
        'vibe-proof/prefer-array-at-for-last-item': 'error',
        'vibe-proof/prefer-array-from-mapper': 'error',
        'vibe-proof/prefer-string-code-point-operations': 'error',
        'vibe-proof/prefer-array-some': 'error',
        'vibe-proof/prefer-timer-args': 'error',
        'vibe-proof/prefer-static-collator': 'error',
        'vibe-proof/prefer-throw-if-no-entry': 'error'
      }
    },
    /** Rules that need typescript-eslint type information. */
    common_type_checked: {
      name: 'eslint-plugin-vibe-proof/common_type_checked',
      plugins: {
        get 'vibe-proof'() {
          return plugin;
        }
      },
      rules: {
        'vibe-proof/prefer-indexed-array-loop': 'error',
        'vibe-proof/no-indexof-equality': 'error'
      }
    },
    react: {
      name: 'eslint-plugin-vibe-proof/react',
      plugins: {
        get 'vibe-proof'() {
          return plugin;
        }
      },
      rules: {
        'vibe-proof/jsx-no-duplicate-props': 'error',
        'vibe-proof/jsx-no-explicit-spread-props': 'error',

        'vibe-proof/no-location-assign-relative-destination': 'error',
        'vibe-proof/react-ban-peak-via-ref': 'error',
        'vibe-proof/react-detect-potential-race-condition': 'error',
        'vibe-proof/react-no-circular-effect': 'error',
        'vibe-proof/react-no-manual-use-effect-race-condition-prevention': 'error',
        'vibe-proof/react-no-mixing-controlled-and-uncontrolled-props': 'error',
        'vibe-proof/react-no-performance-impacting-array-find': 'error',
        'vibe-proof/react-no-render-function-prop': 'error',
        'vibe-proof/react-no-unnecessary-use-callback': 'error',
        'vibe-proof/react-no-unnecessary-use-memo': 'error',
        'vibe-proof/react-no-use-effect-watching': 'error',
        'vibe-proof/react-no-use-state-as-ref': 'error',
        'vibe-proof/react-no-useless-components': 'error',
        'vibe-proof/react-prefer-props-with-children': 'error',
        'vibe-proof/react-prefer-state-updater-function': 'error',

        'vibe-proof/react-prefer-foxact-compose-context-provider': 'error',
        'vibe-proof/react-prefer-foxact-persistent': 'error',
        'vibe-proof/react-prefer-foxact-use-abortable-effect': 'warn',
        'vibe-proof/react-prefer-foxact-use-clipboard': 'error',
        'vibe-proof/react-prefer-foxact-use-media-query': 'error'
      }
    },
    /** React counterpart of {@link common_type_checked}. Empty for now. */
    react_type_checked: {
      name: 'eslint-plugin-vibe-proof/react_type_checked',
      plugins: {
        get 'vibe-proof'() {
          return plugin;
        }
      },
      rules: {}
    }
  },
  // eslint-disable-next-line sukka/type/no-force-cast-via-top-type -- fuck eslint types and typescript-eslint
  rules: {
    // common
    'ban-eslint-disable': ban_eslint_disable,
    'no-chain-array-higher-order-functions': no_chain_array_higher_order_functions,
    'no-constant-array-includes': no_constant_array_includes,
    'no-eager-await-in-condition': no_eager_await_in_condition,
    'prefer-array-reduce-to-object': prefer_array_reduce_to_object,
    'prefer-export-destructuring': prefer_export_destructuring,
    'prefer-hoisted-regex': prefer_hoisted_regex,
    'prefer-array-at-for-last-item': prefer_array_at_for_last_item,
    'prefer-array-from-mapper': prefer_array_from_mapper,
    'prefer-string-code-point-operations': prefer_string_code_point_operations,
    'prefer-array-some': prefer_array_some,
    'prefer-timer-args': prefer_timer_args,
    'prefer-static-collator': prefer_static_collator,
    'prefer-throw-if-no-entry': prefer_throw_if_no_entry,

    // common (requires type information)
    'prefer-indexed-array-loop': prefer_indexed_array_loop,
    'no-indexof-equality': no_indexof_equality,

    // jsx
    'jsx-no-duplicate-props': jsx_no_duplicate_props,
    'jsx-no-explicit-spread-props': jsx_no_explicit_spread_props,

    // react
    'no-location-assign-relative-destination': no_location_assign_relative_destination,
    'react-ban-peak-via-ref': react_ban_peak_via_ref,
    'react-detect-potential-race-condition': react_detect_potential_race_condition,
    'react-no-circular-effect': react_no_circular_effect,
    'react-no-manual-use-effect-race-condition-prevention': react_no_manual_use_effect_race_condition_prevention,
    'react-no-mixing-controlled-and-uncontrolled-props': react_no_mixing_controlled_and_uncontrolled_props,
    'react-no-performance-impacting-array-find': react_no_performance_impacting_array_find,
    'react-no-render-function-prop': react_no_render_function_prop,
    'react-no-unnecessary-use-callback': react_no_unnecessary_use_callback,
    'react-no-unnecessary-use-memo': react_no_unnecessary_use_memo,
    'react-no-use-effect-watching': react_no_use_effect_watching,
    'react-no-use-state-as-ref': react_no_use_state_as_ref,
    'react-no-useless-components': react_no_useless_components,
    'react-prefer-props-with-children': react_prefer_props_with_children,
    'react-prefer-state-updater-function': react_prefer_state_updater_function,

    // react + foxact
    'react-prefer-foxact-compose-context-provider': react_prefer_foxact_compose_context_provider,
    'react-prefer-foxact-persistent': react_prefer_foxact_persistent,
    'react-prefer-foxact-use-abortable-effect': react_prefer_foxact_use_abortable_effect,
    'react-prefer-foxact-use-clipboard': react_prefer_foxact_use_clipboard,
    'react-prefer-foxact-use-media-query': react_prefer_foxact_use_media_query
  } as unknown as Record<string, Rule.RuleModule>
};

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
