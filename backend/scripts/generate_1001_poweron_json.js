const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');
const thermostatService = require('../services/thermostatService');

// 创建数据库连接池
const pool = new Pool(getPoolConfig());

async function generate1001PowerOnJson() {
    let connection;
    
    try {
        console.log('正在连接数据库...');
        connection = await mysql.createConnection(dbConfig);
        
        // 查询1001房间的温控器设备
        console.log('查询1001房间的温控器设备...');
        const [devices] = await connection.execute(`
            SELECT 
                d.id,
                d.imei,
                d.name,
                d.room_number,
                d.concentrator_id,
                d.concentrator_sequence_id,
                c.imei as concentrator_imei,
                c.name as concentrator_name
            FROM devices d
            LEFT JOIN concentrators c ON d.concentrator_id = c.id
            WHERE d.room_number LIKE '%1001%'
            ORDER BY d.id
        `);
        
        if (devices.length === 0) {
            console.log('未找到1001房间的温控器设备');
            return;
        }
        
        console.log(`找到 ${devices.length} 个1001房间的温控器设备:`);
        devices.forEach((device, index) => {
            console.log(`\n设备 ${index + 1}:`);
            console.log(`  ID: ${device.id}`);
            console.log(`  IMEI: ${device.imei}`);
            console.log(`  名称: ${device.name}`);
            console.log(`  房间号: ${device.room_number}`);
            console.log(`  集中器ID: ${device.concentrator_id || '无(独立设备)'}`);
            console.log(`  集中器序列号: ${device.concentrator_sequence_id || '无'}`);
            console.log(`  集中器IMEI: ${device.concentrator_imei || '无'}`);
            console.log(`  集中器名称: ${device.concentrator_name || '无'}`);
        });
        
        // 为每个设备生成开机JSON命令
        console.log('\n=== 生成开机JSON命令 ===');
        
        for (let i = 0; i < devices.length; i++) {
            const device = devices[i];
            console.log(`\n--- 设备 ${i + 1}: ${device.name} ---`);
            
            // 模拟thermostatService.powerOnDevice的逻辑
            let controlCommand;
            
            if (device.concentrator_id) {
                // 集中器管理的温控器
                console.log('这是集中器管理的温控器');
                
                // 使用集中器的配置
                const concentratorConfig = {
                    "uuid": device.concentrator_imei,
                    "body": {
                        "setOn": 1,
                        "id": [device.concentrator_sequence_id]
                    }
                };
                
                controlCommand = concentratorConfig;
                
                console.log(`使用集中器IMEI作为UUID: ${device.concentrator_imei}`);
                console.log(`使用concentrator_sequence_id作为body.id: [${device.concentrator_sequence_id}]`);
                
            } else {
                // 独立温控器
                console.log('这是独立温控器');
                
                const independentConfig = {
                    "uuid": device.imei,
                    "body": {
                        "setOn": 1,
                        "id": [1]
                    }
                };
                
                controlCommand = independentConfig;
                
                console.log(`使用设备自身IMEI作为UUID: ${device.imei}`);
                console.log(`使用默认ID作为body.id: [1]`);
            }
            
            // 显示完整的JSON命令
            console.log('\n完整的开机JSON命令:');
            console.log(JSON.stringify(controlCommand, null, 2));
            
            // 显示MQTT主题
            const mqttTopic = device.concentrator_id 
                ? `concentrator/${device.concentrator_imei}/control`
                : `thermostat/${device.imei}/control`;
            
            console.log(`\nMQTT主题: ${mqttTopic}`);
            
            console.log('\n' + '='.repeat(50));
        }
        
    } catch (error) {
        console.error('错误:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('\n数据库连接已关闭');
        }
        // 关闭连接池
        await pool.end();
        console.log('数据库连接池已关闭');
    }
}

// 运行脚本
generate1001PowerOnJson().catch(console.error);