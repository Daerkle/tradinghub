export type OptionsBias = "call-skewed" | "put-skewed" | "balanced";

export interface OptionContractSnapshot {
  contractSymbol: string;
  side: "call" | "put";
  strike: number;
  expiration: string;
  daysToExpiration: number;
  bid: number;
  ask: number;
  lastPrice: number;
  mark: number;
  volume: number;
  openInterest: number;
  volumeOiRatio: number | null;
  impliedVolatilityPct: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  inTheMoney: boolean;
  distanceFromSpotPct: number | null;
  premiumVolumeUsd: number;
  gammaExposureEstimate: number | null;
}

export interface OptionExpirySummary {
  expiration: string;
  daysToExpiration: number;
  contractCount: number;
  totalCallOi: number;
  totalPutOi: number;
  totalCallVolume: number;
  totalPutVolume: number;
  putCallOiRatio: number | null;
  putCallVolumeRatio: number | null;
  maxPain: number | null;
  callWall: number | null;
  putWall: number | null;
  atmIvPct: number | null;
  skewPct: number | null;
  netGexEstimate: number | null;
}

export interface OptionStrikeLevel {
  strike: number;
  callOi: number;
  putOi: number;
  callVolume: number;
  putVolume: number;
  totalOi: number;
  netOi: number;
  distanceFromSpotPct: number | null;
  netGexEstimate: number | null;
}

export interface OptionsOverview {
  symbol: string;
  source: string;
  fetchedAt: string;
  underlyingPrice: number;
  currency: string;
  availableExpiries: number;
  trackedExpiries: number;
  horizonDays: number;
  nearestExpiry: string | null;
  bias: OptionsBias;
  summary: {
    totalCallOi: number;
    totalPutOi: number;
    totalCallVolume: number;
    totalPutVolume: number;
    putCallOiRatio: number | null;
    putCallVolumeRatio: number | null;
    callWall: number | null;
    putWall: number | null;
    maxPain: number | null;
    atmIvPct: number | null;
    skewPct: number | null;
    netGexEstimate: number | null;
    grossGexEstimate: number | null;
    expectedMoveUsd: number | null;
    expectedMovePct: number | null;
    gammaFlipZone: number | null;
    callOiConcentrationPct: number | null;
    putOiConcentrationPct: number | null;
  };
  expiries: OptionExpirySummary[];
  strikeLevels: OptionStrikeLevel[];
  hotContracts: OptionContractSnapshot[];
  sourceLinks: Array<{
    label: string;
    url: string;
  }>;
  disclaimer: string;
}
