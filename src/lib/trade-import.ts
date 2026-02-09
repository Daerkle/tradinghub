export type TradeSide = "long" | "short";

export interface ImportableTrade {
  symbol: string;
  side: TradeSide;
  entryPrice: number;
  exitPrice: number;
  entryTime: Date;
  exitTime: Date;
  quantity: number;
  pnl: number;
  commission: number;
  setup?: string;
  notes?: string;
  screenshots?: string[];
  mfe?: number;
  mae?: number;
  importSource?: string;
  importHash?: string;
}

export interface TradePreview extends ImportableTrade {
  isValid: boolean;
}

export interface ParseTradesResult {
  trades: TradePreview[];
  warnings: string[];
  detectedDelimiter: string;
  detectedFormat: "generic" | "interactiveBrokers";
}

interface IBExecution {
  symbol: string;
  time: Date;
  signedQuantity: number; // buy=+, sell=-
  price: number;
  commission: number; // positive cost
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

function normalizeHeader(header: string): string {
  return stripBom(header)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function getFirstNonEmptyLine(text: string): string | null {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim()) return line;
  }
  return null;
}

function parseSepLine(line: string): string | null {
  const match = line.match(/^\s*sep\s*=\s*(.)\s*$/i);
  return match?.[1] ?? null;
}

function countDelimiterFields(line: string, delimiter: string): number {
  let fields = 1;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\"") {
      const next = line[i + 1];
      if (inQuotes && next === "\"") {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delimiter) fields++;
  }
  return fields;
}

function detectDelimiter(text: string): string {
  const firstLine = getFirstNonEmptyLine(stripBom(text));
  if (!firstLine) return ",";

  const sep = parseSepLine(firstLine);
  if (sep) return sep;

  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestFields = 0;

  for (const d of candidates) {
    const fields = countDelimiterFields(firstLine, d);
    if (fields > bestFields) {
      bestFields = fields;
      best = d;
    }
  }

  return bestFields >= 2 ? best : ",";
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === "\"") {
        const next = text[i + 1];
        if (next === "\"") {
          field += "\"";
          i++;
        } else {
          inQuotes = false;
        }
        continue;
      }
      field += ch;
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
      continue;
    }

    if (ch === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      continue;
    }

    if (ch === "\r") {
      // handle CRLF
      if (text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      continue;
    }

    field += ch;
  }

  row.push(field);
  rows.push(row);

  return rows;
}

function isValidDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}

function buildLocalDate(
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0
): Date | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second)
  ) {
    return null;
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (!isValidDate(date)) return null;

  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null;
  }

  return date;
}

function parseDateWithOptionalTime(
  year: number,
  month: number,
  day: number,
  hh: string | undefined,
  mm: string | undefined,
  ss: string | undefined,
  tzRaw: string | undefined
): Date | null {
  const hour = hh ? Number.parseInt(hh, 10) : 0;
  const minute = mm ? Number.parseInt(mm, 10) : 0;
  const second = ss ? Number.parseInt(ss, 10) : 0;

  const tz = (tzRaw || "").trim();
  if (tz) {
    const normalizedTz = tz.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
    const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}${normalizedTz}`;
    const zoned = new Date(iso);
    if (isValidDate(zoned)) return zoned;
  }

  return buildLocalDate(year, month, day, hour, minute, second);
}

function parseSlashDatePart(aRaw: string, bRaw: string, yearRaw: string): { year: number; month: number; day: number } | null {
  const a = Number.parseInt(aRaw, 10);
  const b = Number.parseInt(bRaw, 10);
  const year = Number.parseInt(yearRaw, 10);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(year)) return null;

  if (a > 31 || b > 31 || a < 1 || b < 1) return null;

  // Prefer day/month for ambiguous values because the UI/localization is de-DE.
  // If one side cannot be a month, infer automatically.
  if (a > 12 && b <= 12) return { year, month: b, day: a };
  if (b > 12 && a <= 12) return { year, month: a, day: b };
  return { year, month: b, day: a };
}

function parseDateTime(value: string | undefined): Date | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  // IB/TWS compact formats like "20260204;110728", "20260204 110728", "20260204;1107"
  const compactWithSeconds = raw.match(
    /^(\d{4})(\d{2})(\d{2})[;\sT]?(\d{2})(\d{2})(\d{2})$/
  );
  if (compactWithSeconds) {
    const [, yyyy, mm, dd, hh, min, ss] = compactWithSeconds;
    const d = parseDateWithOptionalTime(
      Number.parseInt(yyyy, 10),
      Number.parseInt(mm, 10),
      Number.parseInt(dd, 10),
      hh,
      min,
      ss,
      undefined
    );
    if (d) return d;
  }

  const compactWithoutSeconds = raw.match(
    /^(\d{4})(\d{2})(\d{2})[;\sT]?(\d{2})(\d{2})$/
  );
  if (compactWithoutSeconds) {
    const [, yyyy, mm, dd, hh, min] = compactWithoutSeconds;
    const d = parseDateWithOptionalTime(
      Number.parseInt(yyyy, 10),
      Number.parseInt(mm, 10),
      Number.parseInt(dd, 10),
      hh,
      min,
      "00",
      undefined
    );
    if (d) return d;
  }

  // Normalize common "YYYY-MM-DD HH:mm:ss" variants to ISO-ish
  const normalized = raw
    .replace(/\s+/g, " ")
    .replace(/[;,]\s*/g, " ")
    .trim();

  const parts = normalized.split(" ");
  if (parts.length >= 2) {
    const [datePart, timePart, tzPart] = parts;

    // YYYY-MM-DD
    const ymdMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const timeMatch = timePart.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (ymdMatch && timeMatch) {
      const d = parseDateWithOptionalTime(
        Number.parseInt(ymdMatch[1], 10),
        Number.parseInt(ymdMatch[2], 10),
        Number.parseInt(ymdMatch[3], 10),
        timeMatch[1],
        timeMatch[2],
        timeMatch[3] ?? "00",
        tzPart
      );
      if (d) return d;
    }

    // DD.MM.YYYY
    const dotMatch = datePart.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (dotMatch && timeMatch) {
      const d = parseDateWithOptionalTime(
        Number.parseInt(dotMatch[3], 10),
        Number.parseInt(dotMatch[2], 10),
        Number.parseInt(dotMatch[1], 10),
        timeMatch[1],
        timeMatch[2],
        timeMatch[3] ?? "00",
        tzPart
      );
      if (d) return d;
    }

    // Slash format (DD/MM/YYYY or MM/DD/YYYY); defaults to DD/MM for ambiguous cases.
    const slashMatch = datePart.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (slashMatch && timeMatch) {
      const slashDate = parseSlashDatePart(slashMatch[1], slashMatch[2], slashMatch[3]);
      if (slashDate) {
        const d = parseDateWithOptionalTime(
          slashDate.year,
          slashDate.month,
          slashDate.day,
          timeMatch[1],
          timeMatch[2],
          timeMatch[3] ?? "00",
          tzPart
        );
        if (d) return d;
      }
    }
  }

  // Date without time
  const ymdOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdOnly) {
    const d = buildLocalDate(
      Number.parseInt(ymdOnly[1], 10),
      Number.parseInt(ymdOnly[2], 10),
      Number.parseInt(ymdOnly[3], 10)
    );
    if (d) return d;
  }

  const dotOnly = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotOnly) {
    const d = buildLocalDate(
      Number.parseInt(dotOnly[3], 10),
      Number.parseInt(dotOnly[2], 10),
      Number.parseInt(dotOnly[1], 10)
    );
    if (d) return d;
  }

  const slashOnly = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashOnly) {
    const slashDate = parseSlashDatePart(slashOnly[1], slashOnly[2], slashOnly[3]);
    if (slashDate) {
      const d = buildLocalDate(slashDate.year, slashDate.month, slashDate.day);
      if (d) return d;
    }
  }

  // Last fallback for RFC/ISO variants
  const parsed = new Date(raw);
  if (isValidDate(parsed)) return parsed;

  return null;
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  let raw = value.trim();
  if (!raw || raw === "-") return null;

  let isNegative = false;
  // Handle accounting negatives like "(123,45)"
  if (raw.startsWith("(") && raw.endsWith(")")) {
    isNegative = true;
    raw = raw.slice(1, -1);
  }

  raw = raw
    .replace(/\s+/g, "")
    .replace(/[€$£]/g, "")
    .replace(/%/g, "");

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");

  // If both separators exist, decide which one is decimal by position
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      // "1.234,56" -> "1234.56"
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      // "1,234.56" -> "1234.56"
      raw = raw.replace(/,/g, "");
    }
  } else if (lastComma !== -1 && lastDot === -1) {
    const commaCount = (raw.match(/,/g) || []).length;
    const segments = raw.split(",");
    const decimalLike =
      commaCount === 1 &&
      (segments[1]?.length !== 3 || segments[0] === "0");

    if (decimalLike) {
      // "123,45" -> "123.45"
      raw = raw.replace(",", ".");
    } else {
      // "1,234" or "1,234,567" -> "1234" / "1234567"
      raw = raw.replace(/,/g, "");
    }
  } else {
    const dotCount = (raw.match(/\./g) || []).length;
    if (dotCount > 0) {
      const segments = raw.split(".");
      const decimalLike =
        dotCount === 1 &&
        (segments[1]?.length !== 3 || segments[0] === "0");
      if (!decimalLike) {
        // "1.234" / "1.234.567" -> "1234" / "1234567"
        raw = raw.replace(/\./g, "");
      }
    }

    // Keep fallback comma cleanup for malformed mixed input
    raw = raw.replace(/,/g, "");
  }

  const num = Number.parseFloat(raw);
  if (!Number.isFinite(num)) return null;
  return isNegative ? -num : num;
}

function parseIBNumber(value: string | undefined): number | null {
  if (!value) return null;

  let raw = value.trim();
  if (!raw || raw === "-") return null;

  let isNegative = false;
  if (raw.startsWith("(") && raw.endsWith(")")) {
    isNegative = true;
    raw = raw.slice(1, -1);
  }

  // IB exports use "." as decimal separator.
  // Remove thousands separators and currency symbols defensively.
  raw = raw
    .replace(/\s+/g, "")
    .replace(/[€$£%]/g, "")
    .replace(/,/g, "");

  const num = Number.parseFloat(raw);
  if (!Number.isFinite(num)) return null;
  return isNegative ? -num : num;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function buildTradeImportHash(
  trade: Pick<ImportableTrade, "symbol" | "side" | "entryPrice" | "exitPrice" | "entryTime" | "exitTime" | "quantity">,
  source: string = "manual"
): string {
  return [
    source,
    trade.symbol.toUpperCase(),
    trade.side,
    trade.entryPrice.toFixed(6),
    trade.exitPrice.toFixed(6),
    trade.quantity.toFixed(8),
    trade.entryTime.toISOString(),
    trade.exitTime.toISOString(),
  ].join("|");
}

function buildHeaderIndex(headers: string[]): Map<string, number> {
  const index = new Map<string, number>();
  headers.forEach((h, i) => index.set(normalizeHeader(h), i));
  return index;
}

function getValue(row: string[], headerIndex: Map<string, number>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const idx = headerIndex.get(alias);
    if (idx !== undefined) return row[idx];
  }
  return undefined;
}

function looksLikeIBKR(headers: string[], hasTradesSection: boolean): boolean {
  if (hasTradesSection) return true;
  const keys = new Set(headers.map(normalizeHeader));
  return (
    keys.has("commfee") ||
    keys.has("tprice") ||
    keys.has("realizedpl") ||
    (
      keys.has("buysell") &&
      keys.has("quantity") &&
      keys.has("symbol") &&
      (keys.has("tprice") || keys.has("tradeprice") || keys.has("price")) &&
      (keys.has("datetime") || keys.has("date") || keys.has("tradetime"))
    )
  );
}

function parseIBKRExecutions(rows: string[][]): { executions: IBExecution[]; warnings: string[] } {
  const warnings: string[] = [];

  // Detect IB "Trades,Header,... / Trades,Data,..." structure
  let headerRow: string[] | null = null;
  let dataRows: string[][] = [];
  let hasTradesSection = false;

  for (const row of rows) {
    const c0 = (row[0] || "").trim().toLowerCase();
    const c1 = (row[1] || "").trim().toLowerCase();
    if (c0 === "trades" && c1 === "header") {
      headerRow = row.slice(2);
      hasTradesSection = true;
      break;
    }
  }

  if (hasTradesSection && headerRow) {
    dataRows = rows
      .filter((r) => (r[0] || "").trim().toLowerCase() === "trades" && (r[1] || "").trim().toLowerCase() === "data")
      .map((r) => r.slice(2));
  } else {
    headerRow = rows[0] || null;
    dataRows = rows.slice(1);
  }

  if (!headerRow || headerRow.length === 0) {
    return { executions: [], warnings: ["Keine Header-Zeile gefunden."] };
  }

  const headerIndex = buildHeaderIndex(headerRow);

  const executions: IBExecution[] = [];
  for (const row of dataRows) {
    const symbolRaw = getValue(row, headerIndex, ["symbol", "ticker", "underlyingsymbol"]);
    const timeRaw = getValue(row, headerIndex, ["datetime", "date", "tradetime", "tradetimeutc", "tradedatetime"]);
    const qtyRaw = getValue(row, headerIndex, ["quantity", "qty", "shares"]);
    const priceRaw = getValue(row, headerIndex, ["tprice", "tradeprice", "price"]);
    const commissionRaw = getValue(row, headerIndex, ["commfee", "commission", "fees", "comm"]);
    const buySellRaw = getValue(row, headerIndex, ["buysell", "side", "action"]);

    const symbol = (symbolRaw || "").trim().toUpperCase();
    if (!symbol) continue;

    const time = parseDateTime(timeRaw);
    if (!time) continue;

    const qtyNum = parseIBNumber(qtyRaw);
    if (!qtyNum || !Number.isFinite(qtyNum) || qtyNum === 0) continue;

    const price = parseIBNumber(priceRaw);
    if (!price || !Number.isFinite(price) || price <= 0) continue;

    const commissionParsed = parseIBNumber(commissionRaw);
    const commission = Math.abs(commissionParsed ?? 0);

    let signedQty = qtyNum;
    if (buySellRaw) {
      const bs = buySellRaw.trim().toLowerCase();
      const absQty = Math.abs(qtyNum);
      if (bs.startsWith("b")) signedQty = absQty;
      else if (bs.startsWith("s")) signedQty = -absQty;
    }

    executions.push({
      symbol,
      time,
      signedQuantity: signedQty,
      price,
      commission,
    });
  }

  if (executions.length === 0) {
    warnings.push("Keine IBKR-Trade-Zeilen gefunden. Prüfe, ob du den 'Trades'-Report exportiert hast.");
  }

  // Sort chronologically (important for aggregation)
  executions.sort((a, b) => a.time.getTime() - b.time.getTime());

  return { executions, warnings };
}

function buildTradesFromIBKRExecutions(executions: IBExecution[]): { trades: ImportableTrade[]; warnings: string[] } {
  const warnings: string[] = [];
  const EPS = 1e-9;

  type OpenState = {
    symbol: string;
    netQty: number;
    side: TradeSide;
    entryTime: Date;
    entryAvgPrice: number;
    commission: number;
    realizedPnl: number;
    exitNotional: number;
    exitQty: number;
  };

  const trades: ImportableTrade[] = [];

  const bySymbol = new Map<string, IBExecution[]>();
  for (const exec of executions) {
    const list = bySymbol.get(exec.symbol) || [];
    list.push(exec);
    bySymbol.set(exec.symbol, list);
  }

  for (const [symbol, execs] of bySymbol.entries()) {
    let state: OpenState | null = null;

    for (const exec of execs) {
      const signedQty = exec.signedQuantity;
      const qtyAbs = Math.abs(signedQty);
      if (qtyAbs === 0) continue;

      if (!state) {
        state = {
          symbol,
          netQty: signedQty,
          side: signedQty > 0 ? "long" : "short",
          entryTime: exec.time,
          entryAvgPrice: exec.price,
          commission: exec.commission,
          realizedPnl: 0,
          exitNotional: 0,
          exitQty: 0,
        };
        continue;
      }

      const sameDirection =
        (state.netQty > 0 && signedQty > 0) ||
        (state.netQty < 0 && signedQty < 0);

      if (sameDirection) {
        const oldAbs = Math.abs(state.netQty);
        const newAbs = oldAbs + qtyAbs;
        state.entryAvgPrice =
          newAbs > 0
            ? (state.entryAvgPrice * oldAbs + exec.price * qtyAbs) / newAbs
            : state.entryAvgPrice;
        state.netQty += signedQty;
        state.commission += exec.commission;
        continue;
      }

      // Reduce / close / flip
      const stateAbs = Math.abs(state.netQty);
      const closeQty = Math.min(stateAbs, qtyAbs);
      const openQty = qtyAbs - closeQty;
      const closesTrade = closeQty >= stateAbs - EPS;

      // Allocate commission proportionally when one execution both closes and opens
      const commissionClose = qtyAbs > 0 ? exec.commission * (closeQty / qtyAbs) : 0;
      const commissionOpen = exec.commission - commissionClose;

      // Realized PnL for the closing part (gross, fees handled separately)
      if (state.side === "long") {
        state.realizedPnl += (exec.price - state.entryAvgPrice) * closeQty;
      } else {
        state.realizedPnl += (state.entryAvgPrice - exec.price) * closeQty;
      }
      state.exitNotional += exec.price * closeQty;
      state.exitQty += closeQty;
      state.commission += commissionClose;

      if (closesTrade) {
        const exitPrice = state.exitQty > 0 ? state.exitNotional / state.exitQty : exec.price;
        const quantity = state.exitQty;
        const pnlNet = state.realizedPnl - state.commission;

        trades.push({
          symbol,
          side: state.side,
          entryPrice: state.entryAvgPrice,
          exitPrice,
          entryTime: state.entryTime,
          exitTime: exec.time,
          quantity,
          pnl: pnlNet,
          commission: state.commission,
        });

        state = null;

        // If we flipped in the same execution, open a new trade for the remainder
        if (openQty > EPS) {
          const newSignedQty = signedQty > 0 ? openQty : -openQty;
          state = {
            symbol,
            netQty: newSignedQty,
            side: newSignedQty > 0 ? "long" : "short",
            entryTime: exec.time,
            entryAvgPrice: exec.price,
            commission: commissionOpen,
            realizedPnl: 0,
            exitNotional: 0,
            exitQty: 0,
          };
        }
      } else {
        // Still in position (partial close)
        state.netQty += signedQty;
        state.commission += commissionOpen;
      }
    }

    if (state && Math.abs(state.netQty) > EPS) {
      warnings.push(`Offene Position ignoriert (kein Exit gefunden): ${symbol} (${state.netQty})`);
    }
  }

  return { trades, warnings };
}

function parseGenericTrades(rows: string[][]): TradePreview[] {
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  const headerIndex = buildHeaderIndex(headers);

  const results: TradePreview[] = [];

  for (const row of rows.slice(1)) {
    try {
      const symbol = (getValue(row, headerIndex, ["symbol", "ticker"]) || "").trim().toUpperCase();
      if (!symbol) continue;

      const sideRaw = (getValue(row, headerIndex, ["side", "direction"]) || "").trim().toLowerCase();
      const side: TradeSide = (sideRaw === "short" || sideRaw.includes("short") || sideRaw === "sell") ? "short" : "long";

      const entryPrice = parseNumber(getValue(row, headerIndex, ["entryprice", "entry", "open", "price"])) ?? 0;
      const exitPrice = parseNumber(getValue(row, headerIndex, ["exitprice", "exit", "close"])) ?? 0;

      const entryTime = parseDateTime(getValue(row, headerIndex, ["entrytime", "entrydate", "date", "time"])) ?? new Date("");
      const exitTime = parseDateTime(getValue(row, headerIndex, ["exittime", "exitdate", "closedate"])) ?? new Date("");

      const quantity = Math.abs(parseNumber(getValue(row, headerIndex, ["quantity", "qty", "shares"])) ?? 0);
      const commission = Math.abs(parseNumber(getValue(row, headerIndex, ["commission", "fees", "fee"])) ?? 0);

      let pnl = parseNumber(getValue(row, headerIndex, ["pnl", "profit", "pl"])) ?? 0;

      // Calculate PnL if not provided and we have entry/exit prices
      const pnlProvided = headerIndex.has("pnl") || headerIndex.has("profit") || headerIndex.has("pl");
      if (!pnlProvided && entryPrice > 0 && exitPrice > 0 && quantity > 0) {
        const multiplier = side === "long" ? 1 : -1;
        pnl = multiplier * (exitPrice - entryPrice) * quantity - commission;
      }

      const trade: TradePreview = {
        symbol,
        side,
        entryPrice,
        exitPrice,
        entryTime,
        exitTime,
        quantity,
        pnl,
        commission,
        setup: (getValue(row, headerIndex, ["setup"]) || undefined)?.trim() || undefined,
        notes: (getValue(row, headerIndex, ["notes", "note"]) || undefined)?.trim() || undefined,
        isValid: true,
      };

      trade.isValid =
        !!trade.symbol &&
        trade.entryPrice > 0 &&
        trade.exitPrice > 0 &&
        trade.quantity > 0 &&
        isValidDate(trade.entryTime) &&
        isValidDate(trade.exitTime);

      results.push(trade);
    } catch {
      // Skip invalid rows
    }
  }

  return results;
}

export function parseTradesFromText(
  text: string,
  broker?: string
): ParseTradesResult {
  const cleaned = stripBom(text).trim();
  const detectedDelimiter = detectDelimiter(cleaned);

  const rawRows = parseDelimited(cleaned, detectedDelimiter)
    .map((r) => r.map((c) => stripBom(c).trim()))
    .filter((r) => r.some((c) => c !== ""));

  // Drop leading "sep=;" line if present
  if (rawRows.length > 0 && parseSepLine(rawRows[0].join(detectedDelimiter))) {
    rawRows.shift();
  }

  if (rawRows.length < 2) {
    return {
      trades: [],
      warnings: ["Datei enthält keine Datenzeilen."],
      detectedDelimiter,
      detectedFormat: "generic",
    };
  }

  const hasTradesSection = rawRows.some(
    (r) => (r[0] || "").trim().toLowerCase() === "trades" && (r[1] || "").trim().toLowerCase() === "header"
  );

  const headerCandidates = rawRows[0] || [];
  const shouldTryIB =
    broker === "interactiveBrokers" ||
    looksLikeIBKR(headerCandidates, hasTradesSection);

  if (shouldTryIB) {
    const { executions, warnings: execWarnings } = parseIBKRExecutions(rawRows);
    const { trades, warnings: tradeWarnings } = buildTradesFromIBKRExecutions(executions);

    const previews: TradePreview[] = trades.map((t) => ({
      ...t,
      isValid:
        !!t.symbol &&
        t.entryPrice > 0 &&
        t.exitPrice > 0 &&
        t.quantity > 0 &&
        isValidDate(t.entryTime) &&
        isValidDate(t.exitTime),
    }));

    return {
      trades: previews,
      warnings: [...execWarnings, ...tradeWarnings],
      detectedDelimiter,
      detectedFormat: "interactiveBrokers",
    };
  }

  return {
    trades: parseGenericTrades(rawRows),
    warnings: [],
    detectedDelimiter,
    detectedFormat: "generic",
  };
}

export function splitIntoImportBatches(trades: ImportableTrade[], batchSize: number = 50): ImportableTrade[][] {
  const size = Math.max(1, Math.min(batchSize, 200));
  return chunkArray(trades, size);
}
