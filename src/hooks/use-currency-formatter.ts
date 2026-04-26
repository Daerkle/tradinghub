"use client";

import { useMemo } from "react";
import {
  convertCurrencyAmount,
  formatCompactCurrencyValue,
  formatCurrencyValue,
} from "@/lib/user-settings";
import { useUserSettingsStore } from "@/stores/user-settings-store";

export function useCurrencyFormatter() {
  const displayCurrency = useUserSettingsStore((state) => state.preferences.displayCurrency);
  const fxRates = useUserSettingsStore((state) => state.fxRates);

  return useMemo(() => {
    const convertMoney = (value: number | null | undefined, sourceCurrency: string | null | undefined = "USD") =>
      convertCurrencyAmount(value, sourceCurrency, displayCurrency, fxRates);

    const formatMoney = (
      value: number | null | undefined,
      sourceCurrency: string | null | undefined = "USD",
      options?: Intl.NumberFormatOptions
    ) => formatCurrencyValue(convertMoney(value, sourceCurrency), displayCurrency, options);

    const formatCompactMoney = (
      value: number | null | undefined,
      sourceCurrency: string | null | undefined = "USD",
      maximumFractionDigits = 1
    ) => formatCompactCurrencyValue(convertMoney(value, sourceCurrency), displayCurrency, maximumFractionDigits);

    return {
      displayCurrency,
      fxRates,
      convertMoney,
      formatMoney,
      formatCompactMoney,
    };
  }, [displayCurrency, fxRates]);
}
