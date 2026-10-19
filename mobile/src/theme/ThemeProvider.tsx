/**
 * Theme provider — light, dark, and the user's choice between them.
 *
 * What this is for
 *   Resolving which colour set is live and handing it to every component through
 *   `useTheme()`. Components never import `lightColors` or `darkColors`; they ask
 *   for `colors.text` and get the live one, which is what lets the Profile
 *   screen's Dark / Light / System control (handoff 09 §5) work without touching
 *   a single component.
 *
 * What it also carries
 *   `reduceMotion` — the OS "Reduce Motion" setting, kept live, so a component
 *   can skip a transition with `if (!reduceMotion) animate()`.
 *
 * Outside a provider
 *   `useTheme()` returns the light theme. That keeps a bare `render(<Button/>)`
 *   in a test working; the app itself always mounts the provider in App.tsx.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import {
  darkCategoryColors,
  darkColors,
  darkServicePalette,
  lightCategoryColors,
  lightColors,
  lightServicePalette,
  type CategoryColors,
  type ColorTokens,
  type ServiceColors,
} from './tokens';
import { createTypography, type Typography } from './typography';

export type ColorScheme = 'light' | 'dark';
export type ThemePreference = ColorScheme | 'system';

/** Everything that varies by theme, resolved for one scheme. */
export interface SchemeTheme {
  scheme: ColorScheme;
  colors: ColorTokens;
  categoryColors: CategoryColors;
  servicePalette: readonly ServiceColors[];
  typography: Typography;
}

export interface Theme extends SchemeTheme {
  /** True when the OS asks for reduced motion. Skip non-essential animation. */
  reduceMotion: boolean;
  /** The user's choice. `system` follows the OS appearance setting. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

/**
 * Built once per scheme at module load, so every consumer of a scheme shares the
 * same object identities — which is what `makeStyles` caches on.
 */
export const schemeThemes: Record<ColorScheme, SchemeTheme> = {
  light: {
    scheme: 'light',
    colors: lightColors,
    categoryColors: lightCategoryColors,
    servicePalette: lightServicePalette,
    typography: createTypography(lightColors),
  },
  dark: {
    scheme: 'dark',
    colors: darkColors,
    categoryColors: darkCategoryColors,
    servicePalette: darkServicePalette,
    typography: createTypography(darkColors),
  },
};

const defaultTheme: Theme = {
  ...schemeThemes.light,
  reduceMotion: false,
  preference: 'light',
  setPreference: () => {},
};

const ThemeContext = createContext<Theme>(defaultTheme);

/** Tracks the OS Reduce Motion setting, including changes while the app runs. */
function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {
        // Unsupported platform: assume motion is fine, which is the OS default.
      });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

export interface ThemeProviderProps {
  children: ReactNode;
  /**
   * Starting preference. Defaults to `system`.
   * TODO(09): seed from UserSettings.theme and persist changes to the server.
   */
  initialPreference?: ThemePreference;
}

export function ThemeProvider({
  children,
  initialPreference = 'system',
}: ThemeProviderProps) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);
  const osScheme = useColorScheme();
  const reduceMotion = useReduceMotion();

  const scheme: ColorScheme =
    preference === 'system' ? (osScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<Theme>(
    () => ({ ...schemeThemes[scheme], reduceMotion, preference, setPreference }),
    [scheme, reduceMotion, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The live theme. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
