import type { Request, Response, NextFunction } from 'express';
import type BetterSqlite3 from 'better-sqlite3';
type Database = BetterSqlite3.Database;
import jwt from 'jsonwebtoken';

let JWT_SECRET: string | undefined = process.env.JWT_SECRET;
let _db: Database | null = null;

export function setAuthDb(d: Database): void { _db = d; }

export interface AuthRequest extends Request {
  userId?: number;
}

/** Call at server startup to validate JWT_SECRET */
export function initAuth(): void {
  if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is required');
    process.exit(1);
  }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { userId: number; tokenVersion: number };
    // Verify token_version matches DB — revokes tokens issued before password change
    const user = _db!.prepare('SELECT token_version FROM users WHERE id = ?').get(payload.userId) as { token_version: number } | undefined;
    if (!user || user.token_version !== (payload.tokenVersion ?? 0)) {
      return res.status(401).json({ error: 'Token revoked' });
    }
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function signToken(userId: number, tokenVersion: number): string {
  return jwt.sign({ userId, tokenVersion }, JWT_SECRET!, { expiresIn: '7d' });
}
