/**
 * 查询特定电表的电压数据
 */

const { ElectricMeter, Tenant } = require('../models');
const tenantElectricMeterDataService = require('../services/tenantElectricMeterDataService');
const { Op } = require('sequelize');

async function checkMeterData() {
  try {
    console.log('=== 查询电表电压数据 ===\n');
    
    const imei = '865661075118854001';
    
    // 查询电表信息
    const meter = await ElectricMeter.findOne({
      where: {
        meter_number: {
          [Op.like]: `${imei}%`
        }
      },
      attributes: ['id', 'name', 'meter_number', 'tenant_id', 'protocol_config_id']
    });
    
    if (!meter) {
      console.log(`未找到IMEI为 ${imei} 的电表`);
      return;
    }
    
    console.log(`电表信息:`);
    console.log(`- 电表ID: ${meter.id}`);
    console.log(`- 电表名称: ${meter.name}`);
    console.log(`- 电表编号: ${meter.meter_number}`);
    
    // 查询租户信息
    const tenant = await Tenant.findByPk(meter.tenant_id);
    
    if (!tenant) {
      console.log(`未找到租户ID为 ${meter.tenant_id} 的租户信息`);
      return;
    }
    
    console.log(`- 租户名称: ${tenant.name}`);
    console.log(`- 租户代码: ${tenant.code}`);
    
    // 使用tenantElectricMeterDataService查询最近10条电压数据
    const data = await tenantElectricMeterDataService.queryMeterData(tenant.code, {
      electricMeterId: meter.id,
      limit: 10,
      orderBy: 'collection_timestamp',
      orderDirection: 'DESC'
    });
    
    if (data.length === 0) {
      console.log(`未找到电表 ${meter.name} 的数据记录`);
      return;
    }
    
    console.log(`\n最近 ${data.length} 条电压数据:`);
    data.forEach((record, index) => {
      console.log(`\n记录 ${index + 1} (${record.collection_timestamp}):`);
      
      // 输出完整的记录结构，帮助调试
      console.log('- 完整记录结构:');
      console.log(JSON.stringify(record, null, 2));
      
      // 解析JSON数据字段
      let recordData = {};
      if (record.data) {
        try {
          recordData = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
        } catch (e) {
          console.log('- 数据解析错误:', e.message);
          recordData = record.data;
        }
      }
      
      console.log('- 解析后的数据:');
      console.log(JSON.stringify(recordData, null, 2));
      
      // 尝试多种可能的字段名称
      const voltageFields = [
        'phase_a_voltage', 'a_phase_voltage', 'voltage_a', 'ua',
        'phase_b_voltage', 'b_phase_voltage', 'voltage_b', 'ub', 
        'phase_c_voltage', 'c_phase_voltage', 'voltage_c', 'uc',
        'line_ab_voltage', 'ab_line_voltage', 'voltage_ab', 'uab',
        'line_ac_voltage', 'ac_line_voltage', 'voltage_ac', 'uac',
        'line_bc_voltage', 'bc_line_voltage', 'voltage_bc', 'ubc'
      ];
      
      console.log('- 可能的电压字段:');
      voltageFields.forEach(field => {
        if (recordData[field] !== undefined) {
          console.log(`  ${field}: ${recordData[field]}`);
        }
      });
    });
    
  } catch (error) {
    console.error('查询电表数据失败:', error);
  } finally {
    // 关闭数据库连接
    process.exit(0);
  }
}

// 执行查询
checkMeterData();