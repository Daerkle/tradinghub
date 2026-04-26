export const DISPLAY_LOCALE = "de-DE";

export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP"] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export const SUPPORTED_THEMES = ["light", "dark", "system"] as const;
export type SupportedTheme = typeof SUPPORTED_THEMES[number];

export interface UserProfile {
  username: string;
  email: string;
}

export interface UserPreferences {
  theme: SupportedTheme;
  compactMode: boolean;
  displayCurrency: SupportedCurrency;
  timezone: string;
  dailySummary: boolean;
  tradeNotifications: boolean;
  ibFlexToken: string;
  ibFlexQueryId: string;
}

export interface FxRatesPayload {
  baseCurrency: SupportedCurrency;
  rates: Record<SupportedCurrency, number>;
  updatedAt: string;
  source: string;
}

export interface UserSettingsPayload {
  profile: UserProfile;
  preferences: UserPreferences;
}

export interface SaveUserSettingsPayload {
  profile?: Partial<UserProfile>;
  preferences?: Partial<UserPreferences>;
  password?: {
    currentPassword: string;
    newPassword: string;
  };
}

export const DEFAULT_FX_RATES: FxRatesPayload = {
  baseCurrency: "USD",
  rates: {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
  },
  updatedAt: "1970-01-01T00:00:00.000Z",
  source: "fallback",
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: "dark",
  compactMode: true,
  displayCurrency: "USD",
  timezone: "Europe/Berlin",
  dailySummary: true,
  tradeNotifications: true,
  ibFlexToken: "",
  ibFlexQueryId: "",
};

export const DEFAULT_USER_PROFILE: UserProfile = {
  username: "",
  email: "",
};

function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return typeof value === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(value.toUpperCase());
}

function isSupportedTheme(value: unknown): value is SupportedTheme {
  return typeof value === "string" && (SUPPORTED_THEMES as readonly string[]).includes(value.toLowerCase());
}

export function normalizeCurrency(value: unknown, fallback: SupportedCurrency = "USD"): SupportedCurrency {
  if (!isSupportedCurrency(value)) return fallback;
  return value.toUpperCase() as SupportedCurrency;
}

export function normalizeTheme(value: unknown, fallback: SupportedTheme = "dark"): SupportedTheme {
  if (!isSupportedTheme(value)) return fallback;
  return value.toLowerCase() as SupportedTheme;
}

export function normalizeTimezone(value: unknown, fallback = DEFAULT_USER_PREFERENCES.timezone): string {
  if (typeof value !== "string" || value.trim().length === 0) return fallback;
  return value.trim();
}

export function sanitizeUserProfile(value: Partial<UserProfile> | null | undefined): UserProfile {
  return {
    username: typeof value?.username === "string" ? value.username.trim() : DEFAULT_USER_PROFILE.username,
    email: typeof value?.email === "string" ? value.email.trim() : DEFAULT_USER_PROFILE.email,
  };
}

export function sanitizeUserPreferences(value: Partial<UserPreferences> | null | undefined): UserPreferences {
  return {
    theme: normalizeTheme(value?.theme, DEFAULT_USER_PREFERENCES.theme),
    compactMode: Boolean(value?.compactMode),
    displayCurrency: normalizeCurrency(value?.displayCurrency, DEFAULT_USER_PREFERENCES.displayCurrency),
    timezone: normalizeTimezone(value?.timezone),
    dailySummary: value?.dailySummary ?? DEFAULT_USER_PREFERENCES.dailySummary,
    tradeNotifications: value?.tradeNotifications ?? DEFAULT_USER_PREFERENCES.tradeNotifications,
    ibFlexToken: typeof value?.ibFlexToken === "string" ? value.ibFlexToken.trim() : "",
    ibFlexQueryId: typeof value?.ibFlexQueryId === "string" ? value.ibFlexQueryId.trim() : "",
  };
}

export function sanitizeFxRates(value: Partial<FxRatesPayload> | null | undefined): FxRatesPayload {
  const rates = (value?.rates || {}) as Partial<Record<SupportedCurrency, number>>;
  return {
    baseCurrency: normalizeCurrency(value?.baseCurrency, DEFAULT_FX_RATES.baseCurrency),
    rates: {
      USD: Number.isFinite(rates.USD) ? Number(rates.USD) : DEFAULT_FX_RATES.rates.USD,
      EUR: Number.isFinite(rates.EUR) ? Number(rates.EUR) : DEFAULT_FX_RATES.rates.EUR,
      GBP: Number.isFinite(rates.GBP) ? Number(rates.GBP) : DEFAULT_FX_RATES.rates.GBP,
    },
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : DEFAULT_FX_RATES.updatedAt,
    source: typeof value?.source === "string" ? value.source : DEFAULT_FX_RATES.source,
  };
}

export function convertCurrencyAmount(
  value: number | null | undefined,
  fromCurrency: string | null | undefined,
  toCurrency: string | null | undefined,
  fxRates: FxRatesPayload = DEFAULT_FX_RATES
): number {
  if (!Number.isFinite(value)) return 0;

  const from = normalizeCurrency(fromCurrency, fxRates.baseCurrency);
  const to = normalizeCurrency(toCurrency, fxRates.baseCurrency);
  if (from === to) return Number(value);

  const fromRate = fxRates.rates[from];
  const toRate = fxRates.rates[to];

  if (!Number.isFinite(fromRate) || fromRate <= 0 || !Number.isFinite(toRate) || toRate <= 0) {
    return Number(value);
  }

  const usdValue = Number(value) / fromRate;
  return usdValue * toRate;
}

export function formatCurrencyValue(
  value: number | null | undefined,
  currency: string | null | undefined,
  options: Intl.NumberFormatOptions = {}
): string {
  const normalizedCurrency = normalizeCurrency(currency);
  const numericValue = Number.isFinite(value) ? Number(value) : 0;

  return new Intl.NumberFormat(DISPLAY_LOCALE, {
    style: "currency",
    currency: normalizedCurrency,
    maximumFractionDigits: 2,
    ...options,
  }).format(numericValue);
}

export function formatCompactCurrencyValue(
  value: number | null | undefined,
  currency: string | null | undefined,
  maximumFractionDigits = 1
): string {
  return formatCurrencyValue(value, currency, {
    notation: "compact",
    maximumFractionDigits,
  });
}
