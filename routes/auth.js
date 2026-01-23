// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { findUserByIdOrName } = require('../utils/userHelper');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Login with username and password
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Check if username and password are provided
    if (!username || !password) {
      return res.status(400).json({ 
        status: "error",
        message: "Username and password are required" 
      });
    }
    
    // Find user by name
    const user = await findUserByIdOrName(username);
    
    if (!user) {
      return res.status(401).json({ 
        status: "error",
        message: "Invalid username or password" 
      });
    }
    
    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        status: "error",
        message: "Invalid username or password" 
      });
    }

    // Generate JWT token (expires in 24 hours)
    const token = jwt.sign({ 
      userId: user.name, // Use name for compatibility
      role: user.role, // Use 'role' to match middleware check
      userName: user.name
    }, JWT_SECRET, { expiresIn: "24h" });
    
    res.json({ 
      status: "success", 
      token,
      user: {
        name: user.name,
        role: user.role,
        email: user.email
      }
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

module.exports = router;