import mod from '.';
import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';

runTest({
  module: mod,
  valid: [
    'String.fromCharCode(65)',
    'String.fromCharCode(0xD83D, 0xDE00)',
    'String.fromCodePoint(0x10000)',
    'String.fromCodePoint(0x1F600)',
    'String.fromCodePoint(65, 0x1F600)',
    'String.fromCodePoint(value)',
    'String.fromCodePoint(getCode())',
    'String.fromCodePoint(65, value)',
    'String.fromCodePoint()',
    'String.fromCodePoint(...codes)',
    'String.fromCodePoint(-1)',
    'String.fromCodePoint(1.5)',
    'String.fromCharCode(-1)',
    'String.fromCharCode(0x110000)',
    'fromCodePoint(65)',
    'object.fromCodePoint(65)',
    'String["fromCodePoint"](65)',
    'String.fromCodePoint?.(65)',
    'text.charCodeAt(0)',
    'text.codePointAt(0)',
    'text.charCodeAt(0) === 65',
    'text.codePointAt(0) === 0x1F600',
    'text.codePointAt(0) === 0xD800',
    'text["charCodeAt"](0) === 0x1F600',
    dedent`
      function example(String) {
        return String.fromCodePoint(65);
      }
    `,
    dedent`
      function example(String) {
        return String.fromCharCode(0x1F600);
      }
    `
  ],
  invalid: [
    {
      code: 'const ascii = 64 + 1; String.fromCodePoint(ascii)',
      output: 'const ascii = 64 + 1; String.fromCharCode(ascii)',
      errors: [{ messageId: 'preferFromCharCode' }]
    },
    {
      code: 'const emoji = 0x1F000 + 0x600; String.fromCharCode(emoji)',
      output: 'const emoji = 0x1F000 + 0x600; String.fromCodePoint(emoji)',
      errors: [{ messageId: 'preferFromCodePoint' }]
    },
    {
      code: 'const emoji = 0x1F600; text.charCodeAt(0) === emoji',
      output: 'const emoji = 0x1F600; text.codePointAt(0) === emoji',
      errors: [{ messageId: 'preferCodePointAt' }]
    },
    {
      code: 'String.fromCodePoint(65)',
      output: 'String.fromCharCode(65)',
      errors: [{ messageId: 'preferFromCharCode' }]
    },
    {
      code: 'String.fromCodePoint(0)',
      output: 'String.fromCharCode(0)',
      errors: [{ messageId: 'preferFromCharCode' }]
    },
    {
      code: 'String.fromCodePoint(0xFFFF)',
      output: 'String.fromCharCode(0xFFFF)',
      errors: [{ messageId: 'preferFromCharCode' }]
    },
    {
      code: 'String.fromCodePoint(72, 105, 33)',
      output: 'String.fromCharCode(72, 105, 33)',
      errors: [{ messageId: 'preferFromCharCode' }]
    },
    {
      code: 'String.fromCharCode(0x1F600)',
      output: 'String.fromCodePoint(0x1F600)',
      errors: [{ messageId: 'preferFromCodePoint' }]
    },
    {
      code: 'String.fromCharCode(65, 0x10000)',
      output: 'String.fromCodePoint(65, 0x10000)',
      errors: [{ messageId: 'preferFromCodePoint' }]
    },
    {
      code: 'String.fromCharCode(value, 0x1F600)',
      output: null,
      errors: [{ messageId: 'preferFromCodePoint' }]
    },
    {
      code: 'text.codePointAt(0) === 65',
      output: 'text.charCodeAt(0) === 65',
      errors: [{ messageId: 'preferCharCodeAt' }]
    },
    {
      code: '0xFFFF !== text.codePointAt(index)',
      output: '0xFFFF !== text.charCodeAt(index)',
      errors: [{ messageId: 'preferCharCodeAt' }]
    },
    {
      code: 'text.charCodeAt(0) === 0x1F600',
      output: 'text.codePointAt(0) === 0x1F600',
      errors: [{ messageId: 'preferCodePointAt' }]
    },
    {
      code: '0x10FFFF !== text.charCodeAt(index)',
      output: '0x10FFFF !== text.codePointAt(index)',
      errors: [{ messageId: 'preferCodePointAt' }]
    },
    {
      code: 'String.fromCodePoint(text.charCodeAt(0))',
      output: null,
      errors: [{ messageId: 'preferCodePointAtForFromCodePoint' }]
    }
  ]
}, {}, false);

runTest({
  module: mod,
  valid: [
    dedent`
      declare const custom: { charCodeAt(index: number): number };
      custom.charCodeAt(0) === 0x1F600;
    `,
    dedent`
      declare const custom: { codePointAt(index: number): number };
      custom.codePointAt(0) === 65;
    `
  ],
  invalid: [
    {
      code: dedent`
        declare const text: string;
        text.charCodeAt(0) === 0x1F600;
      `,
      output: dedent`
        declare const text: string;
        text.codePointAt(0) === 0x1F600;
      `,
      errors: [{ messageId: 'preferCodePointAt' }]
    },
    {
      code: dedent`
        declare const text: string;
        text.codePointAt(0) === 65;
      `,
      output: dedent`
        declare const text: string;
        text.charCodeAt(0) === 65;
      `,
      errors: [{ messageId: 'preferCharCodeAt' }]
    }
  ]
});
