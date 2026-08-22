import mod from '.';
import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';

runTest({
  module: mod,
  valid: [
    // Exported components must stay components
    dedent`
      export function Header() {
        return <div>hi</div>;
      }
      function App() {
        return <main><Header /></main>;
      }
      export default App;
    `,
    // Exported via an export specifier
    dedent`
      function Header() {
        return <div>hi</div>;
      }
      function App() {
        return <main><Header /></main>;
      }
      export { Header };
    `,
    // Exported as default via a later reference
    dedent`
      function Header() {
        return <div>hi</div>;
      }
      function App() {
        return <main><Header /></main>;
      }
      export default Header;
    `,
    // export const arrow component
    dedent`
      export const Header = () => <div>hi</div>;
      function App() {
        return <main><Header /></main>;
      }
    `,
    // Takes props — a real component
    dedent`
      function Header(props: { title: string }) {
        return <div>{props.title}</div>;
      }
      export function App() {
        return <main><Header title="hi" /></main>;
      }
    `,
    // Uses hooks — stateful, cannot become a constant
    dedent`
      function Clock() {
        return <span>{useTime()}</span>;
      }
      export function App() {
        return <main><Clock /></main>;
      }
    `,
    // Body is more than a single returned JSX expression
    dedent`
      function Header() {
        const now = Date.now();
        return <div>{now}</div>;
      }
      export function App() {
        return <main><Header /></main>;
      }
    `,
    // Statement with side effects before the return — not constant JSX
    dedent`
      function Header() {
        console.log('render');
        return <div>hi</div>;
      }
      export function App() {
        return <main><Header /></main>;
      }
    `,
    // Conditional over non-JSX leaves — not a constant JSX expression
    dedent`
      function Header() {
        if (globalFlag) return renderSomething();
        return <div>b</div>;
      }
      export function App() {
        return <main><Header /></main>;
      }
    `,
    // Also used as a value — must remain a component
    dedent`
      function Fallback() {
        return <div>loading</div>;
      }
      export function App() {
        return <Suspense fallback={Fallback}><Page /></Suspense>;
      }
    `,
    // HOC-wrapped result is default-exported — the component leaves the
    // module, the wrapper is API
    dedent`
      function Comp() {
        return <div />;
      }
      export default memo(Comp);
    `,
    // Bare default export via a later reference
    dedent`
      function Comp() {
        return <div />;
      }
      export default Comp;
    `,
    // Bare named export via a specifier
    dedent`
      function Comp() {
        return <div />;
      }
      export { Comp };
    `,
    // HOC result assigned to an exported const
    dedent`
      function Comp() {
        return <div />;
      }
      export const MemoComp = memo(Comp);
    `,
    // HOC result exported via a later specifier
    dedent`
      function Comp() {
        return <div />;
      }
      const MemoComp = memo(Comp);
      export { MemoComp };
    `,
    // Nested HOC wrappers, result default-exported
    dedent`
      function Comp() {
        return <div />;
      }
      export default withRouter(memo(Comp));
    `,
    // Passed to an unrecognized call — the API may genuinely require a
    // component type, so it must remain a component
    dedent`
      function Header() {
        return <div>hi</div>;
      }
      registerComponent(Header);
      export function App() {
        return <main><Header /></main>;
      }
    `,
    // Rendered with a key — consumed by React at the usage site
    dedent`
      function Row() {
        return <li>row</li>;
      }
      export function App() {
        return <ul>{items.map((item) => <Row key={item.id} />)}</ul>;
      }
    `,
    // Rendered with a ref — consumed by React at the usage site
    dedent`
      function Box() {
        return <div />;
      }
      export function App() {
        return <Box ref={boxRef} />;
      }
    `,
    // Rendered with a spread — may contain key/ref
    dedent`
      function Box() {
        return <div />;
      }
      export function App() {
        return <Box {...rest} />;
      }
    `,
    // Recursive component
    dedent`
      function Tree() {
        return <div><Tree /></div>;
      }
      export function App() {
        return <main><Tree /></main>;
      }
    `,
    // Never used at all — no-unused-vars territory, not this rule's
    dedent`
      function Header() {
        return <div>hi</div>;
      }
      export const App = () => <main />;
    `,
    // Not a component (lowercase)
    dedent`
      function header() {
        return <div>hi</div>;
      }
      export function App() {
        return <main>{header()}</main>;
      }
    `,
    // export default function — exported
    dedent`
      export default function App() {
        return <main />;
      }
    `,
    // export default memo(...) — exported
    dedent`
      export default memo(() => <main />);
    `
  ],
  invalid: [
    // Function declaration, rendered once
    {
      code: dedent`
        function Header() {
          return <div>hi</div>;
        }
        export function App() {
          return <main><Header /></main>;
        }
      `,
      output: dedent`
        const headerJsx = <div>hi</div>;
        export function App() {
          return <main>{headerJsx}</main>;
        }
      `,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Header' } }]
    },
    // Arrow function with expression body
    {
      code: dedent`
        const Header = () => <div>hi</div>;
        export function App() {
          return <main><Header /></main>;
        }
      `,
      output: dedent`
        const headerJsx = <div>hi</div>;
        export function App() {
          return <main>{headerJsx}</main>;
        }
      `,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Header' } }]
    },
    // Arrow function with block body
    {
      code: dedent`
        const Header = () => {
          return <div>hi</div>;
        };
        export function App() {
          return <main><Header /></main>;
        }
      `,
      output: dedent`
        const headerJsx = <div>hi</div>;
        export function App() {
          return <main>{headerJsx}</main>;
        }
      `,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Header' } }]
    },
    // memo-wrapped arrow — memoizing a prop-less single-use component is
    // exactly what a constant already gives you
    {
      code: dedent`
        const Header = memo(() => <div>hi</div>);
        export function App() {
          return <main><Header /></main>;
        }
      `,
      output: dedent`
        const headerJsx = <div>hi</div>;
        export function App() {
          return <main>{headerJsx}</main>;
        }
      `,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Header' } }]
    },
    // React.memo-wrapped function expression
    {
      code: dedent`
        const Header = React.memo(function Header() {
          return <div>hi</div>;
        });
        export function App() {
          return <main><Header /></main>;
        }
      `,
      output: dedent`
        const headerJsx = <div>hi</div>;
        export function App() {
          return <main>{headerJsx}</main>;
        }
      `,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Header' } }]
    },
    // Fragment body
    {
      code: dedent`
        function Meta() {
          return <><title>hi</title><meta charSet="utf-8" /></>;
        }
        export function App() {
          return <main><Meta /></main>;
        }
      `,
      output: dedent`
        const metaJsx = <><title>hi</title><meta charSet="utf-8" /></>;
        export function App() {
          return <main>{metaJsx}</main>;
        }
      `,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Meta' } }]
    },
    // Defined inside another component — also remounts on every parent render
    {
      code: dedent`
        export function App() {
          const Header = () => <div>hi</div>;
          return <main><Header /></main>;
        }
      `,
      output: dedent`
        export function App() {
          const headerJsx = <div>hi</div>;
          return <main>{headerJsx}</main>;
        }
      `,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Header' } }]
    },
    // Rendered once with an explicit closing tag but no children
    {
      code: dedent`
        function Header() {
          return <div>hi</div>;
        }
        export function App() {
          return <main><Header></Header></main>;
        }
      `,
      output: dedent`
        const headerJsx = <div>hi</div>;
        export function App() {
          return <main>{headerJsx}</main>;
        }
      `,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Header' } }]
    },
    // Conditional returns are still constant JSX — the whole body is just
    // `globalFlag ? <div>a</div> : <div>b</div>`. Not auto-fixable though:
    // the if/else tree would have to be rewritten into a ternary.
    {
      code: dedent`
        function Header() {
          if (globalFlag) return <div>a</div>;
          return <div>b</div>;
        }
        export function App() {
          return <main><Header /></main>;
        }
      `,
      output: null,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Header' } }]
    },
    // Ternary expression body — already a single expression, fixable
    {
      code: dedent`
        const Banner = () => globalFlag ? <div>a</div> : <div>b</div>;
        export function App() {
          return <main><Banner /></main>;
        }
      `,
      output: dedent`
        const bannerJsx = globalFlag ? <div>a</div> : <div>b</div>;
        export function App() {
          return <main>{bannerJsx}</main>;
        }
      `,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Banner' } }]
    },
    // Logical && body
    {
      code: dedent`
        const Banner = () => globalFlag && <div>a</div>;
        export function App() {
          return <main><Banner /></main>;
        }
      `,
      output: dedent`
        const bannerJsx = globalFlag && <div>a</div>;
        export function App() {
          return <main>{bannerJsx}</main>;
        }
      `,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Banner' } }]
    },
    // Early return of null with if/else blocks — reported, but the statement
    // tree is not mechanically convertible to an expression
    {
      code: dedent`
        function Header() {
          if (hidden) {
            return null;
          }
          return <div>hi</div>;
        }
        export function App() {
          return <main><Header /></main>;
        }
      `,
      output: null,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Header' } }]
    },
    // Rendered with children — the prop-less component silently ignores
    // them, so it is still a useless component. Not auto-fixable: the
    // children expressions still evaluate at element creation, so deleting
    // them could remove side effects.
    {
      code: dedent`
        function Box() {
          return <div />;
        }
        export function App() {
          return <Box><span>hi</span></Box>;
        }
      `,
      output: null,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Box' } }]
    },
    // Rendered with a non-key/ref attribute — equally ignored by the
    // component; reported but not auto-fixed for the same reason
    {
      code: dedent`
        function Box() {
          return <div />;
        }
        export function App() {
          return <Box className="box" />;
        }
      `,
      output: null,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Box' } }]
    },
    // JSX referencing outer-scope constants is still constant JSX
    {
      code: dedent`
        const TITLE = 'hi';
        function Header() {
          return <div className="header">{TITLE}</div>;
        }
        export function App() {
          return <main><Header /></main>;
        }
      `,
      output: dedent`
        const TITLE = 'hi';
        const headerJsx = <div className="header">{TITLE}</div>;
        export function App() {
          return <main>{headerJsx}</main>;
        }
      `,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Header' } }]
    },
    // Two independent single-use components both get flagged. Each report's
    // declaration+usage fixes merge into one span, so the spans overlap and
    // only the first applies per `--fix` pass — Footer is fixed on the next.
    {
      code: dedent`
        function Header() {
          return <header>hi</header>;
        }
        function Footer() {
          return <footer>bye</footer>;
        }
        export function App() {
          return <main><Header /><Footer /></main>;
        }
      `,
      output: [
        dedent`
          const headerJsx = <header>hi</header>;
          function Footer() {
            return <footer>bye</footer>;
          }
          export function App() {
            return <main>{headerJsx}<Footer /></main>;
          }
        `,
        dedent`
          const headerJsx = <header>hi</header>;
          const footerJsx = <footer>bye</footer>;
          export function App() {
            return <main>{headerJsx}{footerJsx}</main>;
          }
        `
      ],
      errors: [
        { messageId: 'uselessComponent', data: { name: 'Header' } },
        { messageId: 'uselessComponent', data: { name: 'Footer' } }
      ]
    },
    // Rendered more than once — a React element is immutable, so the same
    // constant can be rendered in several places
    {
      code: dedent`
        function Divider() {
          return <hr />;
        }
        export function App() {
          return <main><Divider /><Divider /></main>;
        }
      `,
      output: dedent`
        const dividerJsx = <hr />;
        export function App() {
          return <main>{dividerJsx}{dividerJsx}</main>;
        }
      `,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Divider' } }]
    },
    // Usage lexically before the declaration, but inside a function body —
    // evaluated on call, after module init, so the `const` is safe
    {
      code: dedent`
        export function App() {
          return <main><Header /></main>;
        }
        function Header() {
          return <div>hi</div>;
        }
      `,
      output: dedent`
        export function App() {
          return <main>{headerJsx}</main>;
        }
        const headerJsx = <div>hi</div>;
      `,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Header' } }]
    },
    // Usage in expression position — no JSX expression container needed
    {
      code: dedent`
        export function Layout() {
          return <Header />;
        }
        function Header() {
          return <div>hi</div>;
        }
      `,
      output: dedent`
        export function Layout() {
          return headerJsx;
        }
        const headerJsx = <div>hi</div>;
      `,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Header' } }]
    },
    // Module-level usage before the declaration — the hoisted function works
    // but a `const` would hit the TDZ, so no autofix
    {
      code: dedent`
        const page = <Header />;
        function Header() {
          return <div>hi</div>;
        }
        export default page;
      `,
      output: null,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Header' } }]
    },
    // The generated `xxxJsx` name is already taken — reported without autofix
    {
      code: dedent`
        const headerJsx = 'existing';
        function Header() {
          return <div>hi</div>;
        }
        export function App() {
          return <main><Header /></main>;
        }
      `,
      output: null,
      errors: [{ messageId: 'uselessComponent', data: { name: 'Header' } }]
    },
    // Wrapped in memo — with no props to compare, memo has nothing to
    // memoize; constant JSX already gets the reference-equality bailout
    {
      code: dedent`
        function Header() {
          return <div>hi</div>;
        }
        const MemoHeader = memo(Header);
        export function App() {
          return <main><MemoHeader /></main>;
        }
      `,
      output: null,
      errors: [{ messageId: 'uselessHocWrapper', data: { name: 'Header', hoc: 'memo' } }]
    },
    // React.memo member call
    {
      code: dedent`
        function Header() {
          return <div>hi</div>;
        }
        const MemoHeader = React.memo(Header);
        export function App() {
          return <main><MemoHeader /></main>;
        }
      `,
      output: null,
      errors: [{ messageId: 'uselessHocWrapper', data: { name: 'Header', hoc: 'memo' } }]
    },
    // State-injecting HOC — it can only inject via props, which a prop-less
    // component never reads
    {
      code: dedent`
        function Header() {
          return <div>hi</div>;
        }
        const RoutedHeader = withRouter(Header);
        export function App() {
          return <main><RoutedHeader /></main>;
        }
      `,
      output: null,
      errors: [{ messageId: 'uselessHocWrapper', data: { name: 'Header', hoc: 'withRouter' } }]
    },
    // HOC wrapping plus a direct render — the HOC report takes precedence
    {
      code: dedent`
        function Header() {
          return <div>hi</div>;
        }
        const MemoHeader = memo(Header);
        export function App() {
          return <main><Header /><MemoHeader /></main>;
        }
      `,
      output: null,
      errors: [{ messageId: 'uselessHocWrapper', data: { name: 'Header', hoc: 'memo' } }]
    }
  ]
}, {}, false);
