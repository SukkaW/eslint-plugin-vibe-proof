import mod from '.';
import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';

runTest({
  module: mod,
  valid: [
    dedent`
      // 3 times
      function App({ children }) {
        return (
          <AuthProvider>
            <ThemeProvider>
              <RouteProvider>{children}</RouteProvider>
            </ThemeProvider>
          </AuthProvider>
        );
      }
    `,
    dedent`
      // break by layout
      function App({ children }) {
        return (
          <AuthProvider>
            <Layout>
              <ThemeProvider>
                <RouteProvider>{children}</RouteProvider>
              </ThemeProvider>
            </Layout>
          </AuthProvider>
        );
      }
    `,
    dedent`
      // 3 times
      function App({ children }) {
        return (
          <StoreContext.Provider>
            <InnerProvider>
              <ThemeProvider>{children}</ThemeProvider>
            </InnerProvider>
          </StoreContext.Provider>
        );
      }
    `,
    // 3 third-party providers — under the threshold, so still fine. Imported
    // providers are counted like any other; only the chain length matters.
    dedent`
      import { QueryClientProvider } from '@tanstack/react-query';
      import { Provider } from 'react-redux';
      import { ThemeProvider } from 'styled-components';

      function App({ children }) {
        return (
          <QueryClientProvider client={queryClient}>
            <Provider store={store}>
              <ThemeProvider theme={theme}>{children}</ThemeProvider>
            </Provider>
          </QueryClientProvider>
        );
      }
    `,
    // A non-foxact compose utility already flattens the chain — the rule is
    // satisfied by any equivalent solution, not just foxact's.
    dedent`
      import { Compose } from 'some-compose-lib';
      function App({ children }) {
        return (
          <Compose components={[AuthProvider, ThemeProvider, RouteProvider, IntlProvider]}>
            {children}
          </Compose>
        );
      }
    `,
    dedent`
      import { composeProviders } from 'react-compose-providers';
      const Providers = composeProviders([AuthProvider, ThemeProvider, RouteProvider, IntlProvider]);
      function App({ children }) {
        return <Providers>{children}</Providers>;
      }
    `,
    // foxact's own helper, for symmetry
    dedent`
      import { ComposeContextProvider } from 'foxact/compose-context-provider';
      function App({ children }) {
        return (
          <ComposeContextProvider contexts={[<AuthProvider />, <ThemeProvider />, <RouteProvider />, <IntlProvider />]}>
            {children}
          </ComposeContextProvider>
        );
      }
    `,
    // chain broken by a fragment
    dedent`
      function App({ children }) {
        return (
          <AuthProvider>
            <ThemeProvider>
              <>
                <RequestConfig>
                  <SidebarState>{children}</SidebarState>
                </RequestConfig>
              </>
            </ThemeProvider>
          </AuthProvider>
        );
      }
    `
  ],
  invalid: [
    {
      code: dedent`
        function App({ children }) {
          return (
            <AuthProvider>
              <ThemeProvider>
                <RequestConfig>
                  <SidebarState>{children}</SidebarState>
                </RequestConfig>
              </ThemeProvider>
            </AuthProvider>
          );
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Providers imported from third-party packages are intentionally still
    // reported: `ComposeContextProvider` flattens any provider chain regardless
    // of where the components come from, and a real-world provider pyramid is
    // mostly third-party.
    {
      code: dedent`
        import { QueryClientProvider } from '@tanstack/react-query';
        import { Provider } from 'react-redux';
        import { ThemeProvider } from 'styled-components';
        import { IntlProvider } from 'react-intl';

        function App({ children }) {
          return (
            <QueryClientProvider client={queryClient}>
              <Provider store={store}>
                <ThemeProvider theme={theme}>
                  <IntlProvider locale="en">{children}</IntlProvider>
                </ThemeProvider>
              </Provider>
            </QueryClientProvider>
          );
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        function App({ children }) {
          return (
            <StoreContext.Provider>
              <AuthProvider>
                <ThemeProvider>
                  <SidebarState>{children}</SidebarState>
                </ThemeProvider>
              </AuthProvider>
            </StoreContext.Provider>
          );
        }
      `,
      errors: [{ messageId: 'default' }]
    }
  ]
}, {}, false);
