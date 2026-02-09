import { NextRequest, NextResponse } from "next/server";
import {
  sendFlexRequest,
  getFlexStatement,
  parseFlexQueryXML,
  getFlexErrorMessage,
} from "@/lib/ib-flex-query";

const REQUEST_TIMEOUT_MS = 60_000; // 60s total timeout

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token: bodyToken, queryId: bodyQueryId, action } = body;
    const token = typeof bodyToken === "string" && bodyToken.trim().length > 0
      ? bodyToken.trim()
      : (process.env.IB_FLEX_TOKEN || "").trim();
    const queryId = typeof bodyQueryId === "string" && bodyQueryId.trim().length > 0
      ? bodyQueryId.trim()
      : (process.env.IB_FLEX_QUERY_ID || "").trim();

    if (!token || typeof token !== "string" || token.length < 10) {
      return NextResponse.json(
        { error: "Ungültiger Token. Mindestens 10 Zeichen erwartet." },
        { status: 400 }
      );
    }

    if (!queryId || typeof queryId !== "string") {
      return NextResponse.json(
        { error: "Ungültige Query ID." },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      // Step 1: Send request to IB
      const sendResult = await sendFlexRequest(token, queryId, controller.signal);

      if ("error" in sendResult) {
        return NextResponse.json(
          { error: getFlexErrorMessage(sendResult.error.code), code: sendResult.error.code },
          { status: 502 }
        );
      }

      // For test action, just confirm the connection works
      if (action === "test") {
        return NextResponse.json({
          success: true,
          message: "Verbindung erfolgreich! Flex Query ist korrekt konfiguriert.",
          referenceCode: sendResult.referenceCode,
        });
      }

      // Step 2: Poll for statement
      const statementResult = await getFlexStatement(
        sendResult.referenceCode,
        token,
        controller.signal
      );

      if ("error" in statementResult) {
        return NextResponse.json(
          { error: getFlexErrorMessage(statementResult.error.code), code: statementResult.error.code },
          { status: 502 }
        );
      }

      // Step 3: Parse XML into trade objects
      const result = parseFlexQueryXML(statementResult.xml);

      return NextResponse.json({
        success: true,
        ...result,
        tradeCount: result.trades.length,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Zeitüberschreitung bei der IB-Anfrage. Bitte versuche es erneut." },
        { status: 504 }
      );
    }

    console.error("Flex Query API error:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
