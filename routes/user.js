// routes/user.js
const express = require('express');
const mongoose = require('mongoose'); 
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const { findUserByIdOrName } = require('../utils/userHelper');

const router = express.Router();

// Apply protection to all routes
router.use(protect);

// 2. 编写所有用户相关的路由（注意：路径去掉/api/users前缀，因为主文件会统一挂载）

// Get current user info
router.get('/me', async (req, res) => {
  try {
    const user = await findUserByIdOrName(req.user.userId);
    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found"
      });
    }
    
    // Don't send password
    const userData = user.toObject();
    delete userData.password;
    
    res.status(200).json({
      status: "success",
      data: userData
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to get user: " + err.message
    });
  }
});

// Get all users (admin only)
router.get('/', adminOnly, async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.status(200).json({
      status: "success",
      count: users.length,
      data: users
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to fetch users: " + err.message
    });
  }
});

// 🔹 获取单个用户（GET /api/users/:userId）
router.get('/:userId', async (req, res) => {
  try {
    // 校验ID格式
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({
        status: "error",
        message: "用户ID格式错误"
      });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "用户不存在"
      });
    }

    res.status(200).json({
      status: "success",
      data: user
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "查询单个用户失败：" + err.message
    });
  }
});

// Create new user (admin only)
router.post('/', adminOnly, async (req, res) => {
  try {
    const { name, password, role = 'USER', email } = req.body;
    
    if (!name || !password) {
      return res.status(400).json({
        status: "error",
        message: "Name and password are required"
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = await User.create({ 
      name, 
      password: hashedPassword,
      role: role.toUpperCase(),
      email
    });

    // Don't send password
    const userData = newUser.toObject();
    delete userData.password;

    res.status(201).json({
      status: "success",
      message: "User created successfully",
      data: userData
    });
  } catch (err) {
    res.status(400).json({
      status: "error",
      message: "Failed to create user: " + err.message
    });
  }
});

// Update user (admin only, or user can update themselves)
router.put('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = await findUserByIdOrName(req.user.userId);
    const targetUser = await findUserByIdOrName(userId);
    
    if (!targetUser) {
      return res.status(404).json({
        status: "error",
        message: "User not found"
      });
    }
    
    // Check permissions: admin can update anyone, users can only update themselves
    const isAdmin = currentUser.role === 'ADMIN';
    const isSelf = targetUser.name === currentUser.name;
    
    if (!isAdmin && !isSelf) {
      return res.status(403).json({
        status: "error",
        message: "Access denied: You can only update your own profile"
      });
    }
    
    const { name, password, role, email } = req.body;
    const updateData = {};
    
    if (name) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    
    // Only admin can change role
    if (role && isAdmin) {
      updateData.role = role.toUpperCase();
    }
    
    // Hash password if provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await User.findByIdAndUpdate(
      targetUser._id,
      updateData,
      { new: true, runValidators: true }
    );

    // Don't send password
    const userData = updatedUser.toObject();
    delete userData.password;

    res.status(200).json({
      status: "success",
      message: "User updated successfully",
      data: userData
    });
  } catch (err) {
    res.status(400).json({
      status: "error",
      message: "Failed to update user: " + err.message
    });
  }
});

// Delete user (admin only)
router.delete('/:userId', adminOnly, async (req, res) => {
  try {
    const targetUser = await findUserByIdOrName(req.params.userId);
    
    if (!targetUser) {
      return res.status(404).json({
        status: "error",
        message: "User not found"
      });
    }
    
    // Prevent deleting admin user
    if (targetUser.role === 'ADMIN') {
      return res.status(400).json({
        status: "error",
        message: "Cannot delete admin user"
      });
    }

    await User.findByIdAndDelete(targetUser._id);

    res.status(200).json({
      status: "success",
      message: "User deleted successfully"
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to delete user: " + err.message
    });
  }
});

// 3. 导出路由实例，供主文件导入
module.exports = router;