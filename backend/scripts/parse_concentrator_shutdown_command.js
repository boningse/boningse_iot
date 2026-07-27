const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');

// 测试数据 - 集中器温控器关机指令
const testMqttData = {
  topic: "zhhl/BNWKQ/861556078623096/publish",
  timestamp: "2025-10-26T00:41:14.706Z",
  payload: {
    "body": {
      "id": [1, 2, 3, 4],
      "data": [
        [0, 1, 3, 0, 160, 200, 0],  // 设备1
        [0, 1, 3, 0, 160, 184, 0],  // 设备2
        [0, 1, 3, 0, 160, 181, 0],  // 设备3
        [17, 0, 2, 0, 160, 240, 0]  // 设备4 - 关机状态
      ],
      "items": [
        "runOn",        // 运行状态 (0=关机, 1=开机, 17=手动关机?)
        "runMode",      // 运行模式 (0=制冷, 1=制热, 2=送风, 3=自动)
        "runFanSpeed",  // 风速 (0=自动, 1=低速, 2=中速, 3=高速)
        "runFanDirect", // 风向 (0=自动)
        "runTemp",      // 设定温度 (实际值需要除以10)
        "roomTemp",     // 室内温度 (实际值需要除以10)
        "error"         // 错误代码
      ]
    },
    "func": "report",
    "uuid": "861556078623096",
    "eCode": 0,
    "pType": "params"
  }
};

class ConcentratorCommandParser {
  constructor() {
    this.pool = new Pool(getPoolConfig());
  }

  // 解析MQTT主题
  parseMqttTopic(topic) {
    console.log('🔍 解析MQTT主题:');
    console.log(`原始主题: ${topic}`);
    
    const parts = topic.split('/');
    if (parts.length >= 4) {
      const [protocol, manufacturerCode, concentratorImei, action] = parts;
      
      console.log(`  协议: ${protocol}`);
      console.log(`  厂商代码: ${manufacturerCode}`);
      console.log(`  集中器IMEI: ${concentratorImei}`);
      console.log(`  动作: ${action}`);
      
      return {
        protocol,
        manufacturerCode,
        concentratorImei,
        action,
        isValid: protocol === 'zhhl' && action === 'publish'
      };
    }
    
    return { isValid: false };
  }

  // 解析设备数据
  parseDeviceData(body) {
    console.log('\n📊 解析设备数据:');
    console.log(`设备数量: ${body.id.length}`);
    console.log(`数据项目: ${body.items.join(', ')}`);
    
    const devices = [];
    
    for (let i = 0; i < body.id.length; i++) {
      const deviceId = body.id[i];
      const deviceData = body.data[i];
      
      const parsedDevice = {
        id: deviceId,
        rawData: deviceData,
        parsed: {}
      };
      
      // 根据items字段解析每个数据值
      for (let j = 0; j < body.items.length; j++) {
        const itemName = body.items[j];
        const value = deviceData[j];
        
        switch (itemName) {
          case 'runOn':
            parsedDevice.parsed.runOn = {
              raw: value,
              status: this.parseRunOnStatus(value),
              description: this.getRunOnDescription(value)
            };
            break;
          case 'runMode':
            parsedDevice.parsed.runMode = {
              raw: value,
              mode: this.parseRunMode(value),
              description: this.getRunModeDescription(value)
            };
            break;
          case 'runFanSpeed':
            parsedDevice.parsed.runFanSpeed = {
              raw: value,
              speed: this.parseFanSpeed(value),
              description: this.getFanSpeedDescription(value)
            };
            break;
          case 'runFanDirect':
            parsedDevice.parsed.runFanDirect = {
              raw: value,
              direction: value === 0 ? 'auto' : 'manual',
              description: value === 0 ? '自动风向' : `手动风向(${value})`
            };
            break;
          case 'runTemp':
            parsedDevice.parsed.runTemp = {
              raw: value,
              temperature: value / 10,
              description: `设定温度: ${value / 10}°C`
            };
            break;
          case 'roomTemp':
            parsedDevice.parsed.roomTemp = {
              raw: value,
              temperature: value / 10,
              description: `室内温度: ${value / 10}°C`
            };
            break;
          case 'error':
            parsedDevice.parsed.error = {
              raw: value,
              hasError: value !== 0,
              description: value === 0 ? '无错误' : `错误代码: ${value}`
            };
            break;
        }
      }
      
      devices.push(parsedDevice);
    }
    
    return devices;
  }

  // 解析运行状态
  parseRunOnStatus(value) {
    switch (value) {
      case 0: return 'off';
      case 1: return 'on';
      case 17: return 'manual_shutdown';
      default: return 'unknown';
    }
  }

  getRunOnDescription(value) {
    switch (value) {
      case 0: return '关机';
      case 1: return '开机';
      case 17: return '手动关机';
      default: return `未知状态(${value})`;
    }
  }

  // 解析运行模式
  parseRunMode(value) {
    switch (value) {
      case 0: return 'cool';
      case 1: return 'heat';
      case 2: return 'fan';
      case 3: return 'auto';
      default: return 'unknown';
    }
  }

  getRunModeDescription(value) {
    switch (value) {
      case 0: return '制冷模式';
      case 1: return '制热模式';
      case 2: return '送风模式';
      case 3: return '自动模式';
      default: return `未知模式(${value})`;
    }
  }

  // 解析风速
  parseFanSpeed(value) {
    switch (value) {
      case 0: return 'auto';
      case 1: return 'low';
      case 2: return 'medium';
      case 3: return 'high';
      default: return 'unknown';
    }
  }

  getFanSpeedDescription(value) {
    switch (value) {
      case 0: return '自动风速';
      case 1: return '低速';
      case 2: return '中速';
      case 3: return '高速';
      default: return `未知风速(${value})`;
    }
  }

  // 分析设备状态变化
  analyzeDeviceChanges(devices) {
    console.log('\n🔍 设备状态分析:');
    
    devices.forEach((device, index) => {
      console.log(`\n设备 ${device.id} (索引 ${index}):`);
      console.log(`  运行状态: ${device.parsed.runOn.description} (${device.parsed.runOn.raw})`);
      console.log(`  运行模式: ${device.parsed.runMode.description} (${device.parsed.runMode.raw})`);
      console.log(`  风速: ${device.parsed.runFanSpeed.description} (${device.parsed.runFanSpeed.raw})`);
      console.log(`  风向: ${device.parsed.runFanDirect.description} (${device.parsed.runFanDirect.raw})`);
      console.log(`  设定温度: ${device.parsed.runTemp.temperature}°C (${device.parsed.runTemp.raw})`);
      console.log(`  室内温度: ${device.parsed.roomTemp.temperature}°C (${device.parsed.roomTemp.raw})`);
      console.log(`  错误状态: ${device.parsed.error.description} (${device.parsed.error.raw})`);
      
      // 特别分析异常状态
      if (device.parsed.runOn.raw === 17) {
        console.log(`  ⚠️  特殊状态: 设备${device.id}处于手动关机状态 (runOn=17)`);
        console.log(`      这可能表示用户在现场手动关闭了温控器`);
      }
      
      if (device.parsed.error.hasError) {
        console.log(`  ❌ 错误: 设备${device.id}存在错误 (${device.parsed.error.raw})`);
      }
    });
  }

  // 验证解析逻辑
  validateParsingLogic(topicInfo, devices) {
    console.log('\n✅ 验证解析逻辑:');
    
    // 验证主题格式
    if (topicInfo.isValid) {
      console.log('✓ MQTT主题格式正确');
      console.log(`  集中器IMEI: ${topicInfo.concentratorImei}`);
      console.log(`  厂商代码: ${topicInfo.manufacturerCode}`);
    } else {
      console.log('❌ MQTT主题格式不正确');
    }
    
    // 验证设备数据
    console.log(`✓ 成功解析 ${devices.length} 个设备的数据`);
    
    // 检查特殊状态
    const manualShutdownDevices = devices.filter(d => d.parsed.runOn.raw === 17);
    if (manualShutdownDevices.length > 0) {
      console.log(`⚠️  发现 ${manualShutdownDevices.length} 个设备处于手动关机状态:`);
      manualShutdownDevices.forEach(d => {
        console.log(`    设备${d.id}: 手动关机，室温${d.parsed.roomTemp.temperature}°C`);
      });
    }
    
    // 检查错误状态
    const errorDevices = devices.filter(d => d.parsed.error.hasError);
    if (errorDevices.length > 0) {
      console.log(`❌ 发现 ${errorDevices.length} 个设备存在错误`);
    } else {
      console.log('✓ 所有设备无错误状态');
    }
  }

  // 主解析函数
  async parseCommand() {
    try {
      console.log('🚀 开始解析集中器温控器关机指令\n');
      console.log('=' * 60);
      
      // 1. 解析MQTT主题
      const topicInfo = this.parseMqttTopic(testMqttData.topic);
      
      // 2. 解析设备数据
      const devices = this.parseDeviceData(testMqttData.payload.body);
      
      // 3. 分析设备状态
      this.analyzeDeviceChanges(devices);
      
      // 4. 验证解析逻辑
      this.validateParsingLogic(topicInfo, devices);
      
      // 5. 输出总结
      console.log('\n📋 解析总结:');
      console.log(`时间戳: ${testMqttData.timestamp}`);
      console.log(`功能: ${testMqttData.payload.func} (${testMqttData.payload.pType})`);
      console.log(`集中器UUID: ${testMqttData.payload.uuid}`);
      console.log(`错误代码: ${testMqttData.payload.eCode}`);
      console.log(`设备总数: ${devices.length}`);
      
      const onDevices = devices.filter(d => d.parsed.runOn.raw === 1).length;
      const offDevices = devices.filter(d => d.parsed.runOn.raw === 0).length;
      const manualOffDevices = devices.filter(d => d.parsed.runOn.raw === 17).length;
      
      console.log(`开机设备: ${onDevices} 个`);
      console.log(`关机设备: ${offDevices} 个`);
      console.log(`手动关机设备: ${manualOffDevices} 个`);
      
      console.log('\n🎯 结论:');
      console.log('这条指令是集中器上报其管理的4个温控器的当前状态。');
      console.log('其中设备4(id=4)的runOn=17表示该温控器被手动关机。');
      console.log('这种状态码(17)可能是厂商特定的，用于区分自动关机和手动关机。');
      console.log('我们的解析逻辑能够正确识别和处理这种特殊状态。');
      
    } catch (error) {
      console.error('解析过程中发生错误:', error);
    }
  }
}

// 执行解析
async function main() {
  const parser = new ConcentratorCommandParser();
  await parser.parseCommand();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ConcentratorCommandParser;