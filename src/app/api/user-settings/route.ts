import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentParseUser,
  getUserSettingsObject,
  updateParseUser,
  upsertUserSettingsObject,
  verifyParsePassword,
} from "@/lib/parse-rest";
import {
  DEFAULT_USER_PROFILE,
  DEFAULT_USER_PREFERENCES,
  sanitizeUserProfile,
  sanitizeUserPreferences,
} from "@/lib/user-settings";

export const dynamic = "force-dynamic";

function getSessionToken(request: NextRequest): string | null {
  const header = request.headers.get("x-parse-session-token");
  if (header && header.trim()) return header.trim();
  return null;
}

async function resolveCurrentUser(request: NextRequest) {
  const sessionToken = getSessionToken(request);
  if (!sessionToken) {
    throw new Error("Nicht authentifiziert");
  }

  const user = await getCurrentParseUser(sessionToken);
  if (!user.objectId) {
    throw new Error("User konnte nicht geladen werden");
  }

  return { sessionToken, user };
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await resolveCurrentUser(request);
    const settingsObject = await getUserSettingsObject(user.objectId);

    return NextResponse.json({
      profile: sanitizeUserProfile({
        username: user.username || DEFAULT_USER_PROFILE.username,
        email: user.email || DEFAULT_USER_PROFILE.email,
      }),
      preferences: sanitizeUserPreferences({
        ...DEFAULT_USER_PREFERENCES,
        ...(settingsObject?.preferences || {}),
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Settings konnten nicht geladen werden";
    const status = /authentifiziert/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await resolveCurrentUser(request);
    const body = await request.json();

    const nextProfile = sanitizeUserProfile(body?.profile);
    const nextPreferences = sanitizeUserPreferences(body?.preferences);

    if (!nextProfile.username) {
      return NextResponse.json({ error: "Benutzername darf nicht leer sein." }, { status: 400 });
    }

    if (!nextProfile.email) {
      return NextResponse.json({ error: "E-Mail darf nicht leer sein." }, { status: 400 });
    }

    const currentPassword = typeof body?.password?.currentPassword === "string" ? body.password.currentPassword : "";
    const newPassword = typeof body?.password?.newPassword === "string" ? body.password.newPassword : "";

    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Für ein neues Passwort ist das aktuelle Passwort erforderlich." }, { status: 400 });
      }

      await verifyParsePassword(user.username || nextProfile.username, currentPassword);
    }

    const updatedUser = await updateParseUser(user.objectId, {
      username: nextProfile.username,
      email: nextProfile.email,
      ...(newPassword ? { password: newPassword } : {}),
    });

    await upsertUserSettingsObject(user.objectId, nextPreferences);

    return NextResponse.json({
      profile: sanitizeUserProfile({
        username: updatedUser.username || nextProfile.username,
        email: updatedUser.email || nextProfile.email,
      }),
      preferences: nextPreferences,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Settings konnten nicht gespeichert werden";
    const status = /authentifiziert/i.test(message) ? 401 : /Passwort|Benutzername|E-Mail/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
