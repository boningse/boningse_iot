const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');
const mqttConfigService = require('../services/mqttConfigService');

const pool = new Pool(getPoolConfig());

async function checkConcentratorMqttTopic() {
    let client;
    
    try {
        console.log('正在连接数据库...');
        client = await pool.connect();
        
        const concentratorImei = '861556078623096';
        console.log(`查询集中器设备 IMEI: ${concentratorImei}`);
        
        // 查询集中器设备信息
        const deviceResult = await client.query(`
            SELECT 
                d.id,
                d.imei,
                d.name,
                d.manufacturer_code,
                d.device_type_id,
                d.subscribe_topics,
                d.command_topic,
                m.subscription_type,
                m.name as manufacturer_name
            FROM devices d
            LEFT JOIN manufacturers m ON d.manufacturer_code = m.code
            WHERE d.imei = $1
        `, [concentratorImei]);
        
        if (deviceResult.rows.length === 0) {
            console.log('未找到该集中器设备');
            return;
        }
        
        const device = deviceResult.rows[0];
        console.log('\n=== 集中器设备信息 ===');
        console.log(`设备ID: ${device.id}`);
        console.log(`设备名称: ${device.name}`);
        console.log(`IMEI: ${device.imei}`);
        console.log(`制造商代码: ${device.manufacturer_code}`);
        console.log(`制造商名称: ${device.manufacturer_name || '未知'}`);
        console.log(`设备类型: ${device.device_type}`);
        console.log(`订阅类型: ${device.subscription_type || '默认(imei_middle)'}`);
        console.log(`现有订阅主题: ${device.subscribe_topics || '无'}`);
        console.log(`现有命令主题: ${device.command_topic || '无'}`);
        
        // 使用mqttConfigService生成MQTT配置
        console.log('\n=== 使用mqttConfigService生成MQTT主题 ===');
        
        try {
            const mqttConfig = await mqttConfigService.buildDeviceConfig(device);
            
            console.log('生成的MQTT配置:');
            console.log(`订阅主题数组:`, mqttConfig.subscribeTopics);
            console.log(`发布主题数组:`, mqttConfig.publishTopics);
            
            if (mqttConfig.subscribeTopics && mqttConfig.subscribeTopics.length > 0) {
                console.log('\n=== 详细订阅主题信息 ===');
                mqttConfig.subscribeTopics.forEach((topic, index) => {
                    console.log(`订阅主题 ${index + 1}: ${topic}`);
                });
            }
            
            if (mqttConfig.publishTopics && mqttConfig.publishTopics.length > 0) {
                console.log('\n=== 详细发布主题信息 ===');
                mqttConfig.publishTopics.forEach((topic, index) => {
                    console.log(`发布主题 ${index + 1}: ${topic}`);
                });
            }
            
        } catch (mqttError) {
            console.error('生成MQTT配置时出错:', mqttError.message);
            
            // 手动构建主题作为备选方案
            console.log('\n=== 手动构建MQTT主题 ===');
            const subscriptionType = device.subscription_type || 'imei_middle';
            const manufacturerCode = device.manufacturer_code;
            
            let subscribeTopics = [];
            let publishTopics = [];
            
            if (subscriptionType === 'imei_middle') {
                subscribeTopics.push(`zhhl/${manufacturerCode}/${device.imei}/subscribe`);
                publishTopics.push(`zhhl/${manufacturerCode}/${device.imei}/publish`);
            } else if (subscriptionType === 'imei_last') {
                subscribeTopics.push(`zhhl/${manufacturerCode}/subscribe/${device.imei}`);
                publishTopics.push(`zhhl/${manufacturerCode}/publish/${device.imei}`);
            }
            
            console.log(`手动构建的订阅主题: ${subscribeTopics.join(', ')}`);
            console.log(`手动构建的发布主题: ${publishTopics.join(', ')}`);
        }
        
        // 查询该集中器管理的温控器设备
        console.log('\n=== 该集中器管理的温控器设备 ===');
        const thermostatResult = await client.query(`
            SELECT 
                d.id,
                d.imei,
                d.name,
                d.concentrator_sequence_id
            FROM devices d
            WHERE d.concentrator_id = $1
            ORDER BY d.concentrator_sequence_id
        `, [device.id]);
        
        if (thermostatResult.rows.length > 0) {
            console.log(`找到 ${thermostatResult.rows.length} 个温控器设备:`);
            thermostatResult.rows.forEach((thermostat, index) => {
                console.log(`  ${index + 1}. ${thermostat.name} (IMEI: ${thermostat.imei}, 序列号: ${thermostat.concentrator_sequence_id})`);
            });
        } else {
            console.log('该集中器未管理任何温控器设备');
        }
        
    } catch (error) {
        console.error('查询错误:', error);
    } finally {
        if (client) {
            client.release();
        }
        await pool.end();
    }
}

checkConcentratorMqttTopic().catch(console.error);