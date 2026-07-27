/**
 * 查询伯宁电表协议配置
 */

const { ProtocolConfig } = require('../models');
const { Op } = require('sequelize');

async function checkProtocolConfig() {
  try {
    console.log('=== 查询伯宁电表协议配置 ===\n');
    
    // 查询伯宁电表协议配置
    const configs = await ProtocolConfig.findAll({
      where: {
        name: {
          [Op.iLike]: '%伯宁%'
        },
        status: 'active'
      },
      attributes: ['id', 'name', 'manufacturer_code', 'device_type', 'modbus_registers']
    });
    
    if (configs.length === 0) {
      console.log('未找到伯宁电表协议配置');
      return;
    }
    
    console.log(`找到 ${configs.length} 个伯宁电表协议配置：\n`);
    
    configs.forEach((config, index) => {
      console.log(`${index + 1}. ${config.name} (${config.id})`);
      console.log(`   厂商代码: ${config.manufacturer_code}`);
      console.log(`   设备类型: ${config.device_type}`);
      
      // 查找电压相关的寄存器配置
      const voltageRegisters = config.modbus_registers.filter(reg => 
        reg.name && (reg.name.includes('电压') || reg.name.toLowerCase().includes('voltage'))
      );
      
      console.log(`   电压相关寄存器配置 (${voltageRegisters.length} 个):`);
      voltageRegisters.forEach(reg => {
        console.log(`     - ${reg.name}: 地址=${reg.address}, 数据类型=${reg.dataType}, 缩放因子=${reg.scale}, 单位=${reg.unit}`);
      });
      
      console.log();
    });
    
  } catch (error) {
    console.error('查询协议配置失败:', error);
  } finally {
    // 关闭数据库连接
    process.exit(0);
  }
}

// 执行查询
checkProtocolConfig();