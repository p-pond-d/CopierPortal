const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'copier_jwt_secret_key_2026_secure';

const auth = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  }

  let tokenStr = token;
  if (token.startsWith('Bearer ')) {
    tokenStr = token.slice(7);
  }

  try {
    const decoded = jwt.verify(tokenStr, JWT_SECRET);
    req.role = decoded.role;
    req.username = decoded.username;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'โทเค็นไม่ถูกต้องหรือหมดอายุ' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.role !== 'admin') {
    return res.status(403).json({ error: 'สิทธิ์การใช้งานไม่เพียงพอ (เฉพาะผู้ดูแลระบบเท่านั้น)' });
  }
  next();
};

module.exports = {
  auth,
  adminOnly,
  JWT_SECRET
};
