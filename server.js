// server.js
const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config(); // 加载环境变量

const MONGODB_URI = process.env.MONGODB_URI;


// 1. 创建Express应用
const app = express();

// Optional: Rate limiting middleware to enhance security
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP per window
  message: "Too many requests – try again later!"
});
app.use('/api', apiLimiter); // Apply to all API routes

// Allow only your frontend domain (e.g., https://your-frontend.com)
app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"]
}));

//set up static files
app.use(express.static('public'));

// 2. 配置全局中间件（必须在路由注册前）
app.use(express.json()); // 解析JSON请求体

// 3. 连接MongoDB数据库
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ 成功连接到MongoDB数据库');
  })
  .catch((err) => {
    console.error('❌ 数据库连接失败：', err.message);
    process.exit(1); // 连接失败则退出程序
  });


// 4. 注册认证路由（挂载到/api/auth路径）
const authRoutes = require('./routes/auth.js');
app.use('/api/auth', authRoutes);

// 5. 注册用户路由（核心：挂载到/api/users路径）
// 含义：所有以/api/users开头的请求，都交给routes/user.js处理
const userRoutes = require('./routes/user.js');
app.use('/api/users', userRoutes);

// 6. 启动服务
const PORT = process.env.PORT; // 你的端口是4250，这里对应
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Express服务已启动，访问地址：http://localhost:${PORT}`);
});