import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is required');
    process.exit(1);
}
const JWT_SECRET_VALIDATED = JWT_SECRET;
export function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = header.slice(7);
    try {
        const payload = jwt.verify(token, JWT_SECRET_VALIDATED);
        req.userId = payload.userId;
        next();
    }
    catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
}
export function signToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET_VALIDATED, { expiresIn: '7d' });
}
