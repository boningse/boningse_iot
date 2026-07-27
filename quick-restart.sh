#!/bin/bash

echo "IoT设备管理系统 - 快速重启脚本"
echo "================================"

# 停止现有进程
echo "停止现有服务..."
pkill -f "node.*server.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

# 等待进程完全停止
sleep 2

# 检查并安装依赖
echo "检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "安装主项目依赖..."
    npm install
fi

if [ ! -d "backend/node_modules" ]; then
    echo "安装后端依赖..."
    cd backend && npm install && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "安装前端依赖..."
    cd frontend && npm install && cd ..
fi

# 启动服务
echo "启动后端服务..."
cd backend
nohup npm start > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

echo "等待后端启动..."
sleep 3

echo "启动前端服务..."
cd frontend
nohup npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

echo "服务启动完成!"
echo "后端PID: $BACKEND_PID"
echo "前端PID: $FRONTEND_PID"
echo "后端地址: http://localhost:3000"
echo "前端地址: http://localhost:3001"
echo ""
echo "查看日志:"
echo "  后端: tail -f backend.log"
echo "  前端: tail -f frontend.log"