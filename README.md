# eslint-plugin-vibe-proof

You just can't really teach coding agents how to write the correct code using agent skills. The more agent skills you installed, faster models filling up the context window, faster your coding agents become stupid.

![LLM when the context window usage hit 60%: wojak trying to put a square block into a round hole meme](https://img.skk.moe/gh/eslint-plugin-vibe-proof-meme.jpg)

And LLM is very good at forgetting things. Given a long last coding session and enough conversation compaction, your coding agents can and will eventually forget the important things like agent skills you installed, and even your `AGENTS.md`.

What you really need is a deterministic and unforgiving feedback loop for your coding agents. Unit tests and static analysis are exactly that. When your coding agents poop your bed, linter will not forgive, linter will not forget, lingter will not yield, linter will not be constrained by the context window, linter will always detect and spit out the errors.

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
      'vibe-proof/ban-eslint-disable': 'error'
    }
  }
]
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
