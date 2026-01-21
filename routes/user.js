// routes/user.js
const express = require('express');
const mongoose = require('mongoose'); 
const User = require('../models/User'); // 导入用户模型
const { protect } = require('../middleware/auth')

// 1. 创建Express Router实例（核心：用于封装路由）
const router = express.Router();

// 应用保护中间件，所有用户路由均需验证JWT
router.use(protect); // Enforce JWT for all user routes

// 2. 编写所有用户相关的路由（注意：路径去掉/api/users前缀，因为主文件会统一挂载）

// 🔹 获取所有用户（GET /api/users）
router.get('/', async (req, res) => {
  try {
    const users = await User.find({});
    res.status(200).json({
      status: "success",
      count: users.length,
      data: users
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "查询用户失败：" + err.message
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

// 🔹 创建新用户（POST /api/users）
router.post('/', async (req, res) => {
  try {
    const { name, age } = req.body;
    const newUser = await User.create({ name, age });

    res.status(201).json({
      status: "success",
      message: "用户创建成功",
      data: newUser
    });
  } catch (err) {
    res.status(400).json({
      status: "error",
      message: "创建用户失败：" + err.message
    });
  }
});

// 🔹 更新用户（PUT /api/users/:userId）
router.put('/:userId', async (req, res) => {
  try {
    // 校验ID格式
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({
        status: "error",
        message: "用户ID格式错误"
      });
    }

    const { name, age } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (age) updateData.age = age;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.userId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        status: "error",
        message: "用户不存在"
      });
    }

    res.status(200).json({
      status: "success",
      message: "用户更新成功",
      data: updatedUser
    });
  } catch (err) {
    res.status(400).json({
      status: "error",
      message: "更新用户失败：" + err.message
    });
  }
});

// 🔹 删除用户（DELETE /api/users/:userId）
router.delete('/:userId', async (req, res) => {
  try {
    // 校验ID格式
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({
        status: "error",
        message: "用户ID格式错误"
      });
    }

    const deletedUser = await User.findByIdAndDelete(req.params.userId);
    if (!deletedUser) {
      return res.status(404).json({
        status: "error",
        message: "用户不存在"
      });
    }

    res.status(200).json({
      status: "success",
      message: "用户删除成功"
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "删除用户失败：" + err.message
    });
  }
});

// 3. 导出路由实例，供主文件导入
module.exports = router;