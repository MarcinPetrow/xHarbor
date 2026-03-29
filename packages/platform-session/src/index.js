import crypto from "node:crypto";
import { SqliteStateStore } from "@xharbor/sqlite-store";

const SESSION_COOKIE = "xharbor_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const SESSION_PRESENCE = ["online", "brb"];

export class SessionStore {
  constructor(filePath) {
    this.fileStore = new SqliteStateStore(filePath, "sessions");
  }

  async loadState() {
    const state = await this.fileStore.loadOr({ sessions: {} });
    const changed = this.normalizeSessions(state);
    if (changed) {
      await this.fileStore.save(state);
    }
    return state;
  }

  async createSession(userID) {
    const state = await this.loadState();
    const now = new Date();
    const token = crypto.randomUUID();
    state.sessions[token] = {
      userID,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      presence: "online"
    };
    this.pruneExpiredSessions(state, now);
    await this.fileStore.save(state);
    return token;
  }

  async updateSessionPresence(token, presence) {
    if (!SESSION_PRESENCE.includes(presence)) {
      throw new Error(`Unknown session presence: ${presence}`);
    }

    const state = await this.loadState();
    this.pruneExpiredSessions(state, new Date());
    if (!token || !state.sessions[token]) {
      return null;
    }

    state.sessions[token].presence = presence;
    await this.fileStore.save(state);
    return { token, ...state.sessions[token] };
  }

  async deleteSession(token) {
    const state = await this.loadState();
    this.pruneExpiredSessions(state, new Date());
    delete state.sessions[token];
    await this.fileStore.save(state);
  }

  async deleteSessionsForUser(userID) {
    const state = await this.loadState();
    this.pruneExpiredSessions(state, new Date());
    for (const [token, session] of Object.entries(state.sessions)) {
      if (session.userID === userID) {
        delete state.sessions[token];
      }
    }
    await this.fileStore.save(state);
  }

  async listSessions() {
    const state = await this.loadState();
    const changed = this.pruneExpiredSessions(state, new Date());
    if (changed) {
      await this.fileStore.save(state);
    }
    return Object.entries(state.sessions).map(([token, session]) => ({
      token,
      ...session
    }));
  }

  async getSession(token) {
    const state = await this.loadState();
    const now = new Date();
    const changed = this.pruneExpiredSessions(state, now);
    const session = token ? state.sessions[token] ?? null : null;

    if (!session) {
      if (changed) {
        await this.fileStore.save(state);
      }
      return null;
    }

    if (this.isExpired(session, now)) {
      delete state.sessions[token];
      await this.fileStore.save(state);
      return null;
    }

    return session;
  }

  pruneExpiredSessions(state, now = new Date()) {
    let changed = false;
    for (const [token, session] of Object.entries(state.sessions)) {
      if (this.isExpired(session, now)) {
        delete state.sessions[token];
        changed = true;
      }
    }
    return changed;
  }

  isExpired(session, now = new Date()) {
    if (!session?.expiresAt) return false;
    return new Date(session.expiresAt).getTime() <= now.getTime();
  }

  normalizeSessions(state) {
    let changed = false;

    for (const session of Object.values(state.sessions)) {
      if (!session.expiresAt && session.createdAt) {
        session.expiresAt = new Date(new Date(session.createdAt).getTime() + SESSION_TTL_MS).toISOString();
        changed = true;
      }
      if (!session.presence || !SESSION_PRESENCE.includes(session.presence)) {
        session.presence = "online";
        changed = true;
      }
    }

    if (this.pruneExpiredSessions(state, new Date())) {
      changed = true;
    }

    return changed;
  }
}

export function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((entry) => {
      const [key, ...rest] = entry.trim().split("=");
      return [key, decodeURIComponent(rest.join("="))];
    })
  );
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}

export function makeSessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function isKnownSessionPresence(value) {
  return SESSION_PRESENCE.includes(value);
}
