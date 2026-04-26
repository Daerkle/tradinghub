import { DEFAULT_USER_PREFERENCES, sanitizeUserPreferences, type UserPreferences } from "@/lib/user-settings";

interface ParseUserRecord {
  objectId: string;
  username?: string;
  email?: string;
}

interface ParseSettingsRecord {
  objectId: string;
  preferences?: Partial<UserPreferences>;
}

function getParseServerURL(): string {
  const raw =
    process.env.INTERNAL_PARSE_SERVER_URL?.trim() ||
    process.env.NEXT_PUBLIC_PARSE_SERVER_URL?.trim() ||
    "http://localhost:28080/parse";
  return raw.endsWith("/parse") ? raw : `${raw.replace(/\/+$/, "")}/parse`;
}

function getParseHeaders(additional?: Record<string, string>): HeadersInit {
  const appId = process.env.NEXT_PUBLIC_PARSE_APP_ID || "tradenote123";
  const masterKey = process.env.MASTER_KEY || process.env.PARSE_MASTER_KEY || "tradenote123";

  return {
    "Content-Type": "application/json",
    "X-Parse-Application-Id": appId,
    "X-Parse-Master-Key": masterKey,
    ...additional,
  };
}

async function parseRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getParseServerURL()}${path}`, {
    ...init,
    headers: {
      ...getParseHeaders(),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : `Parse request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}

export async function getCurrentParseUser(sessionToken: string): Promise<ParseUserRecord> {
  return parseRequest<ParseUserRecord>("/users/me", {
    headers: {
      "X-Parse-Session-Token": sessionToken,
    },
  });
}

export async function updateParseUser(
  userId: string,
  updates: Record<string, unknown>
): Promise<ParseUserRecord> {
  return parseRequest<ParseUserRecord>(`/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

export async function verifyParsePassword(username: string, password: string): Promise<void> {
  const params = new URLSearchParams({ username, password });
  await parseRequest(`/login?${params.toString()}`);
}

export async function getUserSettingsObject(userId: string): Promise<ParseSettingsRecord | null> {
  const payload = await parseRequest<{ results?: ParseSettingsRecord[] }>(
    `/classes/user_settings?limit=1&where=${encodeURIComponent(JSON.stringify({
      user: {
        __type: "Pointer",
        className: "_User",
        objectId: userId,
      },
    }))}`
  );

  return payload.results?.[0] ?? null;
}

export async function upsertUserSettingsObject(
  userId: string,
  preferences: Partial<UserPreferences>
): Promise<ParseSettingsRecord> {
  const existing = await getUserSettingsObject(userId);
  const mergedPreferences = sanitizeUserPreferences({
    ...(existing?.preferences || DEFAULT_USER_PREFERENCES),
    ...preferences,
  });

  const body = JSON.stringify(existing
    ? { preferences: mergedPreferences }
    : {
        user: {
          __type: "Pointer",
          className: "_User",
          objectId: userId,
        },
        preferences: mergedPreferences,
        ACL: {
          [userId]: { read: true, write: true },
        },
      });

  if (existing?.objectId) {
    return parseRequest<ParseSettingsRecord>(`/classes/user_settings/${existing.objectId}`, {
      method: "PUT",
      body,
    });
  }

  return parseRequest<ParseSettingsRecord>("/classes/user_settings", {
    method: "POST",
    body,
  });
}
