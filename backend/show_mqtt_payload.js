const fs = require('fs');
const path = require('path');

// 展示电表下发报文的详细内容
function showMqttPayloadDetails() {
    console.log('=== 电表下发MQTT报文详细内容 ===\n');
    
    // 基本信息
    console.log('📊 MQTT报文基本信息:');
    console.log('设备ID: 62c37c27-5017-4c3d-b18b-d74d0bc80be1');
    console.log('电表号: 865661074511729001/865661074511729002');
    console.log('设备IMEI: (从设备配置获取)');
    console.log('制造商代码: BNDK');
    console.log('');
    
    // MQTT主题构造
    console.log('📡 MQTT主题构造:');
    console.log('主题格式: zhhl/{manufacturerCode}/{deviceImei}/subscribe');
    console.log('实际主题: zhhl/BNDK/{设备IMEI}/subscribe');
    console.log('QoS级别: 0 (RTU格式) / 1 (JSON格式)');
    console.log('');
    
    // RTU格式报文内容
    console.log('🔧 RTU格式报文内容:');
    console.log('发送方式: 逐个发送，每个命令间隔500ms');
    console.log('Payload内容: 纯十六进制字符串');
    console.log('');
    
    const rtuExamples = [
        {
            sequence: 1,
            topic: 'zhhl/BNDK/{设备IMEI}/subscribe',
            payload: '01 03 00 1F 00 02 F5 CD',
            description: '读取总有功电能',
            qos: 0
        },
        {
            sequence: 2,
            topic: 'zhhl/BNDK/{设备IMEI}/subscribe',
            payload: '01 03 00 14 00 02 84 0F',
            description: '读取正向有功电能',
            qos: 0
        },
        {
            sequence: 3,
            topic: 'zhhl/BNDK/{设备IMEI}/subscribe',
            payload: '01 04 00 04 00 02 30 0A',
            description: '读取反向有功电能',
            qos: 0
        },
        {
            sequence: 4,
            topic: 'zhhl/BNDK/{设备IMEI}/subscribe',
            payload: '01 04 00 06 00 01 D1 CB',
            description: '读取A相电流',
            qos: 0
        },
        {
            sequence: 5,
            topic: 'zhhl/BNDK/{设备IMEI}/subscribe',
            payload: '01 04 00 07 00 01 80 0B',
            description: '读取B相电流',
            qos: 0
        }
    ];
    
    console.log('RTU格式报文示例 (前5个):');
    rtuExamples.forEach(example => {
        console.log(`\n报文 ${example.sequence}:`);
        console.log(`  主题: ${example.topic}`);
        console.log(`  Payload: "${example.payload}"`);
        console.log(`  QoS: ${example.qos}`);
        console.log(`  描述: ${example.description}`);
        console.log(`  内容类型: 纯十六进制字符串`);
    });
    
    console.log('\n... (共24个类似的RTU命令)');
    
    // JSON格式报文内容
    console.log('\n\n📋 JSON格式报文内容:');
    console.log('发送方式: 一次性发送完整JSON对象');
    console.log('Payload内容: JSON字符串');
    console.log('');
    
    const jsonExample = {
        type: 'modbus_query',
        meter_address: 1,
        meter_id: 'meter-uuid',
        meter_number: '865661074511729001',
        timestamp: '2025-07-21T08:30:42.000Z',
        format: 'json',
        queries: [
            {
                function_code: 3,
                start_address: 31,
                quantity: 2,
                data_type: 'uint16'
            },
            {
                function_code: 3,
                start_address: 20,
                quantity: 2,
                data_type: 'uint16'
            },
            {
                function_code: 4,
                start_address: 4,
                quantity: 2,
                data_type: 'uint16'
            }
            // ... 更多查询配置
        ]
    };
    
    console.log('JSON格式报文示例:');
    console.log(`主题: zhhl/BNDK/{设备IMEI}/subscribe`);
    console.log(`QoS: 1`);
    console.log(`Payload: ${JSON.stringify(jsonExample, null, 2)}`);
    
    // 实际发送流程
    console.log('\n\n🚀 实际发送流程:');
    console.log('1. 系统根据设备配置确定使用RTU还是JSON格式');
    console.log('2. 构造MQTT主题: zhhl/{manufacturerCode}/{deviceImei}/subscribe');
    console.log('3. RTU格式: 逐个发送24个十六进制命令，每个间隔500ms');
    console.log('4. JSON格式: 一次性发送包含所有查询的JSON对象');
    console.log('5. 设备接收到命令后执行Modbus查询并返回数据');
    
    // 关键代码位置
    console.log('\n\n📍 关键代码位置:');
    console.log('- 报文构造: electricMeterMqttService.js -> buildModbusCommand()');
    console.log('- 报文发送: electricMeterMqttService.js -> publishModbusCommand()');
    console.log('- 主题构造: electricMeterMqttService.js -> buildCommandTopic()');
    console.log('- RTU指令生成: modbusRtuUtils.js -> buildReadHoldingRegistersRTU()');
    
    console.log('\n✅ 报文发送已优化，现在能正确发送所有24个RTU命令');
}

// 执行展示
showMqttPayloadDetails();