/**
 * 电表MQTT数据服务
 * 通过MQTT连接处理电表数据，而不是直接建立Modbus TCP连接
 * 每个电表通过所属设备的MQTT连接发布数据
 */

const { Device, ElectricMeter, ProtocolConfig, DeviceData, Tenant } = require('../models');
const logger = require('../utils/logger');
const WebSocketService = require('./websocketService');
const ModbusRtuUtils = require('../utils/modbusRtuUtils');
const ModbusParser = require('../utils/modbusParser');
const tenantElectricMeterDataService = require('./tenantElectricMeterDataService');
const ElectricMeterDataAggregator = require('./electricMeterDataAggregator');
const ElectricMeterIndividualQueryService = require('./electricMeterIndividualQueryService');
const electricMeterPollingConfig = require('../config/electricMeterPolling');

class ElectricMeterMqttService {
  constructor() {
    this.pollingIntervals = new Map(); // 存储轮询定时器
    this.deviceElectricMeters = new Map(); // 缓存设备的电表列表
    this.mqttService = null; // MQTT服务实例
    this.dataAggregator = new ElectricMeterDataAggregator(); // 数据聚合器
    this.enableDataAggregation = true; // 是否启用数据聚合功能
    this.individualQueryService = null; // 逐条查询服务
    this.useIndividualQuery = true; // 使用逐条查询模式
  }

  /**
   * 初始化服务
   */
  async initialize() {
    try {
      // 获取MQTT服务实例
      this.mqttService = global.mqttServiceInstance;
      if (!this.mqttService) {
        throw new Error('MQTT服务未初始化');
      }

      // 初始化逐条查询服务
      this.individualQueryService = new ElectricMeterIndividualQueryService(this.mqttService);

      logger.info('电表MQTT数据服务初始化成功', {
        useIndividualQuery: this.useIndividualQuery
      });
      
      // 延迟启动，等待系统完全初始化
      setTimeout(() => {
        this.startAllDevicePolling();
      }, 10000); // 10秒延迟
      
    } catch (error) {
      logger.error('电表MQTT数据服务初始化失败:', error);
      throw error;
    }
  }

  /**
   * 启动所有设备的电表数据轮询
   */
  async startAllDevicePolling() {
    try {
      logger.info('开始启动所有设备的电表数据轮询...');

      // 查找所有有电表的设备
      const devicesWithMeters = await this.findDevicesWithElectricMeters();
      
      if (devicesWithMeters.length === 0) {
        logger.info('未找到配置电表的设备');
        return;
      }

      logger.info(`找到 ${devicesWithMeters.length} 个配置了电表的设备，开始启动轮询...`);

      // 为每个设备启动轮询
      for (const device of devicesWithMeters) {
        await this.startDevicePolling(device);
        // 设备间启动间隔，避免同时启动造成负载
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.info('所有设备电表轮询启动完成');
    } catch (error) {
      logger.error('启动设备电表轮询失败:', error);
    }
  }

  /**
   * 查找所有配置了电表的设备
   */
  async findDevicesWithElectricMeters() {
    try {
      const devices = await Device.findAll({
        include: [{
          model: ElectricMeter,
          as: 'electric_meters',
          where: { status: 'active' },
          include: [{
            model: ProtocolConfig,
            as: 'protocol_config',
            where: { 
              protocol_type: 'modbus',
              status: 'active' 
            }
          }]
        }],
        where: {
          status: ['active', 'online']
        }
      });

      return devices.filter(device => device.electric_meters && device.electric_meters.length > 0);
    } catch (error) {
      logger.error('查找配置电表的设备失败:', error);
      return [];
    }
  }

  /**
   * 启动单个设备的电表数据轮询
   * @param {Object} device - 设备对象
   * @param {Object} options - 选项 { useRtuFormat: boolean }
   */
  async startDevicePolling(device, options = {}) {
    try {
      const deviceKey = `${device.id}`;
      
      // 停止现有轮询
      this.stopDevicePolling(deviceKey);

      // 缓存设备的电表列表
      this.deviceElectricMeters.set(deviceKey, device.electric_meters);

      // 只从Modbus协议配置中获取轮询间隔
      let pollingInterval = null;
      
      // 检查电表的协议配置中是否有轮询间隔设置
      if (device.electric_meters && device.electric_meters.length > 0) {
        const firstMeter = device.electric_meters[0];
        if (firstMeter.protocol_config && firstMeter.protocol_config.modbus_config) {
          const modbusConfig = firstMeter.protocol_config.modbus_config;
          if (modbusConfig.polling_interval && modbusConfig.polling_interval > 0) {
            pollingInterval = modbusConfig.polling_interval;
            logger.info(`使用Modbus协议配置中的轮询间隔: ${pollingInterval}ms`);
          }
        }
      }
      
      // 如果没有Modbus协议配置的轮询间隔，不启动轮询
      if (!pollingInterval) {
        logger.warn(`设备 ${device.name} (${device.id}) 未配置Modbus轮询间隔，跳过电表数据轮询`);
        return;
      }

      // 创建轮询定时器 - 默认使用RTU格式
      const intervalId = setInterval(async () => {
        try {
          await this.pollDeviceElectricMeters(device, { useRtuFormat: true });
        } catch (error) {
          logger.error(`设备 ${device.id} 电表数据轮询失败:`, error);
        }
      }, pollingInterval);

      this.pollingIntervals.set(deviceKey, intervalId);
      
      logger.info(`设备 ${device.name} (${device.id}) 电表数据轮询已启动`, {
        deviceId: device.id,
        meterCount: device.electric_meters.length,
        pollingInterval: `${pollingInterval}ms`
      });

      // 立即执行一次轮询 - 默认使用RTU格式
      setTimeout(() => {
        this.pollDeviceElectricMeters(device, { useRtuFormat: true });
      }, 5000); // 5秒后执行第一次轮询

    } catch (error) {
      logger.error(`启动设备 ${device.id} 电表轮询失败:`, error);
    }
  }

  /**
   * 停止设备的电表数据轮询
   * @param {string} deviceKey - 设备键
   */
  stopDevicePolling(deviceKey) {
    const intervalId = this.pollingIntervals.get(deviceKey);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(deviceKey);
      this.deviceElectricMeters.delete(deviceKey);
      logger.info(`设备 ${deviceKey} 电表轮询已停止`);
    }
  }

  /**
   * 启动定时轮询 - 已废弃，只保留Modbus协议配置中的轮询间隔
   * @param {number} intervalMs - 轮询间隔（毫秒）
   * @param {Object} options - 选项 { useRtuFormat: boolean }
   */
  startPolling(intervalMs = 30000, options = {}) {
    logger.warn('startPolling方法已废弃，请使用startDevicePolling并在Modbus协议配置中设置轮询间隔');
    // 不再启动全局定时轮询
  }

  /**
   * 轮询设备的所有电表数据
   * @param {Object} device - 设备对象
   * @param {Object} options - 选项 { useRtuFormat: boolean }
   */
  async pollDeviceElectricMeters(device, options = {}) {
    try {
      const electricMeters = this.deviceElectricMeters.get(`${device.id}`) || device.electric_meters;
      
      if (!electricMeters || electricMeters.length === 0) {
        logger.warn(`设备 ${device.id} 没有配置电表`);
        return;
      }

      const formatInfo = options.useRtuFormat ? ' (RTU格式)' : ' (JSON格式)';
      logger.debug(`开始轮询设备 ${device.name} 的 ${electricMeters.length} 个电表${formatInfo}`);

      // 按电表地址顺序轮询
      const sortedMeters = electricMeters.sort((a, b) => 
        parseInt(a.meter_address) - parseInt(b.meter_address)
      );

      for (let i = 0; i < sortedMeters.length; i++) {
        const electricMeter = sortedMeters[i];
        
        try {
          await this.pollSingleElectricMeter(device, electricMeter, options);
          
          // 电表间轮询间隔，避免冲突
          if (i < sortedMeters.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2秒间隔
          }
        } catch (error) {
          logger.error(`轮询电表 ${electricMeter.meter_number} 失败:`, error);
          // 继续处理下一个电表
        }
      }

      logger.debug(`设备 ${device.name} 电表轮询完成${formatInfo}`);
    } catch (error) {
      logger.error(`设备 ${device.id} 电表轮询失败:`, error);
    }
  }

  /**
   * 轮询单个电表数据
   * @param {Object} device - 设备对象
   * @param {Object} electricMeter - 电表对象
   * @param {Object} options - 选项 { useRtuFormat: boolean }
   */
  async pollSingleElectricMeter(device, electricMeter, options = {}) {
    try {
      // 使用电表的协议配置
      const protocolConfig = electricMeter.protocol_config;
      if (!protocolConfig) {
        throw new Error(`电表 ${electricMeter.meter_number} 缺少协议配置`);
      }

      // 检查modbus_registers字段
      if (!protocolConfig.modbus_registers || !Array.isArray(protocolConfig.modbus_registers)) {
        throw new Error(`电表 ${electricMeter.meter_number} 缺少Modbus寄存器配置`);
      }

      // 默认使用RTU格式，除非明确指定不使用
      const useRtuFormat = options.useRtuFormat !== false && (
        options.useRtuFormat === true || 
        !protocolConfig.communication_config ||
        protocolConfig.communication_config.format !== 'json'
      );

      // 构造Modbus查询命令
      const modbusCommand = this.buildModbusCommand(electricMeter, protocolConfig, { useRtuFormat });
      
      // 如果启用数据聚合，启动聚合会话
      let sessionId = null;
      if (this.enableDataAggregation && useRtuFormat && modbusCommand.rtu_commands) {
        sessionId = this.dataAggregator.startPollingSession(device, electricMeter, modbusCommand.rtu_commands);
        logger.debug(`已启动数据聚合会话`, {
          sessionId,
          meterNumber: electricMeter.meter_number,
          expectedCommands: modbusCommand.rtu_commands.length
        });
      }
      
      // 通过MQTT发布Modbus查询命令
      await this.publishModbusCommand(device, electricMeter, modbusCommand);
      
      const formatInfo = useRtuFormat ? ' (RTU格式)' : ' (JSON格式)';
      const aggregationInfo = sessionId ? ` [聚合会话: ${sessionId}]` : '';
      logger.debug(`已发送电表 ${electricMeter.meter_number} 的Modbus查询命令${formatInfo}${aggregationInfo}`);
      
    } catch (error) {
      logger.error(`轮询电表 ${electricMeter.meter_number} 失败:`, error);
      throw error;
    }
  }

  /**
   * 构造Modbus查询命令 - 使用逐条查询模式
   * @param {Object} electricMeter - 电表对象
   * @param {Object} protocolConfig - 协议配置
   * @param {Object} options - 选项 { useRtuFormat: boolean }
   */
  buildModbusCommand(electricMeter, protocolConfig, options = {}) {
    const meterAddress = parseInt(electricMeter.meter_address);
    
    const command = {
      type: 'modbus_query',
      meter_address: meterAddress,
      meter_id: electricMeter.id,
      meter_number: electricMeter.meter_number,
      timestamp: new Date().toISOString(),
      queries: [],
      format: options.useRtuFormat ? 'rtu' : 'json',
      query_mode: this.useIndividualQuery ? 'individual' : 'batch' // 标记查询模式
    };

    // 如果使用RTU格式，添加RTU字节流指令
    if (options.useRtuFormat) {
      command.rtu_commands = [];
    }

    // 根据协议配置的modbus_registers构造查询
    if (protocolConfig.modbus_registers && Array.isArray(protocolConfig.modbus_registers)) {
      let queries;
      
      if (this.useIndividualQuery && this.individualQueryService) {
        // 使用逐条查询模式
        queries = this.individualQueryService.generateIndividualQueries(
          protocolConfig.modbus_registers, 
          protocolConfig
        );
        
        logger.info(`生成逐条查询命令`, {
          meterNumber: electricMeter.meter_number,
          registerCount: protocolConfig.modbus_registers.length,
          queryCount: queries.length,
          mode: '逐条查询'
        });
      } else {
        // 使用原有的批量查询优化（保留作为备选）
        queries = this.optimizeRegisterQueries(protocolConfig.modbus_registers, protocolConfig);
        
        logger.info(`生成批量查询命令`, {
          meterNumber: electricMeter.meter_number,
          registerCount: protocolConfig.modbus_registers.length,
          queryCount: queries.length,
          mode: '批量查询'
        });
      }
      
      // 处理查询命令
      for (const query of queries) {
        command.queries.push(query);
        
        // 如果使用RTU格式，生成对应的RTU字节流
        if (options.useRtuFormat) {
          try {
            let rtuBuffer;
            
            switch (query.function_code) {
              case 3: // 读取保持寄存器
                rtuBuffer = ModbusRtuUtils.buildReadHoldingRegistersRTU(
                  meterAddress,
                  query.start_address,
                  query.quantity
                );
                break;
              case 4: // 读取输入寄存器
                rtuBuffer = ModbusRtuUtils.buildReadInputRegistersRTU(
                  meterAddress,
                  query.start_address,
                  query.quantity
                );
                break;
              default:
                logger.warn(`不支持的RTU功能码: ${query.function_code}`);
                continue;
            }
            
            if (rtuBuffer) {
              const hexString = ModbusRtuUtils.bufferToHexString(rtuBuffer);
              const queryType = this.useIndividualQuery ? '逐条' : '批量';
              
              command.rtu_commands.push({
                register_names: query.register_names || [`register_${query.start_address}`],
                description: query.description || `${queryType}读取地址${query.start_address}`,
                function_code: query.function_code,
                start_address: query.start_address,
                count: query.quantity,
                quantity: query.quantity,
                hex_command: hexString,
                raw_bytes: Array.from(rtuBuffer),
                register_mapping: query.register_mapping, // 寄存器映射信息
                isSingleQuery: query.isSingleQuery || false // 标记是否为单个查询
              });
              
              logger.debug(`生成${queryType}RTU指令: ${hexString}`, {
                meterAddress,
                functionCode: query.function_code,
                startAddress: query.start_address,
                quantity: query.quantity,
                registers: query.register_names,
                mode: queryType
              });
            }
          } catch (error) {
            logger.error(`生成RTU指令失败:`, error);
          }
        }
      }
    }

    return command;
  }

  /**
   * 优化寄存器查询，将连续的寄存器合并为批量查询
   * @param {Array} registers - 寄存器配置数组
   * @param {Object} protocolConfig - 协议配置
   * @returns {Array} 优化后的查询配置
   */
  optimizeRegisterQueries(registers, protocolConfig) {
    // 获取厂家特定的批量查询配置
    const batchConfig = this.getBatchQueryConfig(protocolConfig);
    
    // 按功能码分组
    const groupedByFunction = {};
    registers.forEach(register => {
      const funcCode = register.function_code;
      if (!groupedByFunction[funcCode]) {
        groupedByFunction[funcCode] = [];
      }
      groupedByFunction[funcCode].push(register);
    });

    const optimizedQueries = [];

    // 对每个功能码组进行优化
    Object.keys(groupedByFunction).forEach(funcCode => {
      const funcRegisters = groupedByFunction[funcCode];
      
      // 按地址排序
      funcRegisters.sort((a, b) => a.address - b.address);
      
      // 合并连续的寄存器
      const mergedQueries = this.mergeConsecutiveRegisters(
        funcRegisters, 
        parseInt(funcCode), 
        batchConfig
      );
      
      optimizedQueries.push(...mergedQueries);
    });

    logger.info(`寄存器查询优化完成`, {
      原始寄存器数量: registers.length,
      优化后查询数量: optimizedQueries.length,
      减少查询数: registers.length - optimizedQueries.length
    });

    return optimizedQueries;
  }

  /**
   * 获取厂家特定的批量查询配置
   * @param {Object} protocolConfig - 协议配置
   * @returns {Object} 批量查询配置
   */
  getBatchQueryConfig(protocolConfig) {
    // 默认配置
    const defaultConfig = {
      maxBatchSize: 10,        // 最大批量寄存器数
      maxGapSize: 2,           // 最大允许的地址间隔
      enableBatchOptimization: true
    };

    // 检查协议配置中是否有厂家特定的批量配置
    if (protocolConfig.batch_config) {
      return { ...defaultConfig, ...protocolConfig.batch_config };
    }

    // 根据厂家或设备类型设置特定配置
    const manufacturer = protocolConfig.manufacturer || '';
    const deviceModel = protocolConfig.device_model || '';
    
    // 厂家特定配置
    const manufacturerConfigs = {
      'ACREL': {
        maxBatchSize: 15,
        maxGapSize: 3,
        enableBatchOptimization: true
      },
      'EASTRON': {
        maxBatchSize: 8,
        maxGapSize: 1,
        enableBatchOptimization: true
      },
      'SCHNEIDER': {
        maxBatchSize: 20,
        maxGapSize: 5,
        enableBatchOptimization: true
      },
      'SIEMENS': {
        maxBatchSize: 12,
        maxGapSize: 2,
        enableBatchOptimization: true
      }
    };

    // 查找匹配的厂家配置
    for (const [mfg, config] of Object.entries(manufacturerConfigs)) {
      if (manufacturer.toUpperCase().includes(mfg)) {
        logger.debug(`使用厂家特定批量配置: ${mfg}`, config);
        return { ...defaultConfig, ...config };
      }
    }

    logger.debug('使用默认批量查询配置', defaultConfig);
    return defaultConfig;
  }

  /**
   * 合并连续的寄存器为批量查询
   * @param {Array} registers - 已排序的寄存器数组
   * @param {number} functionCode - 功能码
   * @param {Object} batchConfig - 批量配置
   * @returns {Array} 合并后的查询配置
   */
  mergeConsecutiveRegisters(registers, functionCode, batchConfig) {
    if (!batchConfig.enableBatchOptimization) {
      // 如果禁用批量优化，返回单个寄存器查询
      return registers.map(register => ({
        function_code: functionCode,
        start_address: register.address,
        quantity: register.count || 1,
        data_type: register.data_type || 'uint16',
        register_names: [register.name || register.description || `register_${register.address}`],
        register_mapping: [{
          name: register.name,
          address: register.address,
          data_type: register.data_type,
          unit: register.unit,
          description: register.description
        }]
      }));
    }

    const mergedQueries = [];
    let currentBatch = null;

    for (const register of registers) {
      const registerSize = register.count || 1;
      const registerEnd = register.address + registerSize - 1;

      if (!currentBatch) {
        // 开始新的批次
        currentBatch = {
          function_code: functionCode,
          start_address: register.address,
          end_address: registerEnd,
          quantity: registerSize,
          register_names: [register.name || register.description || `register_${register.address}`],
          register_mapping: [{
            name: register.name,
            address: register.address,
            data_type: register.data_type,
            unit: register.unit,
            description: register.description,
            offset: 0 // 在批量查询中的偏移量
          }]
        };
      } else {
        const gap = register.address - currentBatch.end_address - 1;
        const newBatchSize = register.address + registerSize - currentBatch.start_address;

        // 检查是否可以合并到当前批次
        if (gap <= batchConfig.maxGapSize && newBatchSize <= batchConfig.maxBatchSize) {
          // 合并到当前批次
          currentBatch.end_address = registerEnd;
          currentBatch.quantity = newBatchSize;
          currentBatch.register_names.push(register.name || register.description || `register_${register.address}`);
          
          // 计算正确的offset：考虑前面寄存器的实际占用空间
          let calculatedOffset = 0;
          for (const existingMapping of currentBatch.register_mapping) {
            if (existingMapping.address < register.address) {
              // 根据数据类型确定寄存器占用的字数
              const registerWords = (existingMapping.data_type === 'uint32' || existingMapping.data_type === 'int32' || existingMapping.data_type === 'float32') ? 2 : 1;
              calculatedOffset += registerWords;
            }
          }
          
          currentBatch.register_mapping.push({
            name: register.name,
            address: register.address,
            data_type: register.data_type,
            unit: register.unit,
            description: register.description,
            offset: calculatedOffset
          });
        } else {
          // 完成当前批次，开始新批次
          mergedQueries.push(currentBatch);
          currentBatch = {
            function_code: functionCode,
            start_address: register.address,
            end_address: registerEnd,
            quantity: registerSize,
            register_names: [register.name || register.description || `register_${register.address}`],
            register_mapping: [{
              name: register.name,
              address: register.address,
              data_type: register.data_type,
              unit: register.unit,
              description: register.description,
              offset: 0
            }]
          };
        }
      }
    }

    // 添加最后一个批次
    if (currentBatch) {
      mergedQueries.push(currentBatch);
    }

    return mergedQueries;
  }

  /**
   * 通过MQTT发布Modbus查询命令
   * @param {Object} device - 设备对象
   * @param {Object} electricMeter - 电表对象
   * @param {Object} command - Modbus命令
   */
  async publishModbusCommand(device, electricMeter, command) {
    try {
      if (!this.mqttService || !this.mqttService.isConnected) {
        throw new Error('MQTT服务未连接');
      }

      // 构造命令主题（发送给设备的命令主题）
      const commandTopic = await this.buildCommandTopic(device, electricMeter);
      
      // 记录命令发送开始日志，包含主题信息
      logger.info(`开始发送电表命令`, {
        deviceId: device.id,
        deviceName: device.name,
        deviceImei: device.imei,
        meterNumber: electricMeter.meter_number,
        meterAddress: electricMeter.meter_address,
        commandTopic: commandTopic,
        commandFormat: command.format || 'json',
        commandCount: command.rtu_commands ? command.rtu_commands.length : 1
      });
      
      if (command.format === 'rtu' && command.rtu_commands && command.rtu_commands.length > 0) {
        // RTU格式：发送所有RTU命令，每个命令间隔一定时间
        logger.info(`准备发送 ${command.rtu_commands.length} 个RTU命令到主题: ${commandTopic}`);
        
        for (let i = 0; i < command.rtu_commands.length; i++) {
          const rtuCommand = command.rtu_commands[i];
          const publishContent = rtuCommand.hex_command;
          
          // 将十六进制字符串转换为Buffer并发布RTU命令
          const commandBuffer = ModbusRtuUtils.hexStringToBuffer(publishContent);
          await this.mqttService.client.publish(
            commandTopic, 
            commandBuffer, 
            { qos: 0 }
          );

          // 记录已发送的命令信息，用于后续响应解析
          const meterAddress = parseInt(electricMeter.meter_address) || 1;
          
          // 获取电表的协议配置
          let protocolConfig = electricMeter.protocol_config;
          if (!protocolConfig && device.protocol_config) {
            protocolConfig = device.protocol_config;
          }
          
          // 检查是否为批量查询命令
          const isBatchQuery = rtuCommand.register_mapping && rtuCommand.register_mapping.length > 1;
          
          this.mqttService.recordSentCommand(
            device.id,
            meterAddress,
            rtuCommand.function_code,
            rtuCommand.start_address,
            rtuCommand.count,
            protocolConfig,
            rtuCommand,
            {
              isBatchQuery: isBatchQuery,
              registerMapping: rtuCommand.register_mapping,
              registerNames: rtuCommand.register_names
            }
          );

          // 增强的日志记录，包含主题和详细信息
          logger.info(`RTU命令已发布`, {
            序号: `${i + 1}/${command.rtu_commands.length}`,
            主题: commandTopic,
            内容: publishContent,
            描述: rtuCommand.description || rtuCommand.register_name,
            设备IMEI: device.imei,
            电表号: electricMeter.meter_number,
            电表地址: electricMeter.meter_address,
            功能码: rtuCommand.function_code,
            起始地址: `0x${rtuCommand.start_address.toString(16).toUpperCase().padStart(4, '0')}`,
            寄存器数量: rtuCommand.count
          });
          
          // 同时保持原有的简洁日志格式，便于快速查看
          logger.info(`RTU命令已发布到MQTT: ${publishContent}`);
          
          // 根据查询模式设置不同的命令间隔
          if (i < command.rtu_commands.length - 1) {
            let interval = electricMeterPollingConfig.commandIntervals.betweenCommands; // 使用配置文件中的间隔
            
            // 如果是逐条查询模式，使用动态间隔
            if (command.query_mode === 'individual' && this.individualQueryService) {
              interval = this.individualQueryService.getQueryInterval(command.rtu_commands.length);
            }
            
            await new Promise(resolve => setTimeout(resolve, interval));
            
            logger.debug(`命令间隔等待完成`, {
              当前命令: i + 1,
              总命令数: command.rtu_commands.length,
              间隔时间: `${interval}ms`,
              查询模式: command.query_mode || 'batch'
            });
          }
        }
        
        logger.info(`电表命令发送完成`, {
          电表号: electricMeter.meter_number,
          主题: commandTopic,
          命令总数: command.rtu_commands.length,
          发送状态: '成功'
        });
        
      } else {
        // JSON格式：发送JSON字符串
        const publishContent = JSON.stringify(command);
        
        await this.mqttService.client.publish(
          commandTopic, 
          publishContent, 
          { qos: 1 }
        );

        logger.info(`JSON命令已发布`, {
          主题: commandTopic,
          内容: publishContent.substring(0, 200) + (publishContent.length > 200 ? '...' : ''),
          设备IMEI: device.imei,
          电表号: electricMeter.meter_number,
          电表地址: electricMeter.meter_address,
          命令类型: command.type,
          查询数量: command.queries ? command.queries.length : 0
        });
      }

    } catch (error) {
      logger.error('发布Modbus查询命令失败', {
        deviceId: device.id,
        deviceImei: device.imei,
        meterNumber: electricMeter.meter_number,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 构造设备命令主题
   * @param {Object} device - 设备对象
   * @param {Object} electricMeter - 电表对象（可选，用于获取DTU设备信息）
   */
  async buildCommandTopic(device, electricMeter = null) {
    // 使用设备的MQTT配置或默认格式
    const mqttConfig = device.mqtt_config || {};
    
    // 优先使用command_topic字段（向后兼容）
    if (mqttConfig.command_topic) {
      return mqttConfig.command_topic;
    }
    
    // 从subscribe_topics数组中查找命令主题
    if (mqttConfig.subscribe_topics && Array.isArray(mqttConfig.subscribe_topics)) {
      const commandTopic = mqttConfig.subscribe_topics.find(topic => 
        topic.description && topic.description.includes('命令') ||
        topic.description && topic.description.includes('command') ||
        topic.topic && topic.topic.includes('subscribe')
      );
      
      if (commandTopic) {
        return commandTopic.topic;
      }
    }
    
    // 确定使用的厂商编号
    let manufacturerCode = device.manufacturer_code || 'BNDK';
    
    // 注释：保持使用设备本身的厂商编号，不使用DTU设备的厂商编号
    // 这是因为MQTT主题应该反映实际发送命令的设备的厂商信息
    
    // 默认命令主题格式
    return `zhhl/${manufacturerCode}/${device.imei}/subscribe`;
  }

  /**
   * 处理设备返回的电表数据
   * @param {Object} device - 设备对象
   * @param {Object} data - 电表数据
   */
  async handleElectricMeterData(device, data) {
    try {
      // 验证数据格式
      if (!data.meter_id || !data.meter_address) {
        throw new Error('电表数据格式无效');
      }

      // 查找对应的电表
      const electricMeter = await ElectricMeter.findOne({
        where: {
          id: data.meter_id,
          device_id: device.id,
          status: 'active'
        }
      });

      if (!electricMeter) {
        throw new Error(`未找到电表: ${data.meter_id}`);
      }

      // 获取电表的协议配置
      let protocolConfig = null;
      
      // 首先尝试从电表获取协议配置
      if (electricMeter.protocol_config_id) {
        const protocolConfigRecord = await ProtocolConfig.findByPk(electricMeter.protocol_config_id);
        if (protocolConfigRecord) {
          protocolConfig = {
            modbus_registers: protocolConfigRecord.modbus_registers,
            data_parsing_config: protocolConfigRecord.data_parsing_config,
            modbus_config: protocolConfigRecord.modbus_config
          };
        }
      }
      
      // 如果电表没有协议配置，则使用设备的协议配置作为备选
      if (!protocolConfig) {
        protocolConfig = device.protocol_config;
      }
      
      if (!protocolConfig) {
        throw new Error(`电表 ${electricMeter.meter_number} 和设备 ${device.name} 都缺少协议配置`);
      }

      // 解析电表数据
      const parsedData = await this.parseElectricMeterData(data, protocolConfig);
      
      // 如果启用数据聚合，尝试添加到聚合会话
      let addedToSession = false;
      if (this.enableDataAggregation && data.command_info) {
        addedToSession = this.dataAggregator.addDataToSession(
          device, 
          electricMeter, 
          data.command_info, 
          data, 
          parsedData
        );
      }
      
      // 如果没有添加到聚合会话，直接保存数据
      if (!addedToSession) {
        await this.saveElectricMeterData(device, electricMeter, parsedData);
      } else {
        logger.debug(`数据已添加到聚合会话`, {
          deviceId: device.id,
          meterNumber: electricMeter.meter_number,
          commandInfo: data.command_info
        });
      }
      
      // 通过WebSocket推送实时数据
      await this.broadcastElectricMeterData(device, electricMeter, parsedData);
      
      logger.debug(`电表数据处理完成`, {
        deviceId: device.id,
        meterNumber: electricMeter.meter_number,
        meterAddress: electricMeter.meter_address
      });

    } catch (error) {
      logger.error('处理电表数据失败:', error);
    }
  }

  /**
   * 解析电表数据
   * @param {Object} rawData - 原始数据
   * @param {Object} protocolConfig - 协议配置
   */
  async parseElectricMeterData(rawData, protocolConfig) {
    try {
      // 优先使用原始数据中的timestamp，如果无效则使用当前时间
      let validTimestamp;
      if (rawData.timestamp) {
        const timestampDate = new Date(rawData.timestamp);
        if (isNaN(timestampDate.getTime())) {
          logger.warn(`原始数据中的timestamp无效: ${rawData.timestamp}，使用当前时间`);
          validTimestamp = new Date();
        } else {
          validTimestamp = timestampDate;
        }
      } else {
        validTimestamp = new Date();
      }

      const parsedData = {
        timestamp: validTimestamp,
        raw_data: rawData
      };

      // 解析寄存器数据
      if (rawData.register_data) {
        // 优先使用新的协议配置格式 (modbus_registers)
        if (protocolConfig.modbus_registers && Array.isArray(protocolConfig.modbus_registers)) {
          const registers = protocolConfig.modbus_registers;
          
          for (const registerConfig of registers) {
            const address = registerConfig.address;
            const registerName = registerConfig.name || registerConfig.description || `register_${address}`;
            const dataType = registerConfig.dataType || 'uint16';
            const length = registerConfig.length || 1;
            const byteOrder = registerConfig.byteOrder || 'BE';
            
            // 根据数据类型和长度获取原始值
            let rawValue;
            if (dataType === 'uint32' || dataType === 'int32' || dataType === 'float32') {
              // 32位数据类型需要2个连续寄存器
              const addr1 = rawData.register_data[address] || rawData.register_data[address.toString()];
              const addr2 = rawData.register_data[address + 1] || rawData.register_data[(address + 1).toString()];
              
              if (addr1 !== undefined && addr1 !== null && addr2 !== undefined && addr2 !== null) {
                // 使用ModbusParser解析32位数据
                switch (dataType) {
                  case 'uint32':
                    rawValue = byteOrder === 'BE' 
                      ? ModbusParser.parseUint32BE(addr1, addr2)
                      : ModbusParser.parseUint32LE(addr1, addr2);
                    break;
                  case 'int32':
                    rawValue = byteOrder === 'BE'
                      ? ModbusParser.parseInt32BE(addr1, addr2)
                      : ModbusParser.parseInt32LE(addr1, addr2);
                    break;
                  case 'float32':
                    rawValue = byteOrder === 'BE'
                      ? ModbusParser.parseFloat32BE(addr1, addr2)
                      : ModbusParser.parseFloat32LE(addr1, addr2);
                    break;
                }
                
                logger.debug(`解析32位数据: ${registerName} [${addr1}, ${addr2}] -> ${rawValue}`, {
                  address,
                  dataType,
                  byteOrder,
                  registers: [addr1, addr2],
                  result: rawValue
                });
              }
            } else {
              // 16位数据类型
              const singleValue = rawData.register_data[address] || rawData.register_data[address.toString()];
              if (singleValue !== undefined && singleValue !== null) {
                switch (dataType) {
                  case 'int16':
                    rawValue = ModbusParser.parseInt16(singleValue);
                    break;
                  case 'uint16':
                  default:
                    rawValue = ModbusParser.parseUint16(singleValue);
                    break;
                }
              }
            }
            
            if (rawValue !== undefined && rawValue !== null) {
              const scale = registerConfig.scale || 1;
              const offset = registerConfig.offset || 0;
              const calculatedValue = (rawValue * scale) + offset;
              
              // 根据寄存器名称映射到标准数据库列名
              const dbColumnName = this.mapRegisterNameToDbColumn(registerName);
              parsedData[dbColumnName] = calculatedValue;
              
              logger.debug(`解析寄存器数据: ${registerName} -> ${dbColumnName} = (${rawValue} * ${scale}) + ${offset} = ${calculatedValue}`, {
                address,
                registerName,
                dbColumnName,
                dataType,
                rawValue,
                scale,
                offset,
                result: calculatedValue
              });
            }
          }
        }
        // 兼容data_parsing_config格式
        else if (protocolConfig.data_parsing_config && protocolConfig.data_parsing_config.modbus && protocolConfig.data_parsing_config.modbus.registers) {
          const registers = protocolConfig.data_parsing_config.modbus.registers;
          
          for (const registerConfig of registers) {
            const address = registerConfig.address;
            const registerName = registerConfig.name || registerConfig.description || `register_${address}`;
            const dataType = registerConfig.dataType || 'uint16';
            const length = registerConfig.length || 1;
            const byteOrder = registerConfig.byteOrder || 'BE';
            
            // 根据数据类型和长度获取原始值
            let rawValue;
            if (dataType === 'uint32' || dataType === 'int32' || dataType === 'float32') {
              // 32位数据类型需要2个连续寄存器
              const addr1 = rawData.register_data[address] || rawData.register_data[address.toString()];
              const addr2 = rawData.register_data[address + 1] || rawData.register_data[(address + 1).toString()];
              
              if (addr1 !== undefined && addr1 !== null && addr2 !== undefined && addr2 !== null) {
                // 使用ModbusParser解析32位数据
                switch (dataType) {
                  case 'uint32':
                    rawValue = byteOrder === 'BE' 
                      ? ModbusParser.parseUint32BE(addr1, addr2)
                      : ModbusParser.parseUint32LE(addr1, addr2);
                    break;
                  case 'int32':
                    rawValue = byteOrder === 'BE'
                      ? ModbusParser.parseInt32BE(addr1, addr2)
                      : ModbusParser.parseInt32LE(addr1, addr2);
                    break;
                  case 'float32':
                    rawValue = byteOrder === 'BE'
                      ? ModbusParser.parseFloat32BE(addr1, addr2)
                      : ModbusParser.parseFloat32LE(addr1, addr2);
                    break;
                }
              }
            } else {
              // 16位数据类型
              const singleValue = rawData.register_data[address] || rawData.register_data[address.toString()];
              if (singleValue !== undefined && singleValue !== null) {
                switch (dataType) {
                  case 'int16':
                    rawValue = ModbusParser.parseInt16(singleValue);
                    break;
                  case 'uint16':
                  default:
                    rawValue = ModbusParser.parseUint16(singleValue);
                    break;
                }
              }
            }
            
            if (rawValue !== undefined && rawValue !== null) {
              const scale = registerConfig.scale || 1;
              const offset = registerConfig.offset || 0;
              const calculatedValue = (rawValue * scale) + offset;
              
              // 根据寄存器名称映射到标准数据库列名
              const dbColumnName = this.mapRegisterNameToDbColumn(registerName);
              parsedData[dbColumnName] = calculatedValue;
              
              logger.debug(`解析寄存器数据: ${registerName} -> ${dbColumnName} = (${rawValue} * ${scale}) + ${offset} = ${calculatedValue}`, {
                address,
                registerName,
                dbColumnName,
                dataType,
                rawValue,
                scale,
                offset,
                result: calculatedValue
              });
            }
          }
        }
        // 兼容旧的协议配置格式
        else if (protocolConfig.modbus_config && protocolConfig.modbus_config.registers) {
          const registers = protocolConfig.modbus_config.registers || {};
          
          for (const [registerName, registerConfig] of Object.entries(registers)) {
            const address = registerConfig.address;
            const dataType = registerConfig.dataType || 'uint16';
            const length = registerConfig.length || 1;
            const byteOrder = registerConfig.byteOrder || 'BE';
            
            // 根据数据类型和长度获取原始值
            let rawValue;
            if (dataType === 'uint32' || dataType === 'int32' || dataType === 'float32') {
              // 32位数据类型需要2个连续寄存器
              const addr1 = rawData.register_data[address] || rawData.register_data[address.toString()];
              const addr2 = rawData.register_data[address + 1] || rawData.register_data[(address + 1).toString()];
              
              if (addr1 !== undefined && addr1 !== null && addr2 !== undefined && addr2 !== null) {
                // 使用ModbusParser解析32位数据
                switch (dataType) {
                  case 'uint32':
                    rawValue = byteOrder === 'BE' 
                      ? ModbusParser.parseUint32BE(addr1, addr2)
                      : ModbusParser.parseUint32LE(addr1, addr2);
                    break;
                  case 'int32':
                    rawValue = byteOrder === 'BE'
                      ? ModbusParser.parseInt32BE(addr1, addr2)
                      : ModbusParser.parseInt32LE(addr1, addr2);
                    break;
                  case 'float32':
                    rawValue = byteOrder === 'BE'
                      ? ModbusParser.parseFloat32BE(addr1, addr2)
                      : ModbusParser.parseFloat32LE(addr1, addr2);
                    break;
                }
              }
            } else {
              // 16位数据类型
              const singleValue = rawData.register_data[address] || rawData.register_data[address.toString()];
              if (singleValue !== undefined && singleValue !== null) {
                switch (dataType) {
                  case 'int16':
                    rawValue = ModbusParser.parseInt16(singleValue);
                    break;
                  case 'uint16':
                  default:
                    rawValue = ModbusParser.parseUint16(singleValue);
                    break;
                }
              }
            }
            
            if (rawValue !== undefined && rawValue !== null) {
              const scale = registerConfig.scale || 1;
              const offset = registerConfig.offset || 0;
              const calculatedValue = (rawValue * scale) + offset;
              
              // 根据寄存器名称映射到标准数据库列名
              const dbColumnName = this.mapRegisterNameToDbColumn(registerName);
              parsedData[dbColumnName] = calculatedValue;
              
              logger.debug(`解析寄存器数据: ${registerName} -> ${dbColumnName} = (${rawValue} * ${scale}) + ${offset} = ${calculatedValue}`, {
                address,
                registerName,
                dbColumnName,
                dataType,
                rawValue,
                scale,
                offset,
                result: calculatedValue
              });
            }
          }
        }
      }

      // 解析线圈数据
      if (rawData.coil_data) {
        Object.assign(parsedData, rawData.coil_data);
      }

      return parsedData;
    } catch (error) {
      logger.error('解析电表数据失败:', error);
      throw error;
    }
  }

  /**
   * 保存电表数据到数据库
   * @param {Object} device - 设备对象
   * @param {Object} electricMeter - 电表对象
   * @param {Object} parsedData - 解析后的数据
   */
  async saveElectricMeterData(device, electricMeter, parsedData) {
    try {
      const payload = {
        ...parsedData,
        electric_meter_id: electricMeter.id,
        meter_number: electricMeter.meter_number,
        meter_address: electricMeter.meter_address,
        data_type: 'electric_meter_mqtt'
      };
      
      // 清理payload中的无效Unicode字符，特别是raw_data中的Unicode转义序列
      const cleanedPayload = this.sanitizePayloadForStorage(payload);
      
      // 校验并处理timestamp
      let validTimestamp;
      if (parsedData.timestamp) {
        const timestampDate = new Date(parsedData.timestamp);
        if (isNaN(timestampDate.getTime())) {
          logger.warn(`无效的timestamp: ${parsedData.timestamp}，使用当前时间`);
          validTimestamp = new Date();
        } else {
          validTimestamp = timestampDate;
        }
      } else {
        validTimestamp = new Date();
      }

      // 保存到原有的device_data表（保持向后兼容）
      await DeviceData.create({
        device_id: device.id,
        timestamp: validTimestamp,
        data_type: 'electric_meter',
        payload: cleanedPayload,
        quality: 100, // 默认质量为100
        received_at: new Date()
      });

      // 同时保存到按租户分表的电表数据表
      await this.saveTenantElectricMeterData(device, electricMeter, parsedData, cleanedPayload);

      logger.debug(`电表数据已保存到数据库`, {
        deviceId: device.id,
        meterNumber: electricMeter.meter_number
      });
    } catch (error) {
      logger.error('保存电表数据失败:', error);
      throw error;
    }
  }

  /**
   * 保存电表数据到按租户分表的数据表
   * @param {Object} device - 设备对象
   * @param {Object} electricMeter - 电表对象
   * @param {Object} parsedData - 解析后的数据
   * @param {Object} cleanedPayload - 清理后的payload数据
   */
  async saveTenantElectricMeterData(device, electricMeter, parsedData, cleanedPayload) {
    try {
      // 获取电表所属的租户信息
      const tenant = await Tenant.findByPk(electricMeter.tenant_id);
      if (!tenant || !tenant.code) {
        logger.warn(`电表 ${electricMeter.meter_number} 未关联有效租户，跳过按租户分表存储`);
        return;
      }

      // 校验并处理timestamp
      let validTimestamp;
      if (parsedData.timestamp) {
        const timestampDate = new Date(parsedData.timestamp);
        if (isNaN(timestampDate.getTime())) {
          logger.warn(`无效的timestamp: ${parsedData.timestamp}，使用当前时间`);
          validTimestamp = new Date();
        } else {
          validTimestamp = timestampDate;
        }
      } else {
        validTimestamp = new Date();
      }

      // 构造电表数据对象
      const meterData = {
        electricMeterId: electricMeter.id,
        deviceId: device.id,
        meterNumber: electricMeter.meter_number,
        meterAddress: electricMeter.meter_address,
        data: this.extractElectricParameters(cleanedPayload),
        collectionTimestamp: validTimestamp
      };

      // 插入到租户专用的电表数据表
      const insertedId = await tenantElectricMeterDataService.insertMeterData(tenant.code, meterData);
      
      if (insertedId) {
        logger.debug(`电表数据已保存到租户 ${tenant.code} 的专用表`, {
          tenantCode: tenant.code,
          meterNumber: electricMeter.meter_number,
          insertedId
        });
      }
    } catch (error) {
      logger.error('保存电表数据到租户分表失败:', error);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 从payload中提取电气参数
   * @param {Object} payload - 清理后的payload数据
   * @returns {Object} 电气参数对象
   */
  extractElectricParameters(payload) {
    const parameters = {};
    
    // 中文寄存器名称到英文数据库列名的映射
    const registerToColumnMapping = {
      // 电能参数
      '总有功电能': 'total_active_energy',
      '正向有功电能': 'forward_active_energy',
      '反向有功电能': 'reverse_active_energy',
      '总电量': 'energy',
      '有功电量': 'active_energy',
      '无功电量': 'reactive_energy',
      
      // 电流参数
      'A相电流': 'phase_a_current',
      'B相电流': 'phase_b_current',
      'C相电流': 'phase_c_current',
      '平均电流': 'current_avg',
      
      // 电压参数
      'A相电压': 'phase_a_voltage',
      'B相电压': 'phase_b_voltage',
      'C相电压': 'phase_c_voltage',
      'AB线电压': 'line_ab_voltage',
      'BC线电压': 'line_bc_voltage',
      'CA线电压': 'line_ac_voltage',
      '平均电压': 'voltage_avg',
      
      // 功率参数
      'A相功率': 'phase_a_power',
      'B相功率': 'phase_b_power',
      'C相功率': 'phase_c_power',
      'ABC相总功率': 'total_power',
      '有功功率': 'active_power',
      '无功功率': 'reactive_power',
      '视在功率': 'apparent_power',
      
      // 功率因数
      'A相功率因数': 'phase_a_power_factor',
      'B相功率因数': 'phase_b_power_factor',
      'C相功率因数': 'phase_c_power_factor',
      'ABC相总功率因数': 'total_power_factor',
      '功率因数': 'power_factor',
      
      // 温度
      'A相温度': 'phase_a_temperature',
      'B相温度': 'phase_b_temperature',
      'C相温度': 'phase_c_temperature',
      '温度': 'temperature',
      
      // 频率
      '频率': 'frequency'
    };
    
    // 英文参数名映射（兼容性）
    const englishMapping = {
      'total_active_energy': 'total_active_energy',
      'totalActiveEnergy': 'total_active_energy',
      'forward_active_energy': 'forward_active_energy',
      'forwardActiveEnergy': 'forward_active_energy',
      'reverse_active_energy': 'reverse_active_energy',
      'reverseActiveEnergy': 'reverse_active_energy',
      'energy': 'energy',
      'total_energy': 'energy',
      'kwh': 'energy',
      'active_energy': 'active_energy',
      'active_kwh': 'active_energy',
      'reactive_energy': 'reactive_energy',
      'reactive_kwh': 'reactive_energy',
      'phase_a_current': 'phase_a_current',
      'phaseACurrent': 'phase_a_current',
      'current_a': 'phase_a_current',
      'ia': 'phase_a_current',
      'phase_b_current': 'phase_b_current',
      'phaseBCurrent': 'phase_b_current',
      'current_b': 'phase_b_current',
      'ib': 'phase_b_current',
      'phase_c_current': 'phase_c_current',
      'phaseCCurrent': 'phase_c_current',
      'current_c': 'phase_c_current',
      'ic': 'phase_c_current',
      'current_avg': 'current_avg',
      'current_average': 'current_avg',
      'phase_a_voltage': 'phase_a_voltage',
      'phaseAVoltage': 'phase_a_voltage',
      'voltage_a': 'phase_a_voltage',
      'ua': 'phase_a_voltage',
      'phase_b_voltage': 'phase_b_voltage',
      'phaseBVoltage': 'phase_b_voltage',
      'voltage_b': 'phase_b_voltage',
      'ub': 'phase_b_voltage',
      'phase_c_voltage': 'phase_c_voltage',
      'phaseCVoltage': 'phase_c_voltage',
      'voltage_c': 'phase_c_voltage',
      'uc': 'phase_c_voltage',
      'line_ab_voltage': 'line_ab_voltage',
      'lineABVoltage': 'line_ab_voltage',
      'line_ac_voltage': 'line_ac_voltage',
      'lineACVoltage': 'line_ac_voltage',
      'line_bc_voltage': 'line_bc_voltage',
      'lineBCVoltage': 'line_bc_voltage',
      'voltage_avg': 'voltage_avg',
      'voltage_average': 'voltage_avg',
      'phase_a_power': 'phase_a_power',
      'phaseAPower': 'phase_a_power',
      'phase_b_power': 'phase_b_power',
      'phaseBPower': 'phase_b_power',
      'phase_c_power': 'phase_c_power',
      'phaseCPower': 'phase_c_power',
      'total_power': 'total_power',
      'totalPower': 'total_power',
      'active_power': 'active_power',
      'power': 'active_power',
      'kw': 'active_power',
      'reactive_power': 'reactive_power',
      'kvar': 'reactive_power',
      'apparent_power': 'apparent_power',
      'kva': 'apparent_power',
      'phase_a_power_factor': 'phase_a_power_factor',
      'phaseAPowerFactor': 'phase_a_power_factor',
      'phase_b_power_factor': 'phase_b_power_factor',
      'phaseBPowerFactor': 'phase_b_power_factor',
      'phase_c_power_factor': 'phase_c_power_factor',
      'phaseCPowerFactor': 'phase_c_power_factor',
      'total_power_factor': 'total_power_factor',
      'totalPowerFactor': 'total_power_factor',
      'power_factor': 'power_factor',
      'pf': 'power_factor',
      'cos_phi': 'power_factor',
      'phase_a_temperature': 'phase_a_temperature',
      'phaseATemperature': 'phase_a_temperature',
      'phase_b_temperature': 'phase_b_temperature',
      'phaseBTemperature': 'phase_b_temperature',
      'phase_c_temperature': 'phase_c_temperature',
      'phaseCTemperature': 'phase_c_temperature',
      'temperature': 'temperature',
      'temp': 'temperature',
      'frequency': 'frequency',
      'freq': 'frequency',
      'hz': 'frequency'
    };
    
    // 合并所有映射
    const allMappings = {
      ...registerToColumnMapping,
      ...englishMapping
    };
    
    // 遍历payload查找匹配的参数
    for (const [payloadKey, value] of Object.entries(payload)) {
      if (value !== null && value !== undefined) {
        // 直接映射
        if (allMappings[payloadKey]) {
          const dbColumn = allMappings[payloadKey];
          parameters[dbColumn] = value;
          logger.debug(`参数映射: ${payloadKey} -> ${dbColumn} = ${value}`);
        }
        // 如果没有找到映射，但是是已知的数据库列名，直接使用
        else if (this.isValidDatabaseColumn(payloadKey)) {
          parameters[payloadKey] = value;
          logger.debug(`直接使用数据库列名: ${payloadKey} = ${value}`);
        }
      }
    }
    
    return parameters;
  }

  /**
   * 清理payload数据中的无效Unicode字符
   * @param {Object} payload - 要清理的数据
   * @returns {Object} 清理后的数据
   */
  sanitizePayloadForStorage(payload) {
    try {
      // 深拷贝payload以避免修改原始数据
      const cleanedPayload = JSON.parse(JSON.stringify(payload));
      
      // 如果存在raw_data，需要特别处理
      if (cleanedPayload.raw_data && typeof cleanedPayload.raw_data === 'object') {
        // 处理raw_response中的Unicode转义序列
        if (cleanedPayload.raw_data.raw_response && typeof cleanedPayload.raw_data.raw_response === 'string') {
          cleanedPayload.raw_data.raw_response = this.convertToHexString(cleanedPayload.raw_data.raw_response);
        }
        
        // 处理其他可能包含Unicode转义序列的字段
        Object.keys(cleanedPayload.raw_data).forEach(key => {
          if (typeof cleanedPayload.raw_data[key] === 'string') {
            cleanedPayload.raw_data[key] = this.convertToHexString(cleanedPayload.raw_data[key]);
          }
        });
      }
      
      return cleanedPayload;
    } catch (error) {
      logger.warn('清理payload数据失败，使用原始数据', { error: error.message });
      return payload;
    }
  }

  /**
   * 将包含Unicode转义序列的字符串转换为十六进制表示
   * @param {string} str - 输入字符串
   * @returns {string} 十六进制字符串
   */
  convertToHexString(str) {
    try {
      // 如果字符串包含Unicode转义序列或控制字符，转换为十六进制
       if (str.includes('\\u') || /[\x00-\x1F\x7F-\x9F]/.test(str)) {
        // 直接将字符串转换为Buffer再转为十六进制
        return Buffer.from(str, 'binary').toString('hex').toUpperCase();
      }
      
      // 如果已经是纯十六进制字符串，直接返回
      if (/^[0-9A-Fa-f]+$/.test(str)) {
        return str.toUpperCase();
      }
      
      // 其他情况，转换为十六进制
      return Buffer.from(str, 'utf8').toString('hex').toUpperCase();
    } catch (error) {
      logger.warn('转换字符串为十六进制失败', { str: str.substring(0, 50), error: error.message });
      // 如果转换失败，尝试简单的字符码转换
      try {
        let hexStr = '';
        for (let i = 0; i < str.length; i++) {
          const charCode = str.charCodeAt(i);
          hexStr += charCode.toString(16).padStart(2, '0').toUpperCase();
        }
        return hexStr;
      } catch (fallbackError) {
        logger.error('字符串转十六进制完全失败', { str: str.substring(0, 20), error: fallbackError.message });
        return 'INVALID_DATA';
      }
    }
  }

  /**
   * 广播电表数据到WebSocket客户端
   * @param {Object} device - 设备对象
   * @param {Object} electricMeter - 电表对象
   * @param {Object} parsedData - 解析后的数据
   */
  async broadcastElectricMeterData(device, electricMeter, parsedData) {
    try {
      const broadcastData = {
        type: 'electric_meter_data',
        device_id: device.id,
        device_name: device.name,
        electric_meter_id: electricMeter.id,
        meter_number: electricMeter.meter_number,
        meter_address: electricMeter.meter_address,
        timestamp: parsedData.timestamp,
        data: parsedData
      };

      // 通过WebSocket服务广播
      const websocketService = require('./websocketService');
      websocketService.broadcastToClients('electric_meter_data', broadcastData);

      logger.debug(`电表数据已广播`, {
        deviceId: device.id,
        meterNumber: electricMeter.meter_number
      });
    } catch (error) {
      logger.error('广播电表数据失败:', error);
    }
  }

  /**
   * 停止所有轮询
   */
  stopAllPolling() {
    for (const [deviceKey, intervalId] of this.pollingIntervals) {
      clearInterval(intervalId);
      logger.info(`设备 ${deviceKey} 电表轮询已停止`);
    }
    
    this.pollingIntervals.clear();
    this.deviceElectricMeters.clear();
    
    // 销毁数据聚合器
    if (this.dataAggregator) {
      this.dataAggregator.destroy();
    }
    
    logger.info('所有电表轮询已停止');
  }

  /**
   * 将寄存器名称映射到标准数据库列名
   * @param {string} registerName - 寄存器名称
   * @returns {string} 数据库列名
   */
  mapRegisterNameToDbColumn(registerName) {
    // 中文寄存器名称到英文数据库列名的映射
    const registerToColumnMapping = {
      // 电能参数
      '总有功电能': 'total_active_energy',
      '正向有功电能': 'forward_active_energy',
      '反向有功电能': 'reverse_active_energy',
      '总电量': 'total_active_energy',
      '有功电量': 'forward_active_energy',
      '无功电量': 'reactive_energy',
      
      // 电流参数
      'A相电流': 'phase_a_current',
      'B相电流': 'phase_b_current',
      'C相电流': 'phase_c_current',
      '平均电流': 'current_avg',
      
      // 电压参数
      'A相电压': 'phase_a_voltage',
      'B相电压': 'phase_b_voltage',
      'C相电压': 'phase_c_voltage',
      'AB相电压': 'line_ab_voltage',
      'AC相电压': 'line_ac_voltage',
      'BC相电压': 'line_bc_voltage',
      'AB线电压': 'line_ab_voltage',
      'BC线电压': 'line_bc_voltage',
      'CA线电压': 'line_ac_voltage',
      'AC线电压': 'line_ac_voltage',
      '平均电压': 'voltage_avg',
      
      // 功率参数
      'A相功率': 'phase_a_power',
      'B相功率': 'phase_b_power',
      'C相功率': 'phase_c_power',
      'ABC相总功率': 'total_power',
      '有功功率': 'active_power',
      '无功功率': 'reactive_power',
      '视在功率': 'apparent_power',
      
      // 功率因数
      'A相功率因数': 'phase_a_power_factor',
      'B相功率因数': 'phase_b_power_factor',
      'C相功率因数': 'phase_c_power_factor',
      'ABC相总功率因数': 'total_power_factor',
      '功率因数': 'power_factor',
      
      // 温度
      'A相温度': 'phase_a_temperature',
      'B相温度': 'phase_b_temperature',
      'C相温度': 'phase_c_temperature',
      '温度': 'temperature',
      
      // 频率
      '频率': 'frequency'
    };
    
    // 英文参数名映射（兼容性）
    const englishMapping = {
      'total_active_energy': 'total_active_energy',
      'totalActiveEnergy': 'total_active_energy',
      'forward_active_energy': 'forward_active_energy',
      'forwardActiveEnergy': 'forward_active_energy',
      'reverse_active_energy': 'reverse_active_energy',
      'reverseActiveEnergy': 'reverse_active_energy',
      'energy': 'total_active_energy',
      'total_energy': 'total_active_energy',
      'kwh': 'total_active_energy',
      'active_energy': 'forward_active_energy',
      'active_kwh': 'forward_active_energy',
      'reactive_energy': 'reactive_energy',
      'reactive_kwh': 'reactive_energy',
      'phase_a_current': 'phase_a_current',
      'phaseACurrent': 'phase_a_current',
      'current_a': 'phase_a_current',
      'ia': 'phase_a_current',
      'phase_b_current': 'phase_b_current',
      'phaseBCurrent': 'phase_b_current',
      'current_b': 'phase_b_current',
      'ib': 'phase_b_current',
      'phase_c_current': 'phase_c_current',
      'phaseCCurrent': 'phase_c_current',
      'current_c': 'phase_c_current',
      'ic': 'phase_c_current',
      'current_avg': 'current_avg',
      'current_average': 'current_avg',
      'phase_a_voltage': 'phase_a_voltage',
      'phaseAVoltage': 'phase_a_voltage',
      'voltage_a': 'phase_a_voltage',
      'ua': 'phase_a_voltage',
      'phase_b_voltage': 'phase_b_voltage',
      'phaseBVoltage': 'phase_b_voltage',
      'voltage_b': 'phase_b_voltage',
      'ub': 'phase_b_voltage',
      'phase_c_voltage': 'phase_c_voltage',
      'phaseCVoltage': 'phase_c_voltage',
      'voltage_c': 'phase_c_voltage',
      'uc': 'phase_c_voltage',
      'line_ab_voltage': 'line_ab_voltage',
      'lineABVoltage': 'line_ab_voltage',
      'line_ac_voltage': 'line_ac_voltage',
      'lineACVoltage': 'line_ac_voltage',
      'line_bc_voltage': 'line_bc_voltage',
      'lineBCVoltage': 'line_bc_voltage',
      'voltage_avg': 'voltage_avg',
      'voltage_average': 'voltage_avg',
      'phase_a_power': 'phase_a_power',
      'phaseAPower': 'phase_a_power',
      'phase_b_power': 'phase_b_power',
      'phaseBPower': 'phase_b_power',
      'phase_c_power': 'phase_c_power',
      'phaseCPower': 'phase_c_power',
      'total_power': 'total_power',
      'totalPower': 'total_power',
      'active_power': 'active_power',
      'power': 'active_power',
      'kw': 'active_power',
      'reactive_power': 'reactive_power',
      'kvar': 'reactive_power',
      'apparent_power': 'apparent_power',
      'kva': 'apparent_power',
      'phase_a_power_factor': 'phase_a_power_factor',
      'phaseAPowerFactor': 'phase_a_power_factor',
      'phase_b_power_factor': 'phase_b_power_factor',
      'phaseBPowerFactor': 'phase_b_power_factor',
      'phase_c_power_factor': 'phase_c_power_factor',
      'phaseCPowerFactor': 'phase_c_power_factor',
      'total_power_factor': 'total_power_factor',
      'totalPowerFactor': 'total_power_factor',
      'power_factor': 'power_factor',
      'pf': 'power_factor',
      'cos_phi': 'power_factor',
      'phase_a_temperature': 'phase_a_temperature',
      'phaseATemperature': 'phase_a_temperature',
      'phase_b_temperature': 'phase_b_temperature',
      'phaseBTemperature': 'phase_b_temperature',
      'phase_c_temperature': 'phase_c_temperature',
      'phaseCTemperature': 'phase_c_temperature',
      'temperature': 'temperature',
      'temp': 'temperature',
      'frequency': 'frequency',
      'freq': 'frequency',
      'hz': 'frequency'
    };
    
    // 合并所有映射
    const allMappings = {
      ...registerToColumnMapping,
      ...englishMapping
    };
    
    // 查找映射
    const mappedColumn = allMappings[registerName];
    if (mappedColumn) {
      return mappedColumn;
    }
    
    // 如果没有找到映射，但是是已知的数据库列名，直接使用
    if (this.isValidDatabaseColumn(registerName)) {
      return registerName;
    }
    
    // 如果都没有找到，返回原始名称（可能需要进一步处理）
    logger.warn(`未找到寄存器名称 '${registerName}' 的映射，使用原始名称`);
    return registerName;
  }

  /**
   * 检查是否为有效的数据库列名
   * @param {string} columnName - 列名
   * @returns {boolean} 是否为有效列名
   */
  isValidDatabaseColumn(columnName) {
    const validColumns = [
      'energy', 'active_energy', 'reactive_energy',
      'total_active_energy', 'forward_active_energy', 'reverse_active_energy',
      'phase_a_current', 'phase_b_current', 'phase_c_current', 'current_avg',
      'phase_a_voltage', 'phase_b_voltage', 'phase_c_voltage', 'voltage_avg',
      'line_ab_voltage', 'line_ac_voltage', 'line_bc_voltage',
      'phase_a_power', 'phase_b_power', 'phase_c_power', 'total_power',
      'active_power', 'reactive_power', 'apparent_power',
      'phase_a_power_factor', 'phase_b_power_factor', 'phase_c_power_factor',
      'total_power_factor', 'power_factor',
      'phase_a_temperature', 'phase_b_temperature', 'phase_c_temperature', 'temperature',
      'frequency'
    ];
    
    return validColumns.includes(columnName);
  }

  /**
   * 重新加载设备配置
   * @param {string} deviceId - 设备ID
   */
  async reloadDeviceConfig(deviceId) {
    try {
      const device = await Device.findByPk(deviceId, {
        include: [{
          model: ElectricMeter,
          as: 'electric_meters',
          where: { status: 'active' },
          include: [{
            model: ProtocolConfig,
            as: 'protocol_config'
          }]
        }]
      });

      if (device && device.electric_meters && device.electric_meters.length > 0) {
        await this.startDevicePolling(device);
        logger.info(`设备 ${deviceId} 配置已重新加载`);
      } else {
        this.stopDevicePolling(`${deviceId}`);
        logger.info(`设备 ${deviceId} 无电表配置，已停止轮询`);
      }
    } catch (error) {
      logger.error(`重新加载设备 ${deviceId} 配置失败:`, error);
    }
  }

  /**
   * 启用或禁用数据聚合功能
   * @param {boolean} enabled - 是否启用
   */
  setDataAggregationEnabled(enabled) {
    this.enableDataAggregation = enabled;
    logger.info(`数据聚合功能已${enabled ? '启用' : '禁用'}`);
    
    if (!enabled && this.dataAggregator) {
      // 如果禁用聚合功能，强制完成所有活动会话
      const stats = this.dataAggregator.getSessionStats();
      if (stats.totalSessions > 0) {
        logger.info(`禁用数据聚合功能，强制完成 ${stats.totalSessions} 个活动会话`);
        this.dataAggregator.destroy();
        this.dataAggregator = new ElectricMeterDataAggregator();
      }
    }
  }

  /**
   * 获取数据聚合会话统计信息
   * @returns {Object} 会话统计信息
   */
  getDataAggregationStats() {
    if (!this.dataAggregator) {
      return { enabled: false, totalSessions: 0 };
    }
    
    return {
      enabled: this.enableDataAggregation,
      ...this.dataAggregator.getSessionStats()
    };
  }
}

module.exports = ElectricMeterMqttService;