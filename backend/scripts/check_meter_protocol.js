/**
 * 查询特定电表使用的协议配置
 */

const { ElectricMeter, ProtocolConfig, Device } = require('../models');
const { Op } = require('sequelize');

async function checkMeterProtocol() {
  try {
    console.log('=== 查询电表协议配置 ===\n');
    
    const imei = '865661075118854001';
    
    // 查询电表信息 - 通过meter_number字段查询（meter_number包含IMEI）
    const meter = await ElectricMeter.findOne({
      where: {
        meter_number: {
          [Op.like]: `${imei}%`
        }
      },
      include: [
        {
          model: ProtocolConfig,
          as: 'protocol_config',
          attributes: ['id', 'name', 'manufacturer_code', 'device_type', 'modbus_registers']
        },
        {
          model: Device,
          as: 'Device',
          attributes: ['id', 'name', 'imei', 'status']
        }
      ]
    });
    
    if (!meter) {
      console.log(`未找到IMEI为 ${imei} 的电表`);
      return;
    }
    
    console.log(`电表信息:`);
    console.log(`- 电表ID: ${meter.id}`);
    console.log(`- 电表名称: ${meter.name}`);
    console.log(`- 电表编号: ${meter.meter_number}`);
    console.log(`- 电表地址: ${meter.meter_address}`);
    console.log(`- 设备IMEI: ${meter.Device?.imei}`);
    console.log(`- 状态: ${meter.status}`);
    
    if (!meter.protocol_config) {
      console.log(`该电表未配置协议`);
      return;
    }
    
    console.log(`\n使用的协议配置:`);
    console.log(`- 协议ID: ${meter.protocol_config.id}`);
    console.log(`- 协议名称: ${meter.protocol_config.name}`);
    console.log(`- 厂商代码: ${meter.protocol_config.manufacturer_code}`);
    console.log(`- 设备类型: ${meter.protocol_config.device_type}`);
    
    // 查找电压相关的寄存器配置
    const voltageRegisters = meter.protocol_config.modbus_registers.filter(reg => 
      reg.name && (reg.name.includes('电压') || reg.name.toLowerCase().includes('voltage'))
    );
    
    console.log(`\n电压相关寄存器配置 (${voltageRegisters.length} 个):`);
    voltageRegisters.forEach(reg => {
      console.log(`- ${reg.name}: 地址=${reg.address}, 数据类型=${reg.dataType}, 缩放因子=${reg.scale}, 单位=${reg.unit}`);
    });
    
  } catch (error) {
    console.error('查询电表协议配置失败:', error);
  } finally {
    // 关闭数据库连接
    process.exit(0);
  }
}

// 执行查询
checkMeterProtocol();