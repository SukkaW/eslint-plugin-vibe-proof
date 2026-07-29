import plugin from '../index';
import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'earl';
import { keysLength } from 'foxts/property-count';
import type { Linter } from 'eslint';

/** Matches a `'vibe-proof/rule-name': 'severity'` pair in a config snippet. */
const RE_RULE_ENTRY = /'vibe-proof\/([\w-]+)':\s*'(\w+)'/g;
const RE_PLUGIN_PREFIX = /^vibe-proof\//;

const readme = fs.readFileSync(path.join(__dirname, '../../README.md'), 'utf8');

/** Every `'vibe-proof/x': 'sev'` pair mentioned anywhere in the README. */
const mentioned = new Map<string, string>();
for (const m of readme.matchAll(RE_RULE_ENTRY)) {
  mentioned.set(m[1], m[2]);
}

/** The severity each preset actually sets, for rules that are enabled. */
const presetSeverity = new Map<string, Linter.RuleSeverity>();
const allConfigs = Object.values(plugin.configs);
for (let i = 0, len = allConfigs.length; i < len; i++) {
  const ruleEntries = Object.entries(allConfigs[i].rules);
  for (let j = 0, entriesLen = ruleEntries.length; j < entriesLen; j++) {
    const [k, sev] = ruleEntries[j];
    if (sev !== 'off') presetSeverity.set(k.replace(RE_PLUGIN_PREFIX, ''), sev as Linter.RuleSeverity);
  }
}

function stripPrefix(key: string) {
  return key.replace(RE_PLUGIN_PREFIX, '');
}

/** Rule names from `rules` that the given README section does not list. */
function missingFrom(section: string, rules: Record<string, unknown>) {
  return Object.keys(rules).reduce<string[]>((acc, key) => {
    const name = stripPrefix(key);
    if (!section.includes(`'vibe-proof/${name}'`)) acc.push(name);
    return acc;
  }, []);
}

describe('README', () => {
  it('names only rules that exist', () => {
    const unknown = [...mentioned.keys()].filter((name) => !(name in plugin.rules));
    expect(unknown).toEqual([]);
  });

  it('documents every registered rule', () => {
    const missing = Object.keys(plugin.rules).filter((r) => !mentioned.has(r));
    expect(missing).toEqual([]);
    expect(mentioned.size).toEqual(keysLength(plugin.rules));
  });

  it('uses severities matching the presets', () => {
    const mismatched = [...mentioned].reduce<string[]>((acc, [name, sev]) => {
      const expected = presetSeverity.get(name);
      if (expected !== sev && expected != null) {
        acc.push(`${name}: README=${sev} preset=${expected}`);
      }
      return acc;
    }, []);
    expect(mismatched).toEqual([]);
  });

  it('groups rules under the preset that enables them', () => {
    const commonIdx = readme.indexOf('included in `configs.common`');
    const reactIdx = readme.indexOf('included in `configs.react`');
    expect(commonIdx).toBeGreaterThan(0);
    expect(reactIdx).toBeGreaterThan(commonIdx);

    const commonSection = readme.slice(commonIdx, reactIdx);
    const reactSection = readme.slice(reactIdx);

    expect(missingFrom(commonSection, plugin.configs.common.rules)).toEqual([]);
    expect(missingFrom(reactSection, plugin.configs.react.rules)).toEqual([]);
  });
});
