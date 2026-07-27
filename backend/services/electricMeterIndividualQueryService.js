/**
 * 电表逐条查询服务
 * 替代批量查询方案，按照电表协议逐条下发查询、逐条解析
 * 解决批量查询中的数据解析错误问题
 */

const ModbusRtuUtils = require('../utils/modbusRtuUtils');
const logger = require('../utils/logger');
const electricMeterPollingConfig = require('../config/electricMeterPolling');

class ElectricMeterIndividualQueryService {
  constructor(mqttService) {
    this.mqttService = mqttService;
  }

  /**
   * 生成逐条查询命令
   * @param {Array} registers - 寄存器配置数组
   * @param {Object} protocolConfig - 协议配置
   * @returns {Array} 逐条查询配置
   */
  generateIndividualQueries(registers, protocolConfig) {
    logger.info('开始生成逐条查询命令', {
      registerCount: registers.length,
      protocolName: protocolConfig.name
    });

    // 按功能码分组
    const groupedByFunction = {};
    registers.forEach(register => {
      const funcCode = register.function_code;
      if (!groupedByFunction[funcCode]) {
        groupedByFunction[funcCode] = [];
      }
      groupedByFunction[funcCode].push(register);
    });

    const individualQueries = [];

    // 对每个功能码组生成逐条查询
    Object.keys(groupedByFunction).forEach(funcCode => {
      const funcRegisters = groupedByFunction[funcCode];
      
      // 按地址排序
      funcRegisters.sort((a, b) => a.address - b.address);
      
      // 为每个寄存器生成单独的查询
      funcRegisters.forEach(register => {
        const query = this.createSingleRegisterQuery(register, parseInt(funcCode));
        individualQueries.push(query);
      });
    });

    logger.info('逐条查询命令生成完成', {
      原始寄存器数量: registers.length,
      生成查询数量: individualQueries.length,
      查询类型: '逐条查询'
    });

    return individualQueries;
  }

  /**
   * 创建单个寄存器查询
   * @param {Object} register - 寄存器配置
   * @param {number} functionCode - 功能码
   * @returns {Object} 查询配置
   */
  createSingleRegisterQuery(register, functionCode) {
    // 根据数据类型确定需要读取的寄存器数量
    const registerWords = this.getRegisterWords(register.data_type);
    
    return {
      function_code: functionCode,
      start_address: register.address,
      quantity: registerWords,
      data_type: register.data_type || 'uint16',
      register_names: [register.name || register.description || `register_${register.address}`],
      register_mapping: [{
        name: register.name,
        address: register.address,
        data_type: register.data_type,
        unit: register.unit,
        description: register.description,
        offset: 0 // 单个查询时偏移量始终为0
      }],
      isSingleQuery: true, // 标记为单个查询
      description: `单独读取${register.name || register.description || `地址${register.address}`}`
    };
  }

  /**
   * 根据数据类型获取寄存器字数
   * @param {string} dataType - 数据类型
   * @returns {number} 寄存器字数
   */
  getRegisterWords(dataType) {
    switch (dataType) {
      case 'uint32':
      case 'int32':
      case 'float32':
        return 2; // 32位数据类型需要2个寄存器
      case 'uint16':
      case 'int16':
      default:
        return 1; // 16位数据类型需要1个寄存器
    }
  }

  /**
   * 构建逐条查询的RTU命令
   * @param {Object} device - 设备对象
   * @param {Object} electricMeter - 电表对象
   * @param {Array} queries - 查询配置数组
   * @returns {Object} RTU命令对象
   */
  buildIndividualRtuCommands(device, electricMeter, queries) {
    const rtuCommands = [];
    const meterAddress = parseInt(electricMeter.meter_address) || 1;

    queries.forEach((query, index) => {
      try {
        let rtuBuffer;
        
        if (query.function_code === 3) {
          // 读取保持寄存器
          rtuBuffer = ModbusRtuUtils.buildReadHoldingRegistersRTU(
            meterAddress,
            query.start_address,
            query.quantity
          );
        } else if (query.function_code === 4) {
          // 读取输入寄存器
          rtuBuffer = ModbusRtuUtils.buildReadInputRegistersRTU(
            meterAddress,
            query.start_address,
            query.quantity
          );
        } else {
          logger.warn('不支持的功能码', {
            functionCode: query.function_code,
            registerName: query.register_names[0]
          });
          return;
        }

        const hexCommand = ModbusRtuUtils.bufferToHexString(rtuBuffer);
        
        rtuCommands.push({
          hex_command: hexCommand,
          function_code: query.function_code,
          start_address: query.start_address,
          count: query.quantity,
          description: query.description,
          register_name: query.register_names[0],
          register_mapping: query.register_mapping,
          register_names: query.register_names,
          isSingleQuery: true
        });

        logger.debug('生成逐条RTU命令', {
          序号: index + 1,
          寄存器名称: query.register_names[0],
          功能码: query.function_code,
          起始地址: query.start_address,
          数量: query.quantity,
          命令: hexCommand
        });

      } catch (error) {
        logger.error('生成RTU命令失败', {
          error: error.message,
          query: query
        });
      }
    });

    return {
      format: 'rtu',
      rtu_commands: rtuCommands,
      total_commands: rtuCommands.length,
      query_type: 'individual' // 标记为逐条查询
    };
  }

  /**
   * 解析逐条查询响应
   * @param {Object} parsedResponse - 解析后的RTU响应
   * @param {Object} commandInfo - 命令信息
   * @param {Object} protocolConfig - 协议配置
   * @returns {Object} 解析结果
   */
  parseIndividualQueryResponse(parsedResponse, commandInfo, protocolConfig) {
    const result = {
      success: false,
      registerData: {},
      errors: []
    };

    try {
      if (!parsedResponse.success || !parsedResponse.data || !parsedResponse.data.registers) {
        result.errors.push('RTU响应数据无效');
        return result;
      }

      const registers = parsedResponse.data.registers;
      const mapping = commandInfo.registerMapping[0]; // 单个查询只有一个映射

      if (!mapping) {
        result.errors.push('缺少寄存器映射信息');
        return result;
      }

      // 根据数据类型解析值
      let value = this.parseRegisterValue(registers, mapping.data_type);
      
      // 应用缩放和偏移（如果协议配置中有定义）
      if (protocolConfig && protocolConfig.modbus_registers) {
        const protocolRegister = protocolConfig.modbus_registers.find(
          reg => reg.address === mapping.address
        );
        
        if (protocolRegister) {
          if (protocolRegister.scale && protocolRegister.scale !== 1) {
            value = value * protocolRegister.scale;
          }
          if (protocolRegister.offset && protocolRegister.offset !== 0) {
            value = value + protocolRegister.offset;
          }
        }
      }

      result.registerData[mapping.address] = value;
      result.success = true;

      logger.debug('逐条查询响应解析成功', {
        registerName: mapping.name,
        address: mapping.address,
        dataType: mapping.data_type,
        rawValue: registers[0],
        parsedValue: value
      });

    } catch (error) {
      result.errors.push(`解析错误: ${error.message}`);
      logger.error('逐条查询响应解析失败', {
        error: error.message,
        commandInfo: commandInfo
      });
    }

    return result;
  }

  /**
   * 解析寄存器值
   * @param {Array} registers - 寄存器数组
   * @param {string} dataType - 数据类型
   * @returns {number} 解析后的值
   */
  parseRegisterValue(registers, dataType) {
    if (!registers || registers.length === 0) {
      throw new Error('寄存器数据为空');
    }

    switch (dataType) {
      case 'uint16':
        return registers[0];
        
      case 'int16':
        return registers[0] > 32767 ? registers[0] - 65536 : registers[0];
        
      case 'uint32':
        if (registers.length < 2) {
          throw new Error('uint32类型需要2个寄存器');
        }
        return (registers[0] << 16) | registers[1];
        
      case 'int32':
        if (registers.length < 2) {
          throw new Error('int32类型需要2个寄存器');
        }
        const uint32Value = (registers[0] << 16) | registers[1];
        return uint32Value > 0x7FFFFFFF ? uint32Value - 0x100000000 : uint32Value;
        
      case 'float32':
        if (registers.length < 2) {
          throw new Error('float32类型需要2个寄存器');
        }
        const buffer = Buffer.alloc(4);
        buffer.writeUInt16BE(registers[0], 0);
        buffer.writeUInt16BE(registers[1], 2);
        return buffer.readFloatBE(0);
        
      default:
        logger.warn('未知数据类型，使用uint16解析', { dataType });
        return registers[0];
    }
  }

  /**
   * 获取查询间隔时间
   * @param {number} totalQueries - 总查询数
   * @returns {number} 间隔时间（毫秒）
   */
  getQueryInterval(totalQueries) {
    // 直接使用配置文件中的间隔时间，确保一致性
    return electricMeterPollingConfig.commandIntervals.betweenCommands;
  }

  /**
   * 验证查询配置
   * @param {Array} queries - 查询配置数组
   * @returns {Object} 验证结果
   */
  validateQueries(queries) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    if (!Array.isArray(queries) || queries.length === 0) {
      result.valid = false;
      result.errors.push('查询配置为空或格式错误');
      return result;
    }

    queries.forEach((query, index) => {
      if (!query.function_code || ![3, 4].includes(query.function_code)) {
        result.errors.push(`查询${index + 1}: 功能码无效`);
      }
      
      if (typeof query.start_address !== 'number' || query.start_address < 0) {
        result.errors.push(`查询${index + 1}: 起始地址无效`);
      }
      
      if (typeof query.quantity !== 'number' || query.quantity < 1 || query.quantity > 2) {
        result.errors.push(`查询${index + 1}: 数量无效（应为1或2）`);
      }
    });

    if (result.errors.length > 0) {
      result.valid = false;
    }

    if (queries.length > 50) {
      result.warnings.push('查询数量较多，可能影响性能');
    }

    return result;
  }
}

module.exports = ElectricMeterIndividualQueryService;