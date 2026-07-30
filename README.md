# eslint-plugin-vibe-proof

You just can't really teach coding agents how to write the correct code using agent skills. The more agent skills you install, the faster models fill up the context window, and the faster your coding agents become stupid.

![LLM when the context window usage hit 60%: wojak trying to put a square block into a round hole meme](https://img.skk.moe/gh/eslint-plugin-vibe-proof-meme.jpg)

And LLM is very good at forgetting things. Given a long last coding session and enough conversation compaction, your coding agents can and will eventually forget the important things like agent skills you installed, and even your `AGENTS.md`.

What you really need is a deterministic and unforgiving feedback loop for your coding agents. Unit tests and static analysis are exactly that. When your coding agents poop your bed, linter will not forgive, linter will not forget, linter will not yield, linter will not be constrained by the context window, linter will always detect and spit out the errors.

That's what `eslint-plugin-vibe-proof` is trying to accomplish here. It will detect the most common coding agents' mistakes and bad patterns, enforce LLM to write the correct code.

## Installation

```bash
pnpm add eslint-plugin-vibe-proof
yarn add eslint-plugin-vibe-proof
npm install eslint-plugin-vibe-proof
```

## Usage

You can begin by importing presets in your ESLint flat configuration. All presets are non-overlapping, so you can and should mix and use multiple of them.

```ts
import { eslint_plugin_vibe_proof } from 'eslint-plugin-vibe-proof';

/* basic presets that does not require typed linting */
eslint_plugin_vibe_proof.configs.common;
/* extra rules that require typescript-eslint typed linting */
eslint_plugin_vibe_proof.configs.common_type_checked;
/* react-specific rules */
eslint_plugin_vibe_proof.configs.react;
/* extra react-specific rules that require typescript-eslint typed linting */
eslint_plugin_vibe_proof.configs.react_type_checked;
```

You can also register the plugin and enable rules in your ESLint flat configuration yourself:

```ts
import { eslint_plugin_vibe_proof } from 'eslint-plugin-vibe-proof';

export default [
  {
    plugins: {
      'vibe-proof': eslint_plugin_vibe_proof
    },
    rules: {
      /* --- included in `configs.common` --- */

      // Ban `eslint-disable` comment directives that coding agents may use to
      // "workaround" linting errors, forcing them to write a description instead
      'vibe-proof/ban-eslint-disable': 'error',
      // Prefer `.reduce` over chaining `.filter` and `.map`
      'vibe-proof/no-chain-array-higher-order-functions': 'error',
      // Disallow `.includes()` on constant arrays — use a `Set` with `.has()`
      'vibe-proof/no-constant-array-includes': 'error',
      // Avoid passing entry arrays from `.flatMap()` / `.map()` / `.reduce()`
      // / `.reduceRight()` to `Object.fromEntries`
      'vibe-proof/prefer-array-reduce-to-object': 'error',
      // Prefer `export const { a, b } = value` over exporting elements one by one
      'vibe-proof/prefer-export-destructuring': 'error',
      // Hoist literal regexes to module level to avoid re-creation on every call
      'vibe-proof/prefer-hoisted-regex': 'error',

      /* --- included in `configs.common_type_checked` (requires typed linting) --- */

      // Enforce indexed `for` loops with a cached length over `for...of` on arrays
      'vibe-proof/prefer-indexed-array-loop': 'error',

      /* --- included in `configs.react` --- */

      // Disallow duplicate JSX props — only the last one takes effect
      'vibe-proof/jsx-no-duplicate-props': 'error',
      // Disallow spreading object literals in JSX
      'vibe-proof/jsx-no-explicit-spread-props': 'error',
      // Disallow `location.href =` / `location.assign()` for relative-URL
      // navigation — use the framework's navigation API
      'vibe-proof/no-location-assign-relative-destination': 'error',
      // Disallow mirroring props, state, or hook returns into a ref to peek at later
      'vibe-proof/react-ban-peak-via-ref': 'error',
      // Detect unguarded state updates after async work inside an effect
      'vibe-proof/react-detect-potential-race-condition': 'error',
      // Detect circular dependencies in React effects
      'vibe-proof/react-no-circular-effect': 'error',
      // Disallow manual cancellation flags in `useEffect` for race condition cleanup
      'vibe-proof/react-no-manual-use-effect-race-condition-prevention': 'error',
      // Disallow mixing controlled and uncontrolled props on the same element
      'vibe-proof/react-no-mixing-controlled-and-uncontrolled-props': 'error',
      // Disallow `Array.prototype.find` in render, `useMemo`, or `useCallback`
      'vibe-proof/react-no-performance-impacting-array-find': 'error',
      // Disallow props that accept render functions returning JSX
      'vibe-proof/react-no-render-function-prop': 'error',
      // Disallow unnecessary `useCallback` calls
      'vibe-proof/react-no-unnecessary-use-callback': 'error',
      // Disallow unnecessary `useMemo` calls
      'vibe-proof/react-no-unnecessary-use-memo': 'error',
      // Disallow calling a `useState` setter synchronously in an effect
      'vibe-proof/react-no-use-effect-watching': 'error',
      // Disallow `useState` without its setter — use `useRef` or `foxact/use-singleton`
      'vibe-proof/react-no-use-state-as-ref': 'error',
      // Prefer `React.PropsWithChildren` over manually declaring `{ children: ReactNode }`
      'vibe-proof/react-prefer-props-with-children': 'error',
      // Prefer the state updater function form when updating state
      'vibe-proof/react-prefer-state-updater-function': 'error',

      // Prefer `ComposeContextProvider` when many providers are nested together
      'vibe-proof/react-prefer-foxact-compose-context-provider': 'error',
      // Disallow `localStorage` / `sessionStorage` in React code
      'vibe-proof/react-prefer-foxact-persistent': 'error',
      // Prefer an abortable effect for EventTarget subscriptions with manual cleanup
      'vibe-proof/react-prefer-foxact-use-abortable-effect': 'warn',
      // Disallow copy-related Web APIs in React code
      'vibe-proof/react-prefer-foxact-use-clipboard': 'error',
      // Disallow direct `matchMedia` usage in React code
      'vibe-proof/react-prefer-foxact-use-media-query': 'error'
    }
  }
];
```

## License

[MIT](LICENSE)

----

**eslint-plugin-vibe-proof** © [Sukka](https://github.com/SukkaW), Released under the [MIT](./LICENSE) License.
Authored and maintained by Sukka with help from contributors ([list](https://github.com/SukkaW/eslint-plugin-vibe-proof/graphs/contributors)).

> [Personal Website](https://skk.moe) · [Blog](https://blog.skk.moe) · GitHub [@SukkaW](https://github.com/SukkaW) · Telegram Channel [@SukkaChannel](https://t.me/SukkaChannel) · Mastodon [@sukka@acg.mn](https://acg.mn/@sukka) · Twitter [@isukkaw](https://twitter.com/isukkaw) · BlueSky [@skk.moe](https://bsky.app/profile/skk.moe)

<p align="center">
  <a href="https://github.com/sponsors/SukkaW/">
    <img src="https://sponsor.cdn.skk.moe/sponsors.svg"/>
  </a>
</p>
