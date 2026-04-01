import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'book-tracker-dev-secret-change-in-production';
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
