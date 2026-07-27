import fetch from 'node-fetch';
import WebSocket from 'ws';

// 配置
const API_BASE_URL = 'http://localhost:3003/api';
const WS_URL = 'ws://localhost:3003/ws';
const USERNAME = 'apple';
const PASSWORD = '225788';

let authToken = null;
let devices = [];

// 日志函数
function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = {
        'info': '📋',
        'success': '✅',
        'error': '❌',
        'warning': '⚠️'
    }[type] || '📋';
    
    console.log(`[${timestamp}] ${prefix} ${message}`);
}

// 登录获取token
async function login() {
    try {
        log('正在登录获取认证token...', 'info');
        
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                username: USERNAME,
                password: PASSWORD
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            authToken = data.data.token;
            log(`登录成功，获得token: ${authToken.substring(0, 50)}...`, 'success');
            return true;
        } else {
            log(`登录失败: ${data.message}`, 'error');
            return false;
        }
    } catch (error) {
        log(`登录请求失败: ${error.message}`, 'error');
        return false;
    }
}

// 加载设备列表
async function loadDevices() {
    try {
        log('正在加载温控器设备列表...', 'info');
        
        const response = await fetch(`${API_BASE_URL}/thermostat/devices`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            devices = data.data.list || [];
            log(`成功加载 ${devices.length} 个温控器设备`, 'success');
            
            // 显示设备信息
            devices.forEach((device, index) => {
                log(`设备 ${index + 1}: ${device.name || '未命名'} (ID: ${device.id})`, 'info');
                log(`  - 设备编号: ${device.device_id || 'N/A'}`, 'info');
                log(`  - 状态: ${device.status || 'unknown'}`, 'info');
                log(`  - 当前温度: ${device.currentTemp || '--'}°C`, 'info');
                log(`  - 目标温度: ${device.targetTemp || '--'}°C`, 'info');
            });
            
            return true;
        } else {
            log(`加载设备失败: ${data.message}`, 'error');
            return false;
        }
    } catch (error) {
        log(`加载设备请求失败: ${error.message}`, 'error');
        return false;
    }
}

// 连接WebSocket
async function connectWebSocket() {
    return new Promise((resolve, reject) => {
        try {
            log('正在连接WebSocket...', 'info');
            
            const wsUrl = `${WS_URL}?token=${encodeURIComponent(authToken)}`;
            const ws = new WebSocket(wsUrl);
            
            ws.on('open', () => {
                log('WebSocket连接成功', 'success');
                
                // 订阅设备数据事件
                const subscribeMessage = JSON.stringify({
                    type: 'subscribe',
                    topics: ['device_data', 'device_status_update', 'device_response']
                });
                
                ws.send(subscribeMessage);
                log('已订阅设备数据事件', 'info');
                
                resolve(ws);
            });
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    log(`收到WebSocket消息: ${message.type}`, 'info');
                    
                    if (message.type === 'device_data' && message.payload) {
                        handleDeviceData(message.payload);
                    } else if (message.type === 'device_status_update' && message.payload) {
                        handleDeviceStatusUpdate(message.payload);
                    } else if (message.type === 'device_response' && message.payload) {
                        handleDeviceResponse(message.payload);
                    }
                } catch (error) {
                    log(`解析WebSocket消息失败: ${error.message}`, 'error');
                }
            });
            
            ws.on('error', (error) => {
                log(`WebSocket错误: ${error.message}`, 'error');
                reject(error);
            });
            
            ws.on('close', (code, reason) => {
                log(`WebSocket连接关闭: ${code} ${reason}`, 'warning');
            });
            
        } catch (error) {
            log(`WebSocket连接失败: ${error.message}`, 'error');
            reject(error);
        }
    });
}

// 处理设备数据更新
function handleDeviceData(data) {
    log(`收到设备数据更新: ${data.device_id}`, 'info');
    
    // 查找对应的设备
    const device = devices.find(d => d.id === data.device_id);
    if (device && data.data) {
        log(`找到设备: ${device.name} (${device.id})`, 'success');
        
        // 解析协议数据
        let parsedData = data.data;
        if (data.data.body && data.data.body.data && data.data.body.items) {
            const dataArray = data.data.body.data[0] || [];
            parsedData = {};
            data.data.body.items.forEach((item, index) => {
                if (index < dataArray.length) {
                    parsedData[item] = dataArray[index];
                }
            });
            log(`解析协议数据: ${JSON.stringify(parsedData)}`, 'info');
        }
        
        // 显示更新的数据
        if (parsedData.roomTemp !== undefined) {
            log(`  当前温度: ${(parsedData.roomTemp / 10).toFixed(1)}°C`, 'success');
        }
        if (parsedData.runTemp !== undefined) {
            log(`  目标温度: ${(parsedData.runTemp / 10).toFixed(1)}°C`, 'success');
        }
        if (parsedData.runOn !== undefined) {
            log(`  电源状态: ${parsedData.runOn > 0 ? '开启' : '关闭'}`, 'success');
        }
        if (parsedData.runMode !== undefined) {
            const modes = ['关闭', '制热', '制冷', '送风', '除湿'];
            log(`  运行模式: ${modes[parsedData.runMode] || `模式${parsedData.runMode}`}`, 'success');
        }
        if (parsedData.runFanSpeed !== undefined) {
            log(`  风速档位: ${parsedData.runFanSpeed}`, 'success');
        }
    } else {
        log(`未找到设备ID为 ${data.device_id} 的设备`, 'warning');
        log(`当前设备列表: ${devices.map(d => `${d.name}(${d.id})`).join(', ')}`, 'info');
    }
}

// 处理设备状态更新
function handleDeviceStatusUpdate(data) {
    log(`收到设备状态更新: ${data.device_id} -> ${data.status}`, 'info');
    
    const device = devices.find(d => d.id === data.device_id);
    if (device) {
        device.status = data.status;
        log(`设备 ${device.name} 状态已更新为: ${data.status}`, 'success');
    }
}

// 处理设备响应
function handleDeviceResponse(data) {
    log(`收到设备响应: ${data.device_id}`, 'info');
    handleDeviceData(data); // 使用相同的处理逻辑
}

// 主测试函数
async function runTest() {
    console.log('🚀 开始前端API功能测试...\n');
    
    try {
        // 步骤1: 登录
        const loginSuccess = await login();
        if (!loginSuccess) {
            log('登录失败，测试终止', 'error');
            return;
        }
        
        console.log('');
        
        // 步骤2: 加载设备列表
        const loadSuccess = await loadDevices();
        if (!loadSuccess) {
            log('加载设备失败，测试终止', 'error');
            return;
        }
        
        console.log('');
        
        // 步骤3: 连接WebSocket
        const ws = await connectWebSocket();
        
        console.log('');
        log('测试完成，WebSocket保持连接中...', 'success');
        log('按 Ctrl+C 退出测试', 'info');
        
        // 保持连接，监听实时数据
        process.on('SIGINT', () => {
            log('收到中断信号，正在关闭...', 'warning');
            if (ws) {
                ws.close();
            }
            process.exit(0);
        });
        
    } catch (error) {
        log(`测试过程中发生错误: ${error.message}`, 'error');
        console.error(error.stack);
    }
}

// 运行测试
runTest();