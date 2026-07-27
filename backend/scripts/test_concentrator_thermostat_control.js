const db = require('../utils/database');
const { pool } = require('../utils/database');
const logger = require('../utils/logger');
const thermostatService = require('../services/thermostatService');

/**
 * 集中器管理的温控器控制功能综合测试脚本
 * 测试集中器下温控器的各种控制功能是否正常运行
 */
class ConcentratorThermostatControlTest {
  constructor() {
    this.testDevices = [
      { name: '1号楼1层东区-1001房间', expectedSequenceId: 1 },
      { name: '1号楼1层东区-1002房间', expectedSequenceId: 2 },
      { name: '1号楼1层东区-1003房间', expectedSequenceId: 3 },
      { name: '1号楼1层东区-1004房间', expectedSequenceId: 4 }
    ];
    
    this.testResults = {
      deviceValidation: [],
      controlTests: [],
      mqttTests: [],
      errors: []
    };
  }

  /**
   * 执行完整的测试流程
   */
  async runTests() {
    console.log('🚀 开始集中器温控器控制功能测试...\n');
    
    try {
      // 1. 查询和验证设备
      await this.validateDevices();
      
      // 2. 测试控制功能
      await this.testControlFunctions();
      
      // 3. 验证MQTT主题构建
      await this.testMqttTopicBuilding();
      
      // 4. 生成测试报告
      this.generateTestReport();
      
    } catch (error) {
      console.error('❌ 测试执行失败:', error);
      this.testResults.errors.push({
        type: 'test_execution',
        message: error.message,
        stack: error.stack
      });
    } finally {
      await this.cleanup();
    }
  }

  /**
   * 验证设备配置和ID分配
   */
  async validateDevices() {
    console.log('=== 1. 设备验证测试 ===\n');
    
    for (const testDevice of this.testDevices) {
      try {
        console.log(`🔍 验证设备: ${testDevice.name}`);
        
        // 查询设备详细信息
        const deviceQuery = `
          SELECT 
            d.id,
            d.name,
            d.device_id,
            d.imei,
            d.parent_device_id,
            d.concentrator_id,
            d.concentrator_sequence_id,
            d.manufacturer_code,
            d.configuration,
            d.protocol_config_id,
            d.status,
            dt.name as device_type,
            -- 集中器信息
            cd.name as concentrator_name,
            cd.imei as concentrator_imei,
            cd.manufacturer_code as concentrator_manufacturer_code
          FROM devices d
          JOIN device_types dt ON d.device_type_id = dt.id
          LEFT JOIN devices cd ON d.concentrator_id = cd.id
          WHERE d.name = $1 AND dt.name = '空调温控器'
        `;
        
        const result = await db.query(deviceQuery, [testDevice.name]);
        
        if (result.rows.length === 0) {
          const error = `设备未找到: ${testDevice.name}`;
          console.log(`   ❌ ${error}`);
          this.testResults.deviceValidation.push({
            deviceName: testDevice.name,
            status: 'failed',
            error: error
          });
          continue;
        }
        
        const device = result.rows[0];
        
        console.log(`   📋 设备ID: ${device.id}`);
        console.log(`   📋 设备编号: ${device.device_id}`);
        console.log(`   📋 IMEI: ${device.imei}`);
        console.log(`   📋 集中器ID: ${device.concentrator_id || '无'}`);
        console.log(`   📋 序列号: ${device.concentrator_sequence_id || '无'}`);
        console.log(`   📋 集中器名称: ${device.concentrator_name || '无'}`);
        console.log(`   📋 协议配置: ${device.configuration ? '有' : '无'}`);
        console.log(`   📋 协议配置ID: ${device.protocol_config_id || '无'}`);
        
        // 验证集中器管理配置
        const validationResult = this.validateDeviceConfiguration(device, testDevice);
        
        if (validationResult.isValid) {
          console.log(`   ✅ 设备配置验证通过`);
        } else {
          console.log(`   ❌ 设备配置验证失败: ${validationResult.errors.join(', ')}`);
        }
        
        this.testResults.deviceValidation.push({
          deviceName: testDevice.name,
          deviceId: device.id,
          status: validationResult.isValid ? 'passed' : 'failed',
          device: device,
          validation: validationResult
        });
        
        console.log('');
        
      } catch (error) {
        console.log(`   ❌ 验证失败: ${error.message}`);
        this.testResults.deviceValidation.push({
          deviceName: testDevice.name,
          status: 'error',
          error: error.message
        });
      }
    }
  }

  /**
   * 验证单个设备的配置
   */
  validateDeviceConfiguration(device, testDevice) {
    const errors = [];
    
    // 检查是否为集中器管理的温控器
    if (!device.concentrator_id) {
      errors.push('缺少concentrator_id');
    }
    
    if (!device.concentrator_sequence_id) {
      errors.push('缺少concentrator_sequence_id');
    } else if (device.concentrator_sequence_id !== testDevice.expectedSequenceId) {
      errors.push(`序列号不匹配，期望: ${testDevice.expectedSequenceId}, 实际: ${device.concentrator_sequence_id}`);
    }
    
    if (!device.concentrator_name) {
      errors.push('集中器信息缺失');
    }
    
    if (!device.configuration && !device.protocol_config_id) {
      errors.push('缺少协议配置');
    }
    
    if (!device.imei) {
      errors.push('缺少IMEI');
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * 测试各种控制功能
   */
  async testControlFunctions() {
    console.log('=== 2. 控制功能测试 ===\n');
    
    // 只测试第一个设备，避免发送过多控制命令
    const validDevices = this.testResults.deviceValidation.filter(d => d.status === 'passed');
    
    if (validDevices.length === 0) {
      console.log('❌ 没有有效的设备可供测试');
      return;
    }
    
    const testDevice = validDevices[0];
    const device = testDevice.device;
    
    console.log(`🎯 使用设备进行控制测试: ${device.name}`);
    console.log(`   设备ID: ${device.id}`);
    console.log(`   集中器序列号: ${device.concentrator_sequence_id}\n`);
    
    // 模拟用户信息
    const mockUser = {
      id: 'test-user-id',
      tenant_id: device.tenant_id || '4a5a7e77-22f1-4601-9b37-77f88ca2fd4b'
    };
    
    // 测试各种控制功能
    const controlTests = [
      {
        name: '开机控制',
        action: 'powerOn',
        test: () => this.testPowerOn(device.id, mockUser)
      },
      {
        name: '温度设置',
        action: 'setTemperature',
        test: () => this.testSetTemperature(device.id, 24, mockUser)
      },
      {
        name: '模式切换',
        action: 'setMode',
        test: () => this.testSetMode(device.id, 'cool', mockUser)
      },
      {
        name: '风速调节',
        action: 'setFanSpeed',
        test: () => this.testSetFanSpeed(device.id, 2, mockUser)
      },
      {
        name: '关机控制',
        action: 'powerOff',
        test: () => this.testPowerOff(device.id, mockUser)
      }
    ];
    
    for (const controlTest of controlTests) {
      try {
        console.log(`🔧 测试 ${controlTest.name}...`);
        
        const result = await controlTest.test();
        
        console.log(`   ✅ ${controlTest.name} 测试通过`);
        console.log(`   📤 MQTT主题: ${result.topic || '未获取到'}`);
        console.log(`   📝 控制命令: ${JSON.stringify(result.command, null, 2)}`);
        
        // 检查命令中的ID字段
        if (result.command && result.command.body && result.command.body.id) {
          const commandId = result.command.body.id;
          if (Array.isArray(commandId) && commandId[0] === device.concentrator_sequence_id) {
            console.log(`   ✅ ID字段正确: [${commandId[0]}]`);
          } else {
            console.log(`   ❌ ID字段错误: 期望 [${device.concentrator_sequence_id}], 实际 ${JSON.stringify(commandId)}`);
          }
        } else {
          console.log(`   ⚠️  未找到ID字段`);
        }
        
        this.testResults.controlTests.push({
          deviceId: device.id,
          action: controlTest.action,
          status: 'passed',
          result: result
        });
        
      } catch (error) {
        console.log(`   ❌ ${controlTest.name} 测试失败: ${error.message}`);
        
        this.testResults.controlTests.push({
          deviceId: device.id,
          action: controlTest.action,
          status: 'failed',
          error: error.message
        });
      }
      
      console.log('');
    }
  }

  /**
   * 测试开机控制
   */
  async testPowerOn(deviceId, user) {
    // 模拟调用 thermostatService.powerOnDevice
    const settings = { target_temp: 24, mode: 'cool', fan_speed: 2 };
    
    // 这里我们不实际发送MQTT消息，只测试命令构建
    const mockResult = await this.mockControlCommand(deviceId, 'power_on', settings, user);
    
    return {
      topic: mockResult.topic,
      command: mockResult.command,
      success: true
    };
  }

  /**
   * 测试关机控制
   */
  async testPowerOff(deviceId, user) {
    const mockResult = await this.mockControlCommand(deviceId, 'power_off', {}, user);
    
    return {
      topic: mockResult.topic,
      command: mockResult.command,
      success: true
    };
  }

  /**
   * 测试温度设置
   */
  async testSetTemperature(deviceId, temperature, user) {
    const mockResult = await this.mockControlCommand(deviceId, 'set_temperature', { target_temp: temperature }, user);
    
    return {
      topic: mockResult.topic,
      command: mockResult.command,
      success: true
    };
  }

  /**
   * 测试模式切换
   */
  async testSetMode(deviceId, mode, user) {
    const mockResult = await this.mockControlCommand(deviceId, 'set_mode', { mode: mode }, user);
    
    return {
      topic: mockResult.topic,
      command: mockResult.command,
      success: true
    };
  }

  /**
   * 测试风速调节
   */
  async testSetFanSpeed(deviceId, fanSpeed, user) {
    const mockResult = await this.mockControlCommand(deviceId, 'set_fan_speed', { fan_speed: fanSpeed }, user);
    
    return {
      topic: mockResult.topic,
      command: mockResult.command,
      success: true
    };
  }

  /**
   * 模拟控制命令构建（不实际发送MQTT）
   */
  async mockControlCommand(deviceId, commandType, settings, user) {
    // 获取设备信息
    const device = await thermostatService.getThermostatDevice(deviceId, user.tenant_id);
    
    if (!device) {
      throw new Error('设备不存在');
    }
    
    // 检查协议配置
    if (!device.configuration && !device.protocol_config_id) {
      throw new Error('设备协议配置不存在');
    }
    
    // 优先使用configuration字段，如果没有则查询protocol_config
    let protocolConfig;
    if (device.configuration) {
      protocolConfig = device.configuration;
    } else {
      // 这里可以根据protocol_config_id查询协议配置表
      // 为简化测试，暂时跳过
      throw new Error('需要查询protocol_config表获取协议配置');
    }
    
    let commands;
    
    if (protocolConfig.commands) {
      commands = protocolConfig.commands;
    } else if (protocolConfig.command_config && protocolConfig.command_config.commands) {
      commands = protocolConfig.command_config.commands;
    } else {
      throw new Error('协议配置中缺少commands对象');
    }
    
    const command = commands[commandType];
    if (!command) {
      throw new Error(`协议配置中缺少${commandType}命令`);
    }
    
    // 构建控制命令
    const controlCommand = JSON.parse(JSON.stringify(command.template));
    
    // 设置设备IMEI作为uuid
    if (controlCommand.uuid !== undefined) {
      controlCommand.uuid = device.imei;
    }
    
    // 根据命令类型设置参数
    switch (commandType) {
      case 'power_on':
        controlCommand.body.setOn = 1;
        if (settings.target_temp && controlCommand.body.setTemp !== undefined) {
          controlCommand.body.setTemp = Math.round(settings.target_temp * 10);
        }
        if (settings.mode && controlCommand.body.setMode !== undefined) {
          controlCommand.body.setMode = thermostatService.convertModeToProtocol(settings.mode);
        }
        if (settings.fan_speed && controlCommand.body.setFan !== undefined) {
          controlCommand.body.setFan = settings.fan_speed;
        }
        break;
        
      case 'power_off':
        controlCommand.body.setOn = 0;
        break;
        
      case 'set_temperature':
        if (controlCommand.body.setTemp !== undefined) {
          controlCommand.body.setTemp = Math.round(settings.target_temp * 10);
        }
        // 移除setOn字段
        if (controlCommand.body.hasOwnProperty('setOn')) {
          delete controlCommand.body.setOn;
        }
        break;
        
      case 'set_mode':
        if (controlCommand.body.setMode !== undefined) {
          controlCommand.body.setMode = thermostatService.convertModeToProtocol(settings.mode);
        }
        // 移除setOn字段
        if (controlCommand.body.hasOwnProperty('setOn')) {
          delete controlCommand.body.setOn;
        }
        break;
        
      case 'set_fan_speed':
        if (controlCommand.body.setFan !== undefined) {
          controlCommand.body.setFan = settings.fan_speed;
        }
        // 移除setOn字段
        if (controlCommand.body.hasOwnProperty('setOn')) {
          delete controlCommand.body.setOn;
        }
        break;
    }
    
    // 设置ID字段（使用集中器序列号）
    await this.setMockDynamicCommandId(controlCommand, deviceId);
    
    // 构建MQTT主题
    const topic = thermostatService.buildMqttTopic(device);
    
    return {
      topic: topic,
      command: controlCommand
    };
  }

  /**
   * 模拟设置动态命令ID
   */
  async setMockDynamicCommandId(controlCommand, deviceId) {
    if (!controlCommand.body.id) {
      // 查询设备的集中器序列号
      const query = `
        SELECT concentrator_sequence_id 
        FROM devices 
        WHERE id = $1
      `;
      
      const result = await db.query(query, [deviceId]);
      
      if (result.rows.length > 0 && result.rows[0].concentrator_sequence_id) {
        controlCommand.body.id = [result.rows[0].concentrator_sequence_id];
      } else {
        controlCommand.body.id = [1]; // 默认值
      }
    }
  }

  /**
   * 测试MQTT主题构建
   */
  async testMqttTopicBuilding() {
    console.log('=== 3. MQTT主题构建测试 ===\n');
    
    const validDevices = this.testResults.deviceValidation.filter(d => d.status === 'passed');
    
    for (const testDevice of validDevices) {
      try {
        console.log(`🔗 测试设备MQTT主题: ${testDevice.deviceName}`);
        
        const device = testDevice.device;
        const topic = thermostatService.buildMqttTopic(device);
        
        console.log(`   📤 MQTT主题: ${topic}`);
        
        // 验证主题格式
        if (topic && topic.includes('/')) {
          console.log(`   ✅ 主题格式正确`);
          
          this.testResults.mqttTests.push({
            deviceId: device.id,
            deviceName: device.name,
            status: 'passed',
            topic: topic
          });
        } else {
          console.log(`   ❌ 主题格式错误`);
          
          this.testResults.mqttTests.push({
            deviceId: device.id,
            deviceName: device.name,
            status: 'failed',
            error: '主题格式错误'
          });
        }
        
      } catch (error) {
        console.log(`   ❌ MQTT主题构建失败: ${error.message}`);
        
        this.testResults.mqttTests.push({
          deviceId: testDevice.device.id,
          deviceName: testDevice.deviceName,
          status: 'error',
          error: error.message
        });
      }
      
      console.log('');
    }
  }

  /**
   * 生成测试报告
   */
  generateTestReport() {
    console.log('=== 📊 测试结果摘要 ===\n');
    
    // 设备验证结果
    const deviceTests = this.testResults.deviceValidation;
    const devicePassed = deviceTests.filter(t => t.status === 'passed').length;
    const deviceFailed = deviceTests.filter(t => t.status === 'failed').length;
    const deviceErrors = deviceTests.filter(t => t.status === 'error').length;
    
    console.log('📋 设备验证结果:');
    console.log(`   ✅ 通过: ${devicePassed} 个`);
    console.log(`   ❌ 失败: ${deviceFailed} 个`);
    console.log(`   🚫 错误: ${deviceErrors} 个`);
    
    // 控制功能测试结果
    const controlTests = this.testResults.controlTests;
    const controlPassed = controlTests.filter(t => t.status === 'passed').length;
    const controlFailed = controlTests.filter(t => t.status === 'failed').length;
    
    console.log('\n🎮 控制功能测试结果:');
    console.log(`   ✅ 通过: ${controlPassed} 个`);
    console.log(`   ❌ 失败: ${controlFailed} 个`);
    
    // MQTT测试结果
    const mqttTests = this.testResults.mqttTests;
    const mqttPassed = mqttTests.filter(t => t.status === 'passed').length;
    const mqttFailed = mqttTests.filter(t => t.status === 'failed').length;
    const mqttErrors = mqttTests.filter(t => t.status === 'error').length;
    
    console.log('\n📡 MQTT主题测试结果:');
    console.log(`   ✅ 通过: ${mqttPassed} 个`);
    console.log(`   ❌ 失败: ${mqttFailed} 个`);
    console.log(`   🚫 错误: ${mqttErrors} 个`);
    
    // 检查是否还有"缺少concentrator_sequence_id"的错误
    const sequenceIdErrors = deviceTests.filter(t => 
      t.validation && t.validation.errors && 
      t.validation.errors.some(e => e.includes('concentrator_sequence_id'))
    );
    
    if (sequenceIdErrors.length > 0) {
      console.log('\n⚠️  发现concentrator_sequence_id相关问题:');
      sequenceIdErrors.forEach(test => {
        console.log(`   - ${test.deviceName}: ${test.validation.errors.join(', ')}`);
      });
    } else {
      console.log('\n✅ 未发现concentrator_sequence_id相关问题');
    }
    
    // 总体结果
    const totalTests = deviceTests.length + controlTests.length + mqttTests.length;
    const totalPassed = devicePassed + controlPassed + mqttPassed;
    const totalFailed = deviceFailed + controlFailed + mqttFailed + deviceErrors + mqttErrors;
    
    console.log('\n🎯 总体测试结果:');
    console.log(`   📊 总测试数: ${totalTests}`);
    console.log(`   ✅ 通过: ${totalPassed} (${Math.round(totalPassed / totalTests * 100)}%)`);
    console.log(`   ❌ 失败: ${totalFailed} (${Math.round(totalFailed / totalTests * 100)}%)`);
    
    if (totalFailed === 0) {
      console.log('\n🎉 所有测试通过！集中器温控器控制功能正常运行。');
    } else {
      console.log('\n⚠️  部分测试失败，请检查上述问题并进行修复。');
    }
    
    // 输出详细错误信息
    if (this.testResults.errors.length > 0) {
      console.log('\n🚫 执行错误详情:');
      this.testResults.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.type}: ${error.message}`);
      });
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    try {
      // 关闭数据库连接
      if (pool && pool.end) {
        await pool.end();
        console.log('\n✅ 数据库连接已关闭');
      }
    } catch (error) {
      console.error('清理资源失败:', error);
    }
  }
}

// 执行测试
async function main() {
  const tester = new ConcentratorThermostatControlTest();
  await tester.runTests();
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(error => {
    console.error('测试执行失败:', error);
    process.exit(1);
  });
}

module.exports = ConcentratorThermostatControlTest;