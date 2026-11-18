/**
 * Every screen in both themes, measured (11 §3.5, §3.6).
 *
 * What this proves
 *   Each route in 03 §1 is opened in the real navigators against the mock API,
 *   left to load, and then audited: every piece of text it renders is measured
 *   against the ground it sits on (src/test/contrastAudit.ts), in light and in
 *   dark. A dark render may not use a light-only token, and a light render may
 *   not use a dark-only one.
 *
 * The per-screen contrast report
 *   `CONTRAST_REPORT=../docs/qa/contrast-by-screen.md npx jest themeContrast`
 *   rewrites the report from the same run. The assertions here are what keep
 *   it true; the file is the readable copy.
 */
import {
  NavigationContainer,
  useNavigationContainerRef,
  type NavigationContainerRef,
} from '@react-navigation/native';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { writeFileSync } from 'fs';
import { http, HttpResponse } from 'msw';
import { resolve } from 'path';
import { useMemo, type ReactNode } from 'react';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components';
import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { auditContrast, type ContrastAudit } from '@/test/contrastAudit';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient } from '@/test/render';
import { server } from '@/test/server';
import {
  darkCategoryColors,
  darkColors,
  darkServicePalette,
  lightCategoryColors,
  lightColors,
  lightServicePalette,
  ThemeProvider,
  useTheme,
  type ColorScheme,
} from '@/theme';

import { AppNavigator } from './AppNavigator';
import { AuthNavigator } from './AuthNavigator';
import { getNavigationTheme } from './theme';

// Google's consent screen can't open in Jest.
jest.mock('@/features/extraction/gmailAuth', () => ({
  authorizeGmail: jest.fn(async () => ({ kind: 'cancelled' })),
}));

type Nav = NavigationContainerRef<Record<string, object | undefined>>;
type Go = (nav: Nav) => void;

interface Case {
  name: string;
  stack: 'app' | 'auth';
  go: Go;
  email?: string;
  /** Extra handlers for this case only (an error state). */
  setup?: () => void;
}

const to =
  (route: string, params?: object): Go =>
  (nav) =>
    (nav.navigate as (r: string, p?: object) => void)(route, params);
const tab = (name: string, screenName?: string, params?: object): Go =>
  to(
    'MainTabs',
    screenName
      ? { screen: name, params: { screen: screenName, params } }
      : { screen: name },
  );

const failAll = () =>
  server.use(
    http.get('*/analytics/*', () =>
      HttpResponse.json(
        { error: { code: 'server_error', message: 'Down.' } },
        { status: 500 },
      ),
    ),
    http.get('*/subscriptions', () =>
      HttpResponse.json(
        { error: { code: 'server_error', message: 'Down.' } },
        { status: 500 },
      ),
    ),
  );

const CASES: Case[] = [
  // 05: auth
  { name: 'Log In', stack: 'auth', go: to('Login') },
  { name: 'Create your account', stack: 'auth', go: to('Register') },
  {
    name: 'Check your email (verify)',
    stack: 'auth',
    go: to('VerifyEmailSent', { email: 'a@b.c' }),
  },
  { name: 'Email confirmed', stack: 'auth', go: to('EmailConfirmed', { token: 't' }) },
  { name: 'Forgot password', stack: 'auth', go: to('ForgotPassword') },
  { name: 'Reset link sent', stack: 'auth', go: to('ResetLinkSent', { email: 'a@b.c' }) },
  {
    name: 'Create a new password',
    stack: 'auth',
    go: to('CreateNewPassword', { token: 't' }),
  },
  { name: 'Password updated', stack: 'auth', go: to('PasswordResetSuccess') },
  // 06: Home, loaded, first run, and failed
  { name: 'Home', stack: 'app', go: tab('Home') },
  { name: 'Home, first run', stack: 'app', go: tab('Home'), email: MOCK_EMAILS.empty },
  { name: 'Home, load failed', stack: 'app', go: tab('Home'), setup: failAll },
  // 07: subscriptions
  { name: 'Add subscription', stack: 'app', go: to('AddSubscription') },
  {
    name: 'Subscription detail',
    stack: 'app',
    go: to('SubscriptionDetail', { id: 'sub-hulu' }),
  },
  {
    name: 'Subscription detail, price history',
    stack: 'app',
    go: to('SubscriptionDetail', { id: 'sub-icloud-' }),
  },
  {
    name: 'Edit subscription',
    stack: 'app',
    go: to('EditSubscription', { id: 'sub-hulu' }),
  },
  { name: 'Edit history', stack: 'app', go: to('EditHistory', { id: 'sub-netflix' }) },
  {
    name: 'Confirm charge',
    stack: 'app',
    go: to('ConfirmCharge', { id: 'chg-spotify-0904' }),
  },
  // 08: analytics
  { name: 'Analytics', stack: 'app', go: tab('Analytics') },
  {
    name: 'Analytics, empty',
    stack: 'app',
    go: tab('Analytics'),
    email: MOCK_EMAILS.empty,
  },
  { name: 'Analytics, load failed', stack: 'app', go: tab('Analytics'), setup: failAll },
  // 09: settings
  { name: 'Settings', stack: 'app', go: tab('Settings') },
  { name: 'Profile & account', stack: 'app', go: to('ProfileAccount') },
  { name: 'Currency', stack: 'app', go: to('SelectCurrency') },
  {
    name: 'Switch currency (sheet)',
    stack: 'app',
    go: to('ConfirmCurrencyChange', { currency: 'EUR' }),
  },
  { name: 'Time zone', stack: 'app', go: to('SelectTimeZone') },
  { name: 'Notification rules', stack: 'app', go: to('NotificationRules') },
  // 10: family
  { name: 'Family', stack: 'app', go: tab('Settings', 'Family') },
  {
    name: 'Family member',
    stack: 'app',
    go: tab('Settings', 'FamilyMember', { id: 'mem-jordan' }),
  },
  {
    name: 'Family invite (as sam)',
    stack: 'app',
    go: to('FamilyInvite', { token: 'invite-kim' }),
    email: MOCK_EMAILS.empty,
  },
  {
    name: 'Family invite, expired',
    stack: 'app',
    go: to('FamilyInvite', { token: 'invite-expired' }),
  },
  // 11: calendar and AI
  { name: 'Calendar', stack: 'app', go: tab('Calendar') },
  {
    name: 'Calendar, empty',
    stack: 'app',
    go: tab('Calendar'),
    email: MOCK_EMAILS.empty,
  },
  { name: 'Trial Shield', stack: 'app', go: tab('Calendar', 'TrialShield') },
  { name: 'Shared plans', stack: 'app', go: tab('Settings', 'SharedPlans') },
  { name: 'Connect email', stack: 'app', go: tab('Settings', 'ConnectEmail') },
  {
    name: 'Review extraction',
    stack: 'app',
    go: to('ReviewExtraction', { id: 'ext-hulu' }),
  },
];

const flat = (o: object): string[] =>
  Object.values(o).flatMap((v) =>
    typeof v === 'string' ? [v] : v && typeof v === 'object' ? flat(v) : [],
  );

const PALETTES: Record<ColorScheme, { own: string[]; other: string[] }> = {
  dark: {
    own: [...flat(darkCategoryColors), ...flat(darkServicePalette)],
    other: [
      ...flat(lightColors),
      ...flat(lightCategoryColors),
      ...flat(lightServicePalette),
    ],
  },
  light: {
    own: [...flat(lightCategoryColors), ...flat(lightServicePalette)],
    other: [
      ...flat(darkColors),
      ...flat(darkCategoryColors),
      ...flat(darkServicePalette),
    ],
  },
};

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Harness({ stack, go }: { stack: Case['stack']; go: Go }) {
  const ref = useNavigationContainerRef();
  const { colors, scheme } = useTheme();
  const theme = useMemo(() => getNavigationTheme(colors, scheme), [colors, scheme]);
  return (
    <NavigationContainer
      ref={ref}
      theme={theme}
      onReady={() => go(ref as unknown as Nav)}
    >
      {stack === 'app' ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

function Providers({
  children,
  scheme,
  client,
}: {
  children: ReactNode;
  scheme: ColorScheme;
  client: QueryClient;
}) {
  return (
    <ThemeProvider initialPreference={scheme} reduceMotionOverride>
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <QueryClientProvider client={client}>
          <SessionProvider>
            <ToastProvider>{children}</ToastProvider>
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

/** Opens a case and waits until nothing is loading. */
async function open(c: Case, scheme: ColorScheme): Promise<ContrastAudit> {
  await tokenStore.clear();
  if (c.stack === 'app') {
    await tokenStore.setRefreshToken(`mock-refresh-${c.email ?? MOCK_EMAILS.full}`);
  }
  c.setup?.();
  const client = createTestQueryClient();
  await render(
    <Providers scheme={scheme} client={client}>
      <Harness stack={c.stack} go={c.go} />
    </Providers>,
  );
  await waitFor(() => {
    expect(client.isFetching()).toBe(0);
    expect(client.isMutating()).toBe(0);
    expect(screen.toJSON()).not.toBeNull();
  });
  // Let the last answers render, and any follow-up query start and settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await waitFor(() => expect(client.isFetching()).toBe(0));

  const colors = scheme === 'dark' ? darkColors : lightColors;
  return auditContrast(
    screen.toJSON(),
    colors,
    PALETTES[scheme].other,
    PALETTES[scheme].own,
  );
}

const report: Record<string, Partial<Record<ColorScheme, ContrastAudit>>> = {};

beforeEach(() => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe.each<ColorScheme>(['dark', 'light'])('%s theme', (scheme) => {
  it.each(CASES.map((c) => [c.name, c] as const))(
    '%s: every text passes AA on its ground, with no token from the other theme',
    async (_name, c) => {
      const audit = await open(c, scheme);
      (report[c.name] ??= {})[scheme] = audit;

      expect(audit.measured).toBeGreaterThan(0);
      expect(audit.failures).toEqual([]);
      expect(audit.leaks).toEqual([]);
    },
  );
});

afterAll(() => {
  const target = process.env.CONTRAST_REPORT;
  if (!target) return;
  const lines: string[] = [
    '# Contrast by screen (11 §3.5)',
    '',
    'Generated by `src/navigation/themeContrast.test.tsx`; do not edit by hand. Rerun with',
    '`CONTRAST_REPORT=../docs/qa/contrast-by-screen.md npx jest themeContrast` from `mobile/`.',
    '',
    'Each screen is opened in the real navigators against the mock API (account `alex`',
    'unless noted) and audited after it loads. Every text run is measured against the',
    'ground it sits on, with translucent fills flattened. Text needs 4.5:1, large text',
    '3:1. Disabled controls and decorative subtrees hidden from screen readers (service',
    'marks, skeletons) are exempt, as WCAG allows. "Lowest" is the weakest pair on the',
    'screen; "pairs" counts the distinct text/ground pairs.',
    '',
    '| Screen | Dark: lowest | Dark: pairs | Light: lowest | Light: pairs |',
    '| --- | --- | --- | --- | --- |',
  ];
  const cell = (a?: ContrastAudit) => {
    const worst = a?.pairs[0];
    if (!a || !worst) return ['n/a', 'n/a'];
    const flag = a.failures.length ? ' FAIL' : '';
    return [
      `${worst.ratio.toFixed(2)} (needs ${worst.needs}) "${worst.text.replace(/\|/g, '/')}"${flag}`,
      String(a.pairs.length),
    ];
  };
  for (const c of CASES) {
    const r = report[c.name] ?? {};
    lines.push(
      `| ${c.name} | ${cell(r.dark).join(' | ')} | ${cell(r.light).join(' | ')} |`,
    );
  }
  lines.push('');
  writeFileSync(resolve(process.cwd(), target), lines.join('\n'));
});
