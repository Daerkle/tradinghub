import path from "path";
import YahooFinance from "yahoo-finance2";
import { ExtendedCookieJar } from "yahoo-finance2/lib/cookieJar";
import { FileCookieStore } from "tough-cookie-file-store";
import type { Store } from "tough-cookie";
import { ensurePersistentDirSync } from "@/lib/persistent-storage";
import { createYahooProxyFetch } from "@/lib/proxy-fetch";

const cookieDir = ensurePersistentDirSync("yahoo");
const cookiePath = path.join(cookieDir, "yf-cookies.json");
const cookieStore = new FileCookieStore(cookiePath) as unknown as Store;
const cookieJar = new ExtendedCookieJar(cookieStore);

const yahooFinance = new YahooFinance({
  queue: { concurrency: 1 },
  suppressNotices: ["yahooSurvey"],
  fetch: createYahooProxyFetch(),
  cookieJar,
});

export function getYahooFinance(): InstanceType<typeof YahooFinance> {
  return yahooFinance;
}
