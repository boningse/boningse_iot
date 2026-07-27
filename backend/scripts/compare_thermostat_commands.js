const db = require('../utils/database');

/**
 * 温控器开机命令对比分析工具
 * 用于对比独立温控器和集中器管理的温控器的开机命令JSON格式差异
 */
class ThermostatCommandComparator {
  constructor() {
    this.independentDevice = null;
    this.concentratorManagedDevice = null;
  }

  /**
   * 查询设备信息
   */
  async queryDevices() {
    console.log('=== 1. 查询温控器设备信息 ===\n');
    
    try {
      // 查询所有温控器设备，区分独立和集中器管理的
      const query = `
        SELECT 
          d.id,
          d.name,
          d.device_id,
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
          pc.command_config as device_command_config,
          cpc.command_config as concentrator_command_config
        FROM devices d
        LEFT JOIN device_types dt ON d.device_type_id = dt.id
        LEFT JOIN manufacturers m ON d.manufacturer_code = m.code
        LEFT JOIN protocol_configs pc ON d.protocol_config_id = pc.id
        LEFT JOIN devices pd ON d.parent_device_id = pd.id
        LEFT JOIN manufacturers cm ON pd.manufacturer_code = cm.code
        LEFT JOIN protocol_configs cpc ON pd.protocol_config_id = cpc.id
        WHERE dt.name = '空调温控器'
        ORDER BY d.parent_device_id NULLS FIRST, d.name
      `;

      const result = await db.query(query);
      
      console.log(`📋 找到 ${result.rows.length} 个温控器设备:\n`);
      
      // 分类设备
      const independentDevices = [];
      const concentratorManagedDevices = [];
      
      for (const device of result.rows) {
        if (device.parent_device_id && device.concentrator_id) {
          concentratorManagedDevices.push(device);
        } else {
          independentDevices.push(device);
        }
      }
      
      console.log(`🔸 独立温控器: ${independentDevices.length} 个`);
      independentDevices.forEach((device, index) => {
        console.log(`  ${index + 1}. ${device.name} (${device.device_id}) - IMEI: ${device.imei}`);
      });
      
      console.log(`\n🔸 集中器管理的温控器: ${concentratorManagedDevices.length} 个`);
      concentratorManagedDevices.forEach((device, index) => {
        console.log(`  ${index + 1}. ${device.name} (${device.device_id}) - 序列号: ${device.concentrator_sequence_id} - 集中器: ${device.concentrator_name}`);
      });
      
      // 选择代表性设备
      this.independentDevice = independentDevices.length > 0 ? independentDevices[0] : null;
      this.concentratorManagedDevice = concentratorManagedDevices.length > 0 ? concentratorManagedDevices[0] : null;
      
      console.log('\n📌 选择的对比设备:');
      if (this.independentDevice) {
        console.log(`  独立温控器: ${this.independentDevice.name} (${this.independentDevice.device_id})`);
      } else {
        console.log('  独立温控器: 未找到');
      }
      
      if (this.concentratorManagedDevice) {
        console.log(`  集中器管理: ${this.concentratorManagedDevice.name} (${this.concentratorManagedDevice.device_id})`);
      } else {
        console.log('  集中器管理: 未找到');
      }
      
      return { independentDevices, concentratorManagedDevices };
      
    } catch (error) {
      console.error('❌ 查询设备信息失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取协议配置模板
   */
  getProtocolTemplate() {
    // 基于实际协议配置的开机命令模板
    return {
      "uuid": "DEVICE_IMEI_PLACEHOLDER",
      "pType": "params",
      "func": "write",
      "body": {
        "id": [1],
        "setOn": 1
      }
    };
  }

  /**
   * 构建独立温控器开机命令
   */
  buildIndependentThermostatCommand() {
    if (!this.independentDevice) {
      return null;
    }
    
    const template = this.getProtocolTemplate();
    
    return {
      "uuid": this.independentDevice.imei || this.independentDevice.device_id,
      "pType": "params",
      "func": "write",
      "body": {
        "id": [1], // 独立温控器固定使用ID=1
        "setOn": 1  // 1=开机，0=关机
      }
    };
  }

  /**
   * 构建集中器管理的温控器开机命令
   */
  buildConcentratorManagedCommand() {
    if (!this.concentratorManagedDevice) {
      return null;
    }
    
    const template = this.getProtocolTemplate();
    
    return {
      "uuid": this.concentratorManagedDevice.concentrator_imei || this.concentratorManagedDevice.concentrator_device_id,
      "pType": "params", 
      "func": "write",
      "body": {
        "id": [this.concentratorManagedDevice.concentrator_sequence_id || 1], // 使用集中器序列号
        "setOn": 1  // 1=开机，0=关机
      }
    };
  }

  /**
   * 对比命令格式差异
   */
  compareCommands() {
    console.log('\n=== 2. 开机命令JSON格式对比 ===\n');
    
    const independentCommand = this.buildIndependentThermostatCommand();
    const concentratorCommand = this.buildConcentratorManagedCommand();
    
    if (independentCommand) {
      console.log('🔸 独立温控器开机命令:');
      console.log('```json');
      console.log(JSON.stringify(independentCommand, null, 2));
      console.log('```\n');
    } else {
      console.log('🔸 独立温控器开机命令: 无设备可测试\n');
    }
    
    if (concentratorCommand) {
      console.log('🔸 集中器管理的温控器开机命令:');
      console.log('```json');
      console.log(JSON.stringify(concentratorCommand, null, 2));
      console.log('```\n');
    } else {
      console.log('🔸 集中器管理的温控器开机命令: 无设备可测试\n');
    }
    
    // 详细对比分析
    if (independentCommand && concentratorCommand) {
      console.log('=== 3. 详细差异分析 ===\n');
      
      console.log('📊 字段对比:');
      console.log('┌─────────────────┬─────────────────────────┬─────────────────────────┐');
      console.log('│ 字段            │ 独立温控器              │ 集中器管理温控器        │');
      console.log('├─────────────────┼─────────────────────────┼─────────────────────────┤');
      console.log(`│ uuid            │ ${independentCommand.uuid.padEnd(23)} │ ${concentratorCommand.uuid.padEnd(23)} │`);
      console.log(`│ pType           │ ${independentCommand.pType.padEnd(23)} │ ${concentratorCommand.pType.padEnd(23)} │`);
      console.log(`│ func            │ ${independentCommand.func.padEnd(23)} │ ${concentratorCommand.func.padEnd(23)} │`);
      console.log(`│ body.id         │ ${JSON.stringify(independentCommand.body.id).padEnd(23)} │ ${JSON.stringify(concentratorCommand.body.id).padEnd(23)} │`);
      console.log(`│ body.setOn      │ ${independentCommand.body.setOn.toString().padEnd(23)} │ ${concentratorCommand.body.setOn.toString().padEnd(23)} │`);
      console.log('└─────────────────┴─────────────────────────┴─────────────────────────┘\n');
      
      console.log('🔍 关键差异分析:');
      
      // UUID差异
      if (independentCommand.uuid !== concentratorCommand.uuid) {
        console.log('1. **UUID字段差异**:');
        console.log(`   - 独立温控器使用自身IMEI: ${independentCommand.uuid}`);
        console.log(`   - 集中器管理使用集中器IMEI: ${concentratorCommand.uuid}`);
        console.log('   ✅ 这是正确的，因为MQTT消息需要发送到不同的设备\n');
      }
      
      // ID字段差异
      if (JSON.stringify(independentCommand.body.id) !== JSON.stringify(concentratorCommand.body.id)) {
        console.log('2. **body.id字段差异**:');
        console.log(`   - 独立温控器使用固定ID: ${JSON.stringify(independentCommand.body.id)}`);
        console.log(`   - 集中器管理使用序列号: ${JSON.stringify(concentratorCommand.body.id)}`);
        console.log('   ✅ 这是正确的，集中器需要通过序列号区分不同的温控器\n');
      }
      
      // setOn字段检查
      if (independentCommand.body.setOn === concentratorCommand.body.setOn) {
        console.log('3. **body.setOn字段**:');
        console.log(`   - 两种设备都使用相同的开机值: ${independentCommand.body.setOn}`);
        console.log('   ✅ 这是正确的，开机命令应该一致\n');
      }
      
    } else {
      console.log('⚠️ 无法进行完整对比，缺少某种类型的设备\n');
    }
  }

  /**
   * 分析可能的问题
   */
  analyzePotentialIssues() {
    console.log('=== 4. 潜在问题分析 ===\n');
    
    const issues = [];
    
    // 检查独立温控器
    if (this.independentDevice) {
      if (!this.independentDevice.imei) {
        issues.push('❌ 独立温控器缺少IMEI号，可能导致UUID字段为空');
      }
      if (!this.independentDevice.subscription_type) {
        issues.push('❌ 独立温控器缺少订阅类型配置');
      }
    }
    
    // 检查集中器管理的温控器
    if (this.concentratorManagedDevice) {
      if (!this.concentratorManagedDevice.concentrator_imei) {
        issues.push('❌ 集中器缺少IMEI号，可能导致UUID字段为空');
      }
      if (!this.concentratorManagedDevice.concentrator_sequence_id) {
        issues.push('❌ 温控器缺少集中器序列号，这会导致控制失败');
      }
      if (!this.concentratorManagedDevice.concentrator_subscription_type) {
        issues.push('❌ 集中器缺少订阅类型配置');
      }
    }
    
    if (issues.length > 0) {
      console.log('🚨 发现的问题:');
      issues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue}`);
      });
    } else {
      console.log('✅ 未发现明显问题，配置看起来正常');
    }
    
    console.log('\n📋 建议检查项:');
    console.log('1. 确保所有温控器设备都有正确的IMEI号');
    console.log('2. 确保集中器管理的温控器都设置了concentrator_sequence_id (1-48)');
    console.log('3. 确保设备的厂商代码和订阅类型配置正确');
    console.log('4. 确保协议配置中包含完整的开机命令模板');
    console.log('5. 检查MQTT主题构建逻辑是否正确');
  }

  /**
   * 输出MQTT主题信息
   */
  outputMqttTopics() {
    console.log('\n=== 5. MQTT主题信息 ===\n');
    
    if (this.independentDevice) {
      console.log('🔸 独立温控器MQTT主题:');
      const independentTopic = `zhhl/${this.independentDevice.manufacturer_code}/${this.independentDevice.imei}/subscribe`;
      console.log(`   主题: ${independentTopic}`);
      console.log(`   厂商: ${this.independentDevice.manufacturer_code}`);
      console.log(`   订阅类型: ${this.independentDevice.subscription_type}\n`);
    }
    
    if (this.concentratorManagedDevice) {
      console.log('🔸 集中器管理温控器MQTT主题:');
      const concentratorTopic = `zhhl/${this.concentratorManagedDevice.concentrator_manufacturer_code}/${this.concentratorManagedDevice.concentrator_imei}/subscribe`;
      console.log(`   主题: ${concentratorTopic}`);
      console.log(`   厂商: ${this.concentratorManagedDevice.concentrator_manufacturer_code}`);
      console.log(`   订阅类型: ${this.concentratorManagedDevice.concentrator_subscription_type}`);
      console.log(`   温控器序列号: ${this.concentratorManagedDevice.concentrator_sequence_id}\n`);
    }
  }

  /**
   * 运行完整的对比分析
   */
  async run() {
    try {
      console.log('🔍 温控器开机命令JSON格式对比分析工具\n');
      console.log('=' .repeat(60));
      
      // 1. 查询设备
      await this.queryDevices();
      
      // 2. 对比命令格式
      this.compareCommands();
      
      // 3. 分析潜在问题
      this.analyzePotentialIssues();
      
      // 4. 输出MQTT主题信息
      this.outputMqttTopics();
      
      console.log('=' .repeat(60));
      console.log('✅ 分析完成');
      
    } catch (error) {
      console.error('❌ 分析过程中发生错误:', error.message);
      console.error(error.stack);
    } finally {
      // 关闭数据库连接
      if (db && db.end) {
        await db.end();
      }
    }
  }
}

// 运行对比分析
const comparator = new ThermostatCommandComparator();
comparator.run().catch(console.error);