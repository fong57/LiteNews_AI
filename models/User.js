// models/User.js (FULL UPDATED CODE)
const mongoose = require('mongoose');

// 定义用户Schema（新增password字段，适配JWT认证）
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, '姓名不能为空'],
    trim: true,
    unique: true // 新增：用户名唯一（避免重复注册同一个用户名）
  },
  age: {
    type: Number,
    required: [true, '年龄不能为空'],
    min: [1, '年龄不能小于1']
  },
}, {
  timestamps: true // 自动添加createdAt/updatedAt
});

// 核心：避免模型重复编译（Mongoose官方方案，保持不变）
const User = mongoose.models.User || mongoose.model('User', userSchema);

// 导出模型，供路由文件（auth.js/user.js）使用（保持不变）
module.exports = User;