const { Pool } = require('pg');
const path = require('path');

// 数据库连接配置
const dbConfig = {
  user: 'postgres',
  host: 'localhost',
  database: 'iot_device_management',
  password: '123456',
  port: 5432,
};

// 导入服务
const thermostatServicePath = path.join(__dirname, '../services/thermostatService.js');
const thermostatService = require(thermostatServicePath);

class ConcentratorMqttLogicVerifier {
  constructor() {
    this.db = new Pool(dbConfig);
    this.testResults = {
      deviceQuery: [],
      mqttTopicTests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0
      }
    };
  }

  async connect() {
    try {
      await this.db.connect();
      console.log('✅ 数据库连接成功');
    } catch (error) {
      console.error('❌ 数据库连接失败:', error.message);
      throw error;
    }
  }

  async disconnect() {
    await this.db.end();
    console.log('🔌 数据库连接已关闭');
  }

  /**
   * 查询1001-1004房间的温控器设备详细信息
   */
  async queryThermostatDevices() {
    console.log('=== 1. 查询温控器设备信息 ===\n');
    
    try {
      const query = `
        SELECT 
          d.id,
          d.device_id,
          d.name,
          d.imei,
          d.manufacturer_code,
          d.parent_device_id,
          d.concentrator_sequence_id,
          m.subscription_type,
          
          -- 集中器信息
          pd.id as concentrator_id,
          pd.device_id as concentrator_device_id,
          pd.name as concentrator_name,
          pd.imei as concentrator_imei,
          pd.manufacturer_code as concentrator_manufacturer_code,
          cm.subscription_type as concentrator_subscription_type,
          
          -- 协议配置
          d.configuration as device_config,
          pd.configuration as concentrator_config
        FROM devices d
        LEFT JOIN manufacturers m ON d.manufacturer_code = m.code
        LEFT JOIN devices pd ON d.parent_device_id = pd.id
        LEFT JOIN manufacturers cm ON pd.manufacturer_code = cm.code
        WHERE d.name LIKE '%1号楼1层东区-100%房间'
        ORDER BY d.name
      `;

      const result = await this.db.query(query);
      
      console.log(`📋 找到 ${result.rows.length} 个温控器设备:\n`);
      
      for (const device of result.rows) {
        console.log(`🏠 设备: ${device.name}`);
        console.log(`   📱 设备ID: ${device.device_id}`);
        console.log(`   📡 IMEI: ${device.imei}`);
        console.log(`   🏭 厂商代码: ${device.manufacturer_code}`);
        console.log(`   📊 订阅类型: ${device.subscription_type}`);
        console.log(`   🔗 集中器关联: ${device.parent_device_id ? '是' : '否'}`);
        
        if (device.parent_device_id) {
          console.log(`   🎛️  集中器名称: ${device.concentrator_name}`);
          console.log(`   🎛️  集中器ID: ${device.concentrator_device_id}`);
          console.log(`   🎛️  集中器IMEI: ${device.concentrator_imei}`);
          console.log(`   🎛️  集中器厂商: ${device.concentrator_manufacturer_code}`);
          console.log(`   🎛️  集中器订阅类型: ${device.concentrator_subscription_type}`);
          console.log(`   🔢 序列号: ${device.concentrator_sequence_id}`);
        }
        
        console.log('');
        
        this.testResults.deviceQuery.push({
          deviceName: device.name,
          deviceId: device.device_id,
          hasConcentrator: !!device.parent_device_id,
          concentratorName: device.concentrator_name,
          device: device
        });
      }
      
      return result.rows;
    } catch (error) {
      console.error('❌ 查询设备信息失败:', error.message);
      throw error;
    }
  }

  /**
   * 测试MQTT主题构建逻辑
   */
  async testMqttTopicBuilding(devices) {
    console.log('=== 2. MQTT主题构建测试 ===\n');
    
    for (const device of devices) {
      try {
        console.log(`🔗 测试设备: ${device.name}`);
        
        // 构建设备对象，包含所有必要字段
        const deviceForMqtt = {
          id: device.id,
          device_id: device.device_id,
          imei: device.imei,
          manufacturer_code: device.manufacturer_code,
          subscription_type: device.subscription_type,
          parent_device_id: device.parent_device_id,
          concentrator_sequence_id: device.concentrator_sequence_id,
          
          // 集中器信息
          concentrator_id: device.concentrator_id,
          concentrator_device_id: device.concentrator_device_id,
          concentrator_imei: device.concentrator_imei,
          concentrator_manufacturer_code: device.concentrator_manufacturer_code,
          concentrator_subscription_type: device.concentrator_subscription_type
        };
        
        // 判断应该使用哪个设备的厂商协议
        let expectedProtocolSource;
        let expectedManufacturer;
        let expectedSubscriptionType;
        
        if (device.parent_device_id && device.concentrator_imei && device.concentrator_manufacturer_code && device.concentrator_subscription_type) {
          // 集中器管理的温控器
          expectedProtocolSource = '集中器';
          expectedManufacturer = device.concentrator_manufacturer_code;
          expectedSubscriptionType = device.concentrator_subscription_type;
          
          console.log(`   📡 协议来源: ${expectedProtocolSource}`);
          console.log(`   🏭 使用厂商: ${expectedManufacturer}`);
          console.log(`   📊 订阅类型: ${expectedSubscriptionType}`);
        } else {
          // 独立温控器
          expectedProtocolSource = '温控器自身';
          expectedManufacturer = device.manufacturer_code;
          expectedSubscriptionType = device.subscription_type;
          
          console.log(`   📡 协议来源: ${expectedProtocolSource}`);
          console.log(`   🏭 使用厂商: ${expectedManufacturer}`);
          console.log(`   📊 订阅类型: ${expectedSubscriptionType}`);
        }
        
        // 调用buildMqttTopic函数
        let topic;
        let success = false;
        let errorMessage = '';
        
        try {
          topic = thermostatService.buildMqttTopic(deviceForMqtt);
          success = true;
          console.log(`   ✅ MQTT主题: ${topic}`);
          
          // 验证主题格式
          if (topic && topic.length > 0 && !topic.includes('undefined')) {
            console.log(`   ✅ 主题格式验证: 通过`);
          } else {
            console.log(`   ❌ 主题格式验证: 失败 - 主题包含undefined或为空`);
            success = false;
          }
          
        } catch (error) {
          success = false;
          errorMessage = error.message;
          console.log(`   ❌ MQTT主题构建失败: ${error.message}`);
        }
        
        // 记录测试结果
        this.testResults.mqttTopicTests.push({
          deviceName: device.name,
          deviceId: device.device_id,
          protocolSource: expectedProtocolSource,
          manufacturer: expectedManufacturer,
          subscriptionType: expectedSubscriptionType,
          topic: topic,
          success: success,
          error: errorMessage
        });
        
        if (success) {
          this.testResults.summary.passed++;
        } else {
          this.testResults.summary.failed++;
        }
        this.testResults.summary.total++;
        
        console.log('');
        
      } catch (error) {
        console.error(`❌ 测试设备 ${device.name} 失败:`, error.message);
        this.testResults.summary.failed++;
        this.testResults.summary.total++;
      }
    }
  }

  /**
   * 生成测试报告
   */
  generateReport() {
    console.log('=== 3. 测试报告 ===\n');
    
    console.log(`📊 总体统计:`);
    console.log(`   总测试数: ${this.testResults.summary.total}`);
    console.log(`   通过数: ${this.testResults.summary.passed}`);
    console.log(`   失败数: ${this.testResults.summary.failed}`);
    console.log(`   成功率: ${this.testResults.summary.total > 0 ? Math.round((this.testResults.summary.passed / this.testResults.summary.total) * 100) : 0}%\n`);
    
    console.log(`📋 设备查询结果:`);
    for (const device of this.testResults.deviceQuery) {
      console.log(`   ${device.deviceName}: ${device.hasConcentrator ? '集中器管理' : '独立设备'}`);
      if (device.hasConcentrator) {
        console.log(`     └─ 集中器: ${device.concentratorName}`);
      }
    }
    console.log('');
    
    console.log(`🔗 MQTT主题测试结果:`);
    for (const test of this.testResults.mqttTopicTests) {
      const status = test.success ? '✅' : '❌';
      console.log(`   ${status} ${test.deviceName}`);
      console.log(`     协议来源: ${test.protocolSource}`);
      console.log(`     厂商: ${test.manufacturer}`);
      console.log(`     订阅类型: ${test.subscriptionType}`);
      if (test.success) {
        console.log(`     MQTT主题: ${test.topic}`);
      } else {
        console.log(`     错误: ${test.error}`);
      }
      console.log('');
    }
    
    // 验证逻辑正确性
    console.log(`🧪 逻辑验证:`);
    const concentratorManagedDevices = this.testResults.mqttTopicTests.filter(t => t.protocolSource === '集中器');
    const independentDevices = this.testResults.mqttTopicTests.filter(t => t.protocolSource === '温控器自身');
    
    console.log(`   集中器管理设备数: ${concentratorManagedDevices.length}`);
    console.log(`   独立设备数: ${independentDevices.length}`);
    
    if (concentratorManagedDevices.length > 0) {
      console.log(`   集中器管理设备MQTT逻辑: ${concentratorManagedDevices.every(d => d.success) ? '✅ 正确' : '❌ 有问题'}`);
    }
    
    if (independentDevices.length > 0) {
      console.log(`   独立设备MQTT逻辑: ${independentDevices.every(d => d.success) ? '✅ 正确' : '❌ 有问题'}`);
    }
  }

  /**
   * 运行完整测试
   */
  async runTests() {
    try {
      console.log('🚀 开始验证集中器MQTT逻辑\n');
      
      await this.connect();
      
      // 1. 查询设备信息
      const devices = await this.queryThermostatDevices();
      
      if (devices.length === 0) {
        console.log('⚠️  未找到测试设备，请检查数据库中是否存在1001-1004房间的温控器设备');
        return;
      }
      
      // 2. 测试MQTT主题构建
      await this.testMqttTopicBuilding(devices);
      
      // 3. 生成报告
      this.generateReport();
      
      console.log('🎉 测试完成');
      
    } catch (error) {
      console.error('❌ 测试执行失败:', error.message);
      console.error('堆栈信息:', error.stack);
    } finally {
      await this.disconnect();
    }
  }
}

// 运行测试
if (require.main === module) {
  const verifier = new ConcentratorMqttLogicVerifier();
  verifier.runTests().catch(console.error);
}

module.exports = ConcentratorMqttLogicVerifier;