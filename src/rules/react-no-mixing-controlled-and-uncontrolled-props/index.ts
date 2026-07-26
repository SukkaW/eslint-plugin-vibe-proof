import { createRule } from '@/utils/create-eslint-rule';
import { AST_NODE_TYPES } from '@typescript-eslint/types';

export type MessageId = 'noMixingControlledAndUncontrolled';

const CONTROLLED_PAIRS: Array<[controlled: string, uncontrolled: string]> = [
  ['value', 'defaultValue'],
  ['checked', 'defaultChecked']
];

export default createRule({
  name: 'react-no-mixing-controlled-and-uncontrolled-props',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow mixing controlled and uncontrolled props on the same element.'
    },
    messages: {
      noMixingControlledAndUncontrolled: '\'{{controlled}}\' and \'{{uncontrolled}}\' should not be used together. Use either controlled or uncontrolled mode, not both.'
    },
    schema: []
  },
  create: (context) => ({
    JSXOpeningElement(node) {
      const props = new Set<string>();
      for (const attr of node.attributes) {
        if (attr.type === AST_NODE_TYPES.JSXSpreadAttribute) continue;
        if (attr.name.type === AST_NODE_TYPES.JSXNamespacedName) continue;
        props.add(attr.name.name);
      }
      for (const [controlled, uncontrolled] of CONTROLLED_PAIRS) {
        if (!props.has(controlled) || !props.has(uncontrolled)) continue;
        const attrNode = node.attributes.find(
          (a) => a.type === AST_NODE_TYPES.JSXAttribute
            && a.name.type !== AST_NODE_TYPES.JSXNamespacedName
            && a.name.name === uncontrolled
        )!;
        context.report({
          node: attrNode,
          messageId: 'noMixingControlledAndUncontrolled',
          data: { controlled, uncontrolled }
        });
      }
    }
  })
});
