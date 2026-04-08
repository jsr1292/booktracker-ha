import jwt from 'jsonwebtoken';
let JWT_SECRET = process.env.JWT_SECRET;
/** Call at server startup to validate JWT_SECRET */
export function initAuth() {
    if (!JWT_SECRET) {
        console.error('FATAL: JWT_SECRET environment variable is required');
        process.exit(1);
    }
}
export function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = header.slice(7);
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.userId;
        next();
    }
    catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
}
export function signToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}
