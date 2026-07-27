/**
 * Modbus 设备模拟器
 * 用于测试和开发时模拟真实的 Modbus 设备
 */

const net = require('net');
const logger = require('../utils/logger');

class ModbusSimulator {
  constructor(options = {}) {
    this.port = options.port || 502;
    this.host = options.host || '0.0.0.0';
    this.unitId = options.unitId || 1;
    this.server = null;
    this.clients = new Set();
    
    // 模拟数据存储
    this.coils = new Array(10000).fill(false);           // 线圈 (00001-09999)
    this.discreteInputs = new Array(10000).fill(false);  // 离散输入 (10001-19999)
    this.inputRegisters = new Array(10000).fill(0);      // 输入寄存器 (30001-39999)
    this.holdingRegisters = new Array(10000).fill(0);    // 保持寄存器 (40001-49999)
    
    // 初始化一些测试数据
    this.initializeTestData();
    
    // 数据更新定时器
    this.updateInterval = null;
  }

  /**
   * 初始化测试数据
   */
  initializeTestData() {
    // 智能电表数据模拟
    this.holdingRegisters[0] = 2200;   // 电压 A 相 (220.0V)
    this.holdingRegisters[1] = 1000;   // 电流 A 相 (10.00A)
    this.holdingRegisters[2] = 2200;   // 电压 B 相
    this.holdingRegisters[3] = 1050;   // 电流 B 相
    this.holdingRegisters[4] = 2180;   // 电压 C 相
    this.holdingRegisters[5] = 980;    // 电流 C 相
    
    // 功率数据 (32位)
    this.holdingRegisters[10] = 0;     // 总功率高位
    this.holdingRegisters[11] = 2200;  // 总功率低位 (2.2kW)
    
    // 电能数据 (32位)
    this.holdingRegisters[20] = 0;     // 总电能高位
    this.holdingRegisters[21] = 12345; // 总电能低位
    
    // 频率
    this.holdingRegisters[30] = 5000;  // 频率 (50.00Hz)
    
    // 功率因数
    this.holdingRegisters[31] = 950;   // 功率因数 (0.95)
    
    // 环境监测数据模拟
    this.inputRegisters[0] = 250;      // 温度 (25.0°C)
    this.inputRegisters[1] = 650;      // 湿度 (65.0%RH)
    this.inputRegisters[2] = 1013;     // 大气压力 (1013hPa)
    this.inputRegisters[3] = 0;        // 风速高位
    this.inputRegisters[4] = 120;      // 风速低位 (1.2m/s)
    this.inputRegisters[5] = 25;       // PM2.5 (25μg/m³)
    this.inputRegisters[6] = 35;       // PM10 (35μg/m³)
    this.inputRegisters[7] = 400;      // CO2 (400ppm)
    
    // 状态位
    this.coils[0] = true;              // 设备运行状态
    this.coils[1] = false;             // 告警状态
    this.coils[2] = true;              // 通信状态
    
    this.discreteInputs[0] = true;     // 电源状态
    this.discreteInputs[1] = false;    // 故障状态
    this.discreteInputs[2] = true;     // 校准状态
    
    logger.info('测试数据初始化完成');
  }

  /**
   * 启动模拟器
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleClientConnection(socket);
      });

      this.server.on('error', (error) => {
        logger.error('Modbus 模拟器错误:', error);
        reject(error);
      });

      this.server.listen(this.port, this.host, () => {
        logger.info(`Modbus 模拟器启动成功: ${this.host}:${this.port}`);
        this.startDataUpdate();
        resolve();
      });
    });
  }

  /**
   * 停止模拟器
   */
  stop() {
    return new Promise((resolve) => {
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }

      if (this.server) {
        // 关闭所有客户端连接
        this.clients.forEach(client => {
          client.destroy();
        });
        this.clients.clear();

        this.server.close(() => {
          logger.info('Modbus 模拟器已停止');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 处理客户端连接
   */
  handleClientConnection(socket) {
    const clientInfo = `${socket.remoteAddress}:${socket.remotePort}`;
    logger.info(`客户端连接: ${clientInfo}`);
    
    this.clients.add(socket);

    socket.on('data', (data) => {
      try {
        const response = this.processModbusRequest(data);
        if (response) {
          socket.write(response);
        }
      } catch (error) {
        logger.error(`处理 Modbus 请求失败 (${clientInfo}):`, error);
        // 发送异常响应
        const errorResponse = this.createErrorResponse(data, 0x01); // 非法功能码
        socket.write(errorResponse);
      }
    });

    socket.on('close', () => {
      logger.info(`客户端断开: ${clientInfo}`);
      this.clients.delete(socket);
    });

    socket.on('error', (error) => {
      logger.error(`客户端错误 (${clientInfo}):`, error);
      this.clients.delete(socket);
    });
  }

  /**
   * 处理 Modbus 请求
   */
  processModbusRequest(data) {
    if (data.length < 8) {
      throw new Error('请求数据长度不足');
    }

    // 解析 Modbus TCP 头部
    const transactionId = data.readUInt16BE(0);
    const protocolId = data.readUInt16BE(2);
    const length = data.readUInt16BE(4);
    const unitId = data.readUInt8(6);
    const functionCode = data.readUInt8(7);

    // 验证协议ID和单元ID
    if (protocolId !== 0) {
      throw new Error('无效的协议ID');
    }

    if (unitId !== this.unitId) {
      // 忽略不匹配的单元ID
      return null;
    }

    logger.debug(`收到请求: 事务ID=${transactionId}, 功能码=${functionCode}, 单元ID=${unitId}`);

    let response;
    switch (functionCode) {
      case 0x01: // 读取线圈
        response = this.handleReadCoils(data.slice(8));
        break;
      case 0x02: // 读取离散输入
        response = this.handleReadDiscreteInputs(data.slice(8));
        break;
      case 0x03: // 读取保持寄存器
        response = this.handleReadHoldingRegisters(data.slice(8));
        break;
      case 0x04: // 读取输入寄存器
        response = this.handleReadInputRegisters(data.slice(8));
        break;
      case 0x05: // 写入单个线圈
        response = this.handleWriteSingleCoil(data.slice(8));
        break;
      case 0x06: // 写入单个寄存器
        response = this.handleWriteSingleRegister(data.slice(8));
        break;
      case 0x10: // 写入多个寄存器
        response = this.handleWriteMultipleRegisters(data.slice(8));
        break;
      default:
        return this.createErrorResponse(data, 0x01); // 非法功能码
    }

    // 构建完整响应
    if (response) {
      const fullResponse = Buffer.alloc(6 + response.length);
      fullResponse.writeUInt16BE(transactionId, 0);
      fullResponse.writeUInt16BE(0, 2); // 协议ID
      fullResponse.writeUInt16BE(response.length, 4); // 长度
      response.copy(fullResponse, 6);
      return fullResponse;
    }

    return null;
  }

  /**
   * 读取线圈
   */
  handleReadCoils(data) {
    const address = data.readUInt16BE(0);
    const quantity = data.readUInt16BE(2);

    if (quantity < 1 || quantity > 2000) {
      throw new Error('无效的数量');
    }

    const byteCount = Math.ceil(quantity / 8);
    const response = Buffer.alloc(2 + byteCount);
    response.writeUInt8(this.unitId, 0);
    response.writeUInt8(0x01, 1); // 功能码
    response.writeUInt8(byteCount, 2);

    for (let i = 0; i < quantity; i++) {
      const coilIndex = address + i;
      if (coilIndex < this.coils.length && this.coils[coilIndex]) {
        const byteIndex = Math.floor(i / 8);
        const bitIndex = i % 8;
        response[3 + byteIndex] |= (1 << bitIndex);
      }
    }

    return response;
  }

  /**
   * 读取离散输入
   */
  handleReadDiscreteInputs(data) {
    const address = data.readUInt16BE(0);
    const quantity = data.readUInt16BE(2);

    if (quantity < 1 || quantity > 2000) {
      throw new Error('无效的数量');
    }

    const byteCount = Math.ceil(quantity / 8);
    const response = Buffer.alloc(2 + byteCount);
    response.writeUInt8(this.unitId, 0);
    response.writeUInt8(0x02, 1); // 功能码
    response.writeUInt8(byteCount, 2);

    for (let i = 0; i < quantity; i++) {
      const inputIndex = address + i;
      if (inputIndex < this.discreteInputs.length && this.discreteInputs[inputIndex]) {
        const byteIndex = Math.floor(i / 8);
        const bitIndex = i % 8;
        response[3 + byteIndex] |= (1 << bitIndex);
      }
    }

    return response;
  }

  /**
   * 读取保持寄存器
   */
  handleReadHoldingRegisters(data) {
    const address = data.readUInt16BE(0);
    const quantity = data.readUInt16BE(2);

    if (quantity < 1 || quantity > 125) {
      throw new Error('无效的数量');
    }

    const byteCount = quantity * 2;
    const response = Buffer.alloc(3 + byteCount);
    response.writeUInt8(this.unitId, 0);
    response.writeUInt8(0x03, 1); // 功能码
    response.writeUInt8(byteCount, 2);

    for (let i = 0; i < quantity; i++) {
      const regIndex = address + i;
      const value = regIndex < this.holdingRegisters.length ? this.holdingRegisters[regIndex] : 0;
      response.writeUInt16BE(value, 3 + i * 2);
    }

    return response;
  }

  /**
   * 读取输入寄存器
   */
  handleReadInputRegisters(data) {
    const address = data.readUInt16BE(0);
    const quantity = data.readUInt16BE(2);

    if (quantity < 1 || quantity > 125) {
      throw new Error('无效的数量');
    }

    const byteCount = quantity * 2;
    const response = Buffer.alloc(3 + byteCount);
    response.writeUInt8(this.unitId, 0);
    response.writeUInt8(0x04, 1); // 功能码
    response.writeUInt8(byteCount, 2);

    for (let i = 0; i < quantity; i++) {
      const regIndex = address + i;
      const value = regIndex < this.inputRegisters.length ? this.inputRegisters[regIndex] : 0;
      response.writeUInt16BE(value, 3 + i * 2);
    }

    return response;
  }

  /**
   * 写入单个线圈
   */
  handleWriteSingleCoil(data) {
    const address = data.readUInt16BE(0);
    const value = data.readUInt16BE(2);

    if (value !== 0x0000 && value !== 0xFF00) {
      throw new Error('无效的线圈值');
    }

    if (address < this.coils.length) {
      this.coils[address] = (value === 0xFF00);
      logger.info(`写入线圈 ${address}: ${this.coils[address]}`);
    }

    const response = Buffer.alloc(6);
    response.writeUInt8(this.unitId, 0);
    response.writeUInt8(0x05, 1); // 功能码
    response.writeUInt16BE(address, 2);
    response.writeUInt16BE(value, 4);

    return response;
  }

  /**
   * 写入单个寄存器
   */
  handleWriteSingleRegister(data) {
    const address = data.readUInt16BE(0);
    const value = data.readUInt16BE(2);

    if (address < this.holdingRegisters.length) {
      this.holdingRegisters[address] = value;
      logger.info(`写入寄存器 ${address}: ${value}`);
    }

    const response = Buffer.alloc(6);
    response.writeUInt8(this.unitId, 0);
    response.writeUInt8(0x06, 1); // 功能码
    response.writeUInt16BE(address, 2);
    response.writeUInt16BE(value, 4);

    return response;
  }

  /**
   * 写入多个寄存器
   */
  handleWriteMultipleRegisters(data) {
    const address = data.readUInt16BE(0);
    const quantity = data.readUInt16BE(2);
    const byteCount = data.readUInt8(4);

    if (quantity < 1 || quantity > 123) {
      throw new Error('无效的数量');
    }

    if (byteCount !== quantity * 2) {
      throw new Error('字节数不匹配');
    }

    for (let i = 0; i < quantity; i++) {
      const regIndex = address + i;
      const value = data.readUInt16BE(5 + i * 2);
      if (regIndex < this.holdingRegisters.length) {
        this.holdingRegisters[regIndex] = value;
      }
    }

    logger.info(`写入多个寄存器 ${address}-${address + quantity - 1}`);

    const response = Buffer.alloc(6);
    response.writeUInt8(this.unitId, 0);
    response.writeUInt8(0x10, 1); // 功能码
    response.writeUInt16BE(address, 2);
    response.writeUInt16BE(quantity, 4);

    return response;
  }

  /**
   * 创建错误响应
   */
  createErrorResponse(originalData, exceptionCode) {
    const transactionId = originalData.readUInt16BE(0);
    const unitId = originalData.readUInt8(6);
    const functionCode = originalData.readUInt8(7);

    const response = Buffer.alloc(9);
    response.writeUInt16BE(transactionId, 0);
    response.writeUInt16BE(0, 2); // 协议ID
    response.writeUInt16BE(3, 4); // 长度
    response.writeUInt8(unitId, 6);
    response.writeUInt8(functionCode | 0x80, 7); // 错误功能码
    response.writeUInt8(exceptionCode, 8);

    return response;
  }

  /**
   * 启动数据更新
   */
  startDataUpdate() {
    this.updateInterval = setInterval(() => {
      this.updateSimulatedData();
    }, 5000); // 每5秒更新一次数据
  }

  /**
   * 更新模拟数据
   */
  updateSimulatedData() {
    // 模拟电压波动 (±5V)
    this.holdingRegisters[0] = 2200 + Math.floor((Math.random() - 0.5) * 100);
    this.holdingRegisters[2] = 2200 + Math.floor((Math.random() - 0.5) * 100);
    this.holdingRegisters[4] = 2200 + Math.floor((Math.random() - 0.5) * 100);

    // 模拟电流波动 (±1A)
    this.holdingRegisters[1] = 1000 + Math.floor((Math.random() - 0.5) * 200);
    this.holdingRegisters[3] = 1050 + Math.floor((Math.random() - 0.5) * 200);
    this.holdingRegisters[5] = 980 + Math.floor((Math.random() - 0.5) * 200);

    // 模拟功率变化
    const totalCurrent = this.holdingRegisters[1] + this.holdingRegisters[3] + this.holdingRegisters[5];
    const avgVoltage = (this.holdingRegisters[0] + this.holdingRegisters[2] + this.holdingRegisters[4]) / 3;
    const totalPower = Math.floor((totalCurrent * avgVoltage) / 100000); // 简化计算
    this.holdingRegisters[11] = totalPower;

    // 模拟温度变化 (±2°C)
    this.inputRegisters[0] = 250 + Math.floor((Math.random() - 0.5) * 40);

    // 模拟湿度变化 (±5%)
    this.inputRegisters[1] = 650 + Math.floor((Math.random() - 0.5) * 100);

    // 模拟PM2.5变化
    this.inputRegisters[5] = Math.max(0, 25 + Math.floor((Math.random() - 0.5) * 20));

    // 模拟CO2变化
    this.inputRegisters[7] = 400 + Math.floor((Math.random() - 0.5) * 100);

    // 累计电能
    this.holdingRegisters[21] += Math.floor(totalPower / 3600); // 简化的电能累计

    logger.debug('模拟数据已更新');
  }

  /**
   * 获取当前数据状态
   */
  getStatus() {
    return {
      port: this.port,
      host: this.host,
      unitId: this.unitId,
      clientCount: this.clients.size,
      isRunning: this.server !== null,
      sampleData: {
        voltage_a: this.holdingRegisters[0] / 10,
        current_a: this.holdingRegisters[1] / 100,
        temperature: this.inputRegisters[0] / 10,
        humidity: this.inputRegisters[1] / 10,
        pm25: this.inputRegisters[5],
        device_status: this.coils[0]
      }
    };
  }
}

/**
 * 命令行启动
 */
if (require.main === module) {
  const port = parseInt(process.argv[2]) || 502;
  const host = process.argv[3] || '0.0.0.0';
  const unitId = parseInt(process.argv[4]) || 1;

  const simulator = new ModbusSimulator({ port, host, unitId });

  // 优雅关闭
  process.on('SIGINT', async () => {
    console.log('\n正在关闭 Modbus 模拟器...');
    await simulator.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n正在关闭 Modbus 模拟器...');
    await simulator.stop();
    process.exit(0);
  });

  // 启动模拟器
  simulator.start()
    .then(() => {
      console.log('\nModbus 模拟器使用说明:');
      console.log('- 智能电表数据: 保持寄存器 0-31');
      console.log('- 环境监测数据: 输入寄存器 0-10');
      console.log('- 状态位: 线圈 0-2, 离散输入 0-2');
      console.log('- 按 Ctrl+C 停止模拟器');
      
      // 定期显示状态
      setInterval(() => {
        const status = simulator.getStatus();
        console.log(`\n[${new Date().toLocaleTimeString()}] 模拟器状态:`);
        console.log(`  客户端连接数: ${status.clientCount}`);
        console.log(`  电压A: ${status.sampleData.voltage_a}V`);
        console.log(`  电流A: ${status.sampleData.current_a}A`);
        console.log(`  温度: ${status.sampleData.temperature}°C`);
        console.log(`  湿度: ${status.sampleData.humidity}%RH`);
        console.log(`  PM2.5: ${status.sampleData.pm25}μg/m³`);
      }, 30000); // 每30秒显示一次状态
    })
    .catch(error => {
      console.error('启动 Modbus 模拟器失败:', error);
      process.exit(1);
    });
}

module.exports = ModbusSimulator;