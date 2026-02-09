/**
 * Interactive Brokers Flex Query API Client
 *
 * 2-Step API:
 * 1. SendRequest – sends token + queryId, gets back a referenceCode
 * 2. GetStatement – polls with referenceCode until XML is ready
 *
 * Docs: https://www.interactivebrokers.com/en/software/am/am/reports/activityflexqueries.htm
 */

const IB_FLEX_BASE = "https://gdcdyn.interactivebrokers.com/Universal/servlet";
const SEND_REQUEST_URL = `${IB_FLEX_BASE}/FlexStatementService.SendRequest`;
const GET_STATEMENT_URL = `${IB_FLEX_BASE}/FlexStatementService.GetStatement`;

const MAX_POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 2000;

export interface FlexQueryTrade {
  symbol: string;
  underlyingSymbol?: string;
  assetCategory: string;
  currency: string;
  dateTime: string;
  quantity: number;
  tradePrice: number;
  proceeds: number;
  commission: number;
  realizedPL: number;
  buySell: string;
  putCall?: string;
  strike?: number;
  expiry?: string;
  description?: string;
}

export interface FlexQueryResult {
  trades: FlexQueryTrade[];
  accountId: string;
  fromDate: string;
  toDate: string;
  generatedAt: string;
}

export interface FlexQueryError {
  code: string;
  message: string;
}

/**
 * Step 1: Send request to IB to generate the Flex statement.
 * Returns a referenceCode used to poll for the result.
 */
export async function sendFlexRequest(
  token: string,
  queryId: string,
  signal?: AbortSignal
): Promise<{ referenceCode: string } | { error: FlexQueryError }> {
  const url = `${SEND_REQUEST_URL}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`;

  const response = await fetch(url, { signal });
  if (!response.ok) {
    return { error: { code: "HTTP_ERROR", message: `HTTP ${response.status}: ${response.statusText}` } };
  }

  const xml = await response.text();

  // Success: <FlexStatementResponse timestamp="..."><Status>Success</Status><ReferenceCode>123456</ReferenceCode></FlexStatementResponse>
  const statusMatch = xml.match(/<Status>([^<]+)<\/Status>/);
  const status = statusMatch?.[1]?.trim();

  if (status === "Success") {
    const refMatch = xml.match(/<ReferenceCode>([^<]+)<\/ReferenceCode>/);
    const referenceCode = refMatch?.[1]?.trim();
    if (referenceCode) {
      return { referenceCode };
    }
    return { error: { code: "NO_REF", message: "Success response but no ReferenceCode found" } };
  }

  // Error: <FlexStatementResponse><Status>Fail</Status><ErrorCode>1019</ErrorCode><ErrorMessage>...</ErrorMessage></FlexStatementResponse>
  const errorCodeMatch = xml.match(/<ErrorCode>([^<]+)<\/ErrorCode>/);
  const errorMsgMatch = xml.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);

  return {
    error: {
      code: errorCodeMatch?.[1]?.trim() || "UNKNOWN",
      message: errorMsgMatch?.[1]?.trim() || `Unexpected status: ${status || "empty"}`,
    },
  };
}

/**
 * Step 2: Poll IB for the generated statement until ready.
 */
export async function getFlexStatement(
  referenceCode: string,
  token: string,
  signal?: AbortSignal
): Promise<{ xml: string } | { error: FlexQueryError }> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (signal?.aborted) {
      return { error: { code: "ABORTED", message: "Request was aborted" } };
    }

    const url = `${GET_STATEMENT_URL}?q=${encodeURIComponent(referenceCode)}&t=${encodeURIComponent(token)}&v=3`;
    const response = await fetch(url, { signal });

    if (!response.ok) {
      return { error: { code: "HTTP_ERROR", message: `HTTP ${response.status}: ${response.statusText}` } };
    }

    const xml = await response.text();

    // Check if it's an XML status response (statement not ready yet)
    const statusMatch = xml.match(/<Status>([^<]+)<\/Status>/);
    const status = statusMatch?.[1]?.trim();

    if (status === "Warn") {
      // Statement still being generated, wait and retry
      const errorCodeMatch = xml.match(/<ErrorCode>([^<]+)<\/ErrorCode>/);
      const errorCode = errorCodeMatch?.[1]?.trim();

      // ErrorCode 1019 = statement generating, try again
      if (errorCode === "1019") {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }
    }

    if (status === "Fail") {
      const errorCodeMatch = xml.match(/<ErrorCode>([^<]+)<\/ErrorCode>/);
      const errorMsgMatch = xml.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
      return {
        error: {
          code: errorCodeMatch?.[1]?.trim() || "UNKNOWN",
          message: errorMsgMatch?.[1]?.trim() || "Statement generation failed",
        },
      };
    }

    // If it doesn't contain a <Status> tag, it's likely the actual statement XML
    if (!statusMatch) {
      return { xml };
    }

    // If status is Success but full statement XML, return it
    if (status === "Success" || xml.includes("<FlexQueryResponse")) {
      return { xml };
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return { error: { code: "TIMEOUT", message: `Statement not ready after ${MAX_POLL_ATTEMPTS} attempts` } };
}

/**
 * Parse IB Flex Query XML into FlexQueryTrade objects.
 */
export function parseFlexQueryXML(xml: string): FlexQueryResult {
  const trades: FlexQueryTrade[] = [];

  // Extract account info
  const accountMatch = xml.match(/accountId="([^"]+)"/);
  const fromMatch = xml.match(/fromDate="([^"]+)"/);
  const toMatch = xml.match(/toDate="([^"]+)"/);
  const genMatch = xml.match(/whenGenerated="([^"]+)"/);

  // Parse <Trade ...> elements
  const tradeRegex = /<Trade\s[^>]*\/>/g;
  let match: RegExpExecArray | null;

  while ((match = tradeRegex.exec(xml)) !== null) {
    const el = match[0];
    const attr = (name: string): string => {
      const m = el.match(new RegExp(`${name}="([^"]*)"`));
      return m?.[1] ?? "";
    };

    const assetCategory = attr("assetCategory");
    // Only process Stocks and Options
    if (assetCategory !== "STK" && assetCategory !== "OPT") continue;

    const quantityRaw = parseFloat(attr("quantity"));
    const buySell = attr("buySell");

    trades.push({
      symbol: attr("symbol"),
      underlyingSymbol: attr("underlyingSymbol") || undefined,
      assetCategory,
      currency: attr("currency"),
      dateTime: attr("dateTime"),
      quantity: Math.abs(quantityRaw),
      tradePrice: parseFloat(attr("tradePrice")) || 0,
      proceeds: parseFloat(attr("proceeds")) || 0,
      commission: parseFloat(attr("ibCommission")) || parseFloat(attr("commission")) || 0,
      realizedPL: parseFloat(attr("fifoPnlRealized")) || parseFloat(attr("realizedPnl")) || 0,
      buySell,
      putCall: attr("putCall") || undefined,
      strike: parseFloat(attr("strike")) || undefined,
      expiry: attr("expiry") || undefined,
      description: attr("description") || undefined,
    });
  }

  return {
    trades,
    accountId: accountMatch?.[1] || "",
    fromDate: fromMatch?.[1] || "",
    toDate: toMatch?.[1] || "",
    generatedAt: genMatch?.[1] || "",
  };
}

/**
 * Map IB error codes to user-friendly German messages.
 */
export function getFlexErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    "1003": "Token ungültig. Bitte überprüfe deinen Flex Query Token.",
    "1004": "Query ID ungültig. Bitte überprüfe deine Flex Query ID.",
    "1005": "Ungültiger Token. Prüfe, ob der Token in deinem IB-Konto korrekt konfiguriert ist.",
    "1006": "Zu viele Anfragen. Bitte warte einige Minuten und versuche es erneut.",
    "1007": "Fehler bei der Datenverarbeitung. Bitte versuche es erneut.",
    "1009": "Token nicht für diese Query berechtigt. Prüfe die Token-Berechtigungen.",
    "1010": "FlexQueryResponse Fehler. Die Query könnte ungültig sein.",
    "1011": "Service vorübergehend nicht verfügbar. Bitte versuche es später erneut.",
    "1012": "IB-Server Wartung. Bitte versuche es später erneut.",
    "1018": "Kein Datenzugriff. Prüfe, ob Activity Flex Queries für dein Konto aktiviert sind.",
    "1019": "Statement wird noch generiert. Bitte warte einen Moment.",
    TIMEOUT: "Zeitüberschreitung. Das Statement konnte nicht rechtzeitig generiert werden.",
    ABORTED: "Anfrage abgebrochen.",
    HTTP_ERROR: "Verbindungsfehler zum IB-Server. Bitte prüfe deine Internetverbindung.",
    NO_REF: "Unerwartete Antwort vom IB-Server. Bitte versuche es erneut.",
    UNKNOWN: "Unbekannter Fehler. Bitte versuche es erneut.",
  };

  return messages[code] || `Fehler ${code}: Bitte versuche es erneut.`;
}
