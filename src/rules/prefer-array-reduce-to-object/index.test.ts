import { dedent } from 'ts-dedent';
import mod from '.';
import { runTest } from '@test/run-test';

runTest({
  module: mod,
  valid: [
    dedent`
      const result = items.reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
      }, {});
    `,
    'Object.fromEntries(items);',
    'Object.fromEntries([["key", "value"]]);',
    'Object.fromEntries(new Map([["key", "value"]]));',
    'Object.fromEntries(Object.entries(value));',
    'Object.fromEntries(getEntries());',
    // Sorting must happen before insertion, and positional selection needs a
    // materialized array, so neither intermediate array is avoidable.
    'Object.fromEntries(items.map(toEntry).toSorted(compareEntries));',
    'Object.fromEntries(items.map(toEntry).sort(compareEntries));',
    'Object.fromEntries(items.map(toEntry).slice(0, 10));',
    'Object.fromEntries(entriesA.concat(entriesB));',
    'Object.fromEntries(items.map(toEntry).with(0, firstEntry));',
    'items.map((item) => [item.key, item.value]);',
    'Object.entries(value).map(([key, item]) => [key, transform(item)]);',
    'Reflect.fromEntries(items.map((item) => [item.key, item.value]));',
    // A shadowed Object is not the built-in Object constructor.
    dedent`
      const Object = {
        fromEntries(value: unknown) {
          return value;
        }
      };
      Object.fromEntries(items.map((item) => [item.key, item.value]));
    `,
    // Typed linting distinguishes a user-defined `.map()` method from an array.
    dedent`
      interface Collection {
        map(callback: (value: number) => [string, number]): Map<string, number>
      }
      declare const collection: Collection;
      Object.fromEntries(collection.map((value) => [String(value), value]));
    `,
    // The same safeguard applies to a user-defined `.reduce()` method.
    dedent`
      interface Collection {
        reduce(callback: (value: number) => [string, number]): Map<string, number>
      }
      declare const collection: Collection;
      Object.fromEntries(collection.reduce((value) => [String(value), value]));
    `,
    dedent`
      interface Collection {
        reduceRight(callback: (value: number) => [string, number]): Map<string, number>
      }
      declare const collection: Collection;
      Object.fromEntries(collection.reduceRight((value) => [String(value), value]));
    `,
    dedent`
      interface Collection {
        flatMap(callback: (value: number) => [string, number]): Map<string, number>
      }
      declare const collection: Collection;
      Object.fromEntries(collection.flatMap((value) => [String(value), value]));
    `,
    dedent`
      interface Collection {
        filter(callback: (value: number) => boolean): Map<string, number>
      }
      declare const collection: Collection;
      Object.fromEntries(collection.filter((value) => value > 0));
    `,
    dedent`
      interface Collection {
        toReversed(): Map<string, number>
      }
      declare const collection: Collection;
      Object.fromEntries(collection.toReversed());
    `,
    // A `Map` iterator is not an array being needlessly materialized.
    dedent`
      declare const map: Map<string, number>;
      Object.fromEntries(map.entries());
    `,
    dedent`
      declare const map: Map<string, number>;
      Object.fromEntries(map.keys());
    `,
    dedent`
      declare const map: Map<string, number>;
      Object.fromEntries(map.values());
    `
  ],
  invalid: [
    {
      code: 'Object.fromEntries(items.map((item) => [item.key, item.value]));',
      errors: [{ messageId: 'preferReduce' }]
    },
    {
      code: dedent`
        declare const items: Array<{ id: string, name: string }>;
        const byId = Object.fromEntries(
          items.map((item) => [item.id, item.name])
        );
      `,
      errors: [{ messageId: 'preferReduce' }]
    },
    {
      code: dedent`
        declare const entries: readonly [string, number][];
        Object.fromEntries(entries.map(([key, value]) => [key, value * 2]));
      `,
      errors: [{ messageId: 'preferReduce' }]
    },
    {
      code: dedent`
        declare const items: number[];
        Object.fromEntries(
          (items.map((item) => [String(item), item]) as Array<[string, number]>)
        );
      `,
      errors: [{ messageId: 'preferReduce' }]
    },
    {
      code: 'Object.fromEntries(getItems().map(toEntry));',
      errors: [{ messageId: 'preferReduce' }]
    },
    {
      code: dedent`
        declare const items: Array<{ id: string, name: string }>;
        const byId = Object.fromEntries(
          items.reduce<Array<[string, string]>>((entries, item) => {
            entries.push([item.id, item.name]);
            return entries;
          }, [])
        );
      `,
      errors: [{
        messageId: 'preferReduce',
        data: { method: 'reduce' }
      }]
    },
    {
      code: dedent`
        declare const items: number[];
        Object.fromEntries(
          items.reduce(
            (entries, item) => [...entries, [String(item), item]],
            [] as Array<[string, number]>
          )
        );
      `,
      errors: [{
        messageId: 'preferReduce',
        data: { method: 'reduce' }
      }]
    },
    {
      code: dedent`
        declare const items: Array<{ id: string, name: string }>;
        Object.fromEntries(
          items.reduceRight<Array<[string, string]>>((entries, item) => {
            entries.push([item.id, item.name]);
            return entries;
          }, [])
        );
      `,
      errors: [{
        messageId: 'preferReduce',
        data: { method: 'reduceRight' }
      }]
    },
    {
      code: 'Object.fromEntries(items.filter(isEntry));',
      errors: [{ messageId: 'preferFilterReduce' }]
    },
    {
      // `.reduceRight()` visits the entries in the reversed order already.
      code: dedent`
        declare const entries: Array<[string, number]>;
        Object.fromEntries(entries.toReversed());
      `,
      errors: [{ messageId: 'preferReverseReduce' }]
    },
    {
      code: dedent`
        declare const items: Array<{ id: string, name: string }>;
        Object.fromEntries(items.map((item) => [item.id, item.name]).toReversed());
      `,
      errors: [{ messageId: 'preferReverseReduce' }]
    },
    {
      // `.values()` is a pass-through; the reducer already iterates values.
      code: dedent`
        declare const entries: Array<[string, number]>;
        Object.fromEntries(entries.values());
      `,
      errors: [{
        messageId: 'preferReduce',
        data: { method: 'values' }
      }]
    },
    {
      // `.keys()` yields indices, which a reducer receives as its third argument.
      code: dedent`
        declare const items: string[];
        Object.fromEntries(items.keys());
      `,
      errors: [{
        messageId: 'preferReduce',
        data: { method: 'keys' }
      }]
    },
    {
      // The filtered entries can be skipped inside the reducer instead.
      code: dedent`
        declare const patched: Record<string, unknown>;
        Object.fromEntries(
          Object.entries(patched).filter((entry) => entry[1] !== null)
        );
      `,
      errors: [{ messageId: 'preferFilterReduce' }]
    },
    {
      // Only the outermost call is reported, once per `Object.fromEntries()`.
      code: dedent`
        declare const items: Array<{ id: string, name: string } | null>;
        Object.fromEntries(
          items.map((item) => item && [item.id, item.name]).filter(Boolean)
        );
      `,
      errors: [{ messageId: 'preferFilterReduce' }]
    },
    {
      code: dedent`
        declare const groups: Array<Array<{ id: string, name: string }>>;
        Object.fromEntries(
          groups.flatMap((group) => (
            group.map((item) => [item.id, item.name])
          ))
        );
      `,
      errors: [{ messageId: 'preferFlatReduce' }]
    },
    {
      code: dedent`
        declare const items: number[];
        Object.fromEntries(
          items.flatMap((item) => (
            item > 0 ? [[String(item), item]] : []
          ))
        );
      `,
      errors: [{ messageId: 'preferFlatReduce' }]
    }
  ]
});
