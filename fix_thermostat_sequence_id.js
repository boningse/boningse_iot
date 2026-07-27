const db = require('./backend/utils/database');
const thermostatService = require('./backend/services/thermostatService');

/**
 * 诊断和修复温控器设备 concentrator_sequence_id 缺失问题
 */
class ThermostatSequenceIdFixer {
  constructor() {
    this.deviceId = '87a39007-e8b5-47fc-bc98-ce870bcabf9b';
    this.deviceName = '1号楼1层东区-1002房间';
  }

  /**
   * 查询设备详细信息
   */
  async getDeviceDetails() {
    console.log('\n=== 1. 查询设备详细信息 ===');
    
    try {
      const deviceQuery = `
        SELECT 
          d.id,
          d.name,
          d.imei,
          d.manufacturer_code,
          d.parent_device_id,
          d.concentrator_id,
          d.concentrator_sequence_id,
          d.created_at,
          d.updated_at,
          tp.power_status,
          tp.target_temp,
          tp.ac_mode,
          tp.last_data_time
        FROM devices d
        LEFT JOIN thermostat_properties tp ON d.id = tp.device_id
        WHERE d.id = $1
      `;
      
      const result = await db.query(deviceQuery, [this.deviceId]);
      
      if (result.rows.length === 0) {
        console.log('❌ 设备不存在');
        return null;
      }
      
      const device = result.rows[0];
      
      console.log('📋 设备基本信息:');
      console.log(`  - ID: ${device.id}`);
      console.log(`  - 名称: ${device.name}`);
      console.log(`  - IMEI: ${device.imei}`);
      console.log(`  - 厂商代码: ${device.manufacturer_code}`);
      console.log(`  - 订阅类型: ${device.subscription_type}`);
      console.log(`  - 父设备ID: ${device.parent_device_id || '无'}`);
      console.log(`  - 集中器ID: ${device.concentrator_id || '无'}`);
      console.log(`  - 集中器序列号: ${device.concentrator_sequence_id || '❌ 未设置'}`);
      console.log(`  - 电源状态: ${device.power_status ? '开启' : '关闭'}`);
      console.log(`  - 目标温度: ${device.target_temp || '未设置'}`);
      console.log(`  - 空调模式: ${device.ac_mode || '未设置'}`);
      console.log(`  - 最后数据时间: ${device.last_data_time || '无'}`);
      
      // 检查是否为集中器管理的温控器
      const isConcentratorManaged = !!(device.parent_device_id && device.concentrator_id);
      console.log(`\n🔗 设备类型: ${isConcentratorManaged ? '集中器管理的温控器' : '独立温控器'}`);
      
      if (isConcentratorManaged) {
        if (device.concentrator_sequence_id) {
          console.log(`✅ 集中器序列号已设置: ${device.concentrator_sequence_id}`);
        } else {
          console.log('❌ 集中器序列号未设置 - 需要修复！');
        }
        
        // 查询集中器信息
        const concentratorQuery = `
          SELECT name, imei, command_config 
          FROM devices 
          WHERE id = $1
        `;
        const concentratorResult = await db.query(concentratorQuery, [device.concentrator_id]);
        
        if (concentratorResult.rows.length > 0) {
          const concentrator = concentratorResult.rows[0];
          console.log(`\n📡 集中器信息:`);
          console.log(`  - 名称: ${concentrator.name}`);
          console.log(`  - IMEI: ${concentrator.imei}`);
          console.log(`  - 协议配置: ${concentrator.command_config ? '已配置' : '未配置'}`);
        }
      }
      
      return device;
      
    } catch (error) {
      console.error('❌ 查询设备信息失败:', error.message);
      return null;
    }
  }

  /**
   * 查询同一集中器下其他温控器的序列号使用情况
   */
  async getUsedSequenceIds(concentratorId) {
    console.log('\n=== 2. 查询序列号使用情况 ===');
    
    try {
      const query = `
        SELECT 
          id,
          name,
          concentrator_sequence_id
        FROM devices
        WHERE concentrator_id = $1 
          AND concentrator_sequence_id IS NOT NULL
        ORDER BY concentrator_sequence_id
      `;
      
      const result = await db.query(query, [concentratorId]);
      
      console.log(`📊 集中器 ${concentratorId} 下已使用的序列号:`);
      
      const usedIds = [];
      if (result.rows.length > 0) {
        result.rows.forEach((device, index) => {
          console.log(`  ${index + 1}. ${device.name} - 序列号: ${device.concentrator_sequence_id}`);
          usedIds.push(device.concentrator_sequence_id);
        });
      } else {
        console.log('  暂无已分配的序列号');
      }
      
      return usedIds;
      
    } catch (error) {
      console.error('❌ 查询序列号使用情况失败:', error.message);
      return [];
    }
  }

  /**
   * 分配可用的序列号
   */
  findAvailableSequenceId(usedIds) {
    console.log('\n=== 3. 分配可用序列号 ===');
    
    // 集中器支持的序列号范围是 1-48
    for (let i = 1; i <= 48; i++) {
      if (!usedIds.includes(i)) {
        console.log(`✅ 找到可用序列号: ${i}`);
        return i;
      }
    }
    
    console.log('❌ 没有可用的序列号（1-48 都已被使用）');
    return null;
  }

  /**
   * 更新设备的 concentrator_sequence_id
   */
  async updateSequenceId(deviceId, sequenceId) {
    console.log('\n=== 4. 更新设备序列号 ===');
    
    try {
      const updateQuery = `
        UPDATE devices 
        SET concentrator_sequence_id = $1, updated_at = NOW()
        WHERE id = $2
      `;
      
      const result = await db.query(updateQuery, [sequenceId, deviceId]);
      
      if (result.rowCount > 0) {
        console.log(`✅ 成功更新设备 ${deviceId} 的序列号为: ${sequenceId}`);
        return true;
      } else {
        console.log('❌ 更新失败，未找到设备');
        return false;
      }
      
    } catch (error) {
      console.error('❌ 更新序列号失败:', error.message);
      return false;
    }
  }

  /**
   * 验证修复结果
   */
  async verifyFix() {
    console.log('\n=== 5. 验证修复结果 ===');
    
    try {
      // 重新查询设备信息
      const device = await this.getDeviceDetails();
      
      if (!device) {
        console.log('❌ 验证失败：设备不存在');
        return false;
      }
      
      if (device.concentrator_sequence_id) {
        console.log(`✅ 验证成功：序列号已设置为 ${device.concentrator_sequence_id}`);
        
        // 测试温控器关闭功能
        console.log('\n🔄 测试温控器关闭功能...');
        
        // 查找一个测试用户
        const userQuery = `
          SELECT u.id, u.username, u.tenant_id, t.name as tenant_name
          FROM users u
          JOIN tenants t ON u.tenant_id = t.id
          WHERE u.username LIKE '%东管%' OR t.name LIKE '%东管%'
          LIMIT 1
        `;
        
        const userResult = await db.query(userQuery);
        
        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          console.log(`👤 使用测试用户: ${user.username} (租户: ${user.tenant_name})`);
          
          try {
            const result = await thermostatService.powerOffDevice(
              this.deviceId,
              user.tenant_id,
              user.id
            );
            
            console.log('✅ 温控器关闭功能测试成功！');
            console.log('📤 发送的MQTT命令:');
            console.log(JSON.stringify(result, null, 2));
            
            return true;
            
          } catch (testError) {
            console.error('❌ 温控器关闭功能测试失败:', testError.message);
            return false;
          }
        } else {
          console.log('⚠️ 未找到测试用户，跳过功能测试');
          return true;
        }
        
      } else {
        console.log('❌ 验证失败：序列号仍未设置');
        return false;
      }
      
    } catch (error) {
      console.error('❌ 验证过程失败:', error.message);
      return false;
    }
  }

  /**
   * 主修复流程
   */
  async fix() {
    console.log(`🔧 开始修复温控器设备: ${this.deviceName}`);
    console.log(`📱 设备ID: ${this.deviceId}`);
    console.log('=' .repeat(80));
    
    try {
      // 1. 查询设备详细信息
      const device = await this.getDeviceDetails();
      
      if (!device) {
        console.log('\n❌ 设备不存在，修复结束');
        return false;
      }
      
      // 检查是否为集中器管理的温控器
      const isConcentratorManaged = !!(device.parent_device_id && device.concentrator_id);
      
      if (!isConcentratorManaged) {
        console.log('\n✅ 该设备是独立温控器，不需要设置 concentrator_sequence_id');
        return true;
      }
      
      // 如果已经有序列号，则不需要修复
      if (device.concentrator_sequence_id) {
        console.log('\n✅ 设备已有序列号，不需要修复');
        return await this.verifyFix();
      }
      
      // 2. 查询已使用的序列号
      const usedIds = await this.getUsedSequenceIds(device.concentrator_id);
      
      // 3. 分配可用序列号
      const availableId = this.findAvailableSequenceId(usedIds);
      
      if (!availableId) {
        console.log('\n❌ 无法分配序列号，修复失败');
        return false;
      }
      
      // 4. 更新设备序列号
      const updateSuccess = await this.updateSequenceId(this.deviceId, availableId);
      
      if (!updateSuccess) {
        console.log('\n❌ 更新序列号失败，修复失败');
        return false;
      }
      
      // 5. 验证修复结果
      const verifySuccess = await this.verifyFix();
      
      if (verifySuccess) {
        console.log('\n' + '='.repeat(80));
        console.log('🎉 修复成功！温控器设备现在可以正常控制了');
        console.log(`📋 修复摘要:`);
        console.log(`  - 设备名称: ${device.name}`);
        console.log(`  - 设备ID: ${this.deviceId}`);
        console.log(`  - 分配的序列号: ${availableId}`);
        console.log(`  - 集中器ID: ${device.concentrator_id}`);
      } else {
        console.log('\n❌ 修复验证失败');
      }
      
      return verifySuccess;
      
    } catch (error) {
      console.error('❌ 修复过程中发生错误:', error.message);
      console.error(error.stack);
      return false;
    } finally {
      // 关闭数据库连接
      setTimeout(() => {
        process.exit(0);
      }, 3000);
    }
  }
}

// 运行修复程序
console.log('🚀 启动温控器序列号修复程序...');
const fixer = new ThermostatSequenceIdFixer();
fixer.fix().then(success => {
  if (success) {
    console.log('\n✅ 修复程序执行成功');
  } else {
    console.log('\n❌ 修复程序执行失败');
    process.exit(1);
  }
}).catch(error => {
  console.error('\n💥 修复程序异常退出:', error.message);
  process.exit(1);
});