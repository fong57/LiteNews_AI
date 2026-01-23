// middleware/auth.js (FULL CORRECT CODE)
const jwt = require('jsonwebtoken'); // Import JWT (install first: npm install jsonwebtoken)

// Use env var for JWT secret (or fallback for testing)
const JWT_SECRET = process.env.JWT_SECRET;

// ✅ Valid protect middleware function (DO NOT rename or break this!)
const protect = async (req, res, next) => {
  let token;

  // Extract token from Authorization header (format: Bearer <token>)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token (split "Bearer <token>" → ["Bearer", "token"] → take index 1)
      token = req.headers.authorization.split(' ')[1];
      
      // Verify the token (throws error if invalid/expired)
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Attach decoded user data to request (optional, for future use)
      req.user = decoded;
      
      // Proceed to the next middleware/route handler
      next();
    } catch (error) {
      // Token invalid/expired
      res.status(401).json({
        status: "error",
        message: "Not authorized: Invalid or expired token"
      });
    }
  }

  // No token provided
  if (!token) {
    res.status(401).json({
      status: "error",
      message: "Not authorized: No token provided"
    });
  }
};

// Admin-only middleware
const adminOnly = async (req, res, next) => {
  // Check for role in both possible locations (role or userRole for backward compatibility)
  const userRole = req.user?.role || req.user?.userRole;
  
  if (!req.user || userRole !== 'ADMIN') {
    return res.status(403).json({
      status: "error",
      message: "Access denied: Admin privileges required"
    });
  }
  next();
};

// ✅ Export the protect function CORRECTLY (lowercase "protect" – match import!)
module.exports = { protect, adminOnly };