// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Login to get a JWT token (password-only, matches JWT_SECRET)
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    // Check if password is provided
    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }
    
    // Check if password matches JWT_SECRET
    if (password !== JWT_SECRET) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Generate JWT token (expires in 1 hour)
    // Use a fixed admin userId since it's a single admin user
    const token = jwt.sign({ userId: 'admin' }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ status: "success", token });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

module.exports = router;