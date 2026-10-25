import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Request } from 'express';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export interface Identity { id: string; username?: string; avatarUrl?: string | null; expiresAt: number; isGuest?:boolean; }
export const uuid = z.string().uuid();
export function testAuthEnabled(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.TEST_AUTH === 'true';
}
export function bearer(req: Request): string {
  const value = req.get('authorization');
  if (!value?.startsWith('Bearer ')) throw new HttpError(401, 'Bitte melde dich an.');
  return value.slice(7);
}
function expiry(token: string): number {
  try {
    const value = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof value.exp === 'number' ? value.exp * 1000 : Date.now() + 5 * 60_000;
  } catch { return Date.now() + 5 * 60_000; }
}
export async function authenticate(token: unknown, supabase: SupabaseClient | null): Promise<Identity> {
  if (typeof token !== 'string' || token.length > 16_384) throw new HttpError(401, 'Anmeldung erforderlich.');
  if (testAuthEnabled() && token.startsWith('test:')) {
    const [, id, username] = token.split(':');
    if (!uuid.safeParse(id).success || !/^[a-zA-Z0-9_]{3,24}$/.test(username ?? '')) throw new HttpError(401, 'Ungültige Testidentität.');
    return { id, username, expiresAt: Date.now() + 3600_000 };
  }
  if (!supabase) throw new HttpError(503, 'Die Anmeldung ist noch nicht eingerichtet.');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');
  const user: User = data.user;
  const expiresAt = expiry(token);
  if (expiresAt <= Date.now()) throw new HttpError(401, 'Deine Sitzung ist abgelaufen.');
  return { id: user.id, isGuest:!!user.is_anonymous, username: user.user_metadata?.full_name, avatarUrl: user.user_metadata?.avatar_url, expiresAt };
}

export function safeMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof z.ZodError) return 'Bitte überprüfe deine Eingaben.';
  if (error instanceof Error && error.name === 'GameError') return error.message;
  // PostgreSQL and network details can contain personal data. They never reach clients.
  return 'Die Aktion konnte nicht gespeichert werden. Bitte versuche es erneut.';
}
export function statusCode(error: unknown): number {
  if (error instanceof HttpError) return error.status;
  if (error instanceof z.ZodError) return 400;
  if (error instanceof Error && error.name === 'GameError') return 400;
  return 500;
}

/** Sliding windows are scoped to a verified identity, not a caller-supplied user id. */
export class WindowLimiter {
  private entries = new Map<string, { count: number; until: number }>();
  private cleanupAt = 0;
  take(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    if (now >= this.cleanupAt) {
      for (const [k, value] of this.entries) if (value.until <= now) this.entries.delete(k);
      this.cleanupAt = now + 60_000;
    }
    const value = this.entries.get(key);
    if (!value || value.until <= now) { this.entries.set(key, { count: 1, until: now + windowMs }); return; }
    if (value.count >= limit) throw new HttpError(429, 'Zu viele Aktionen. Bitte warte einen Moment.');
    value.count += 1;
  }
}
