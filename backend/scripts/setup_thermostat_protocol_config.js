const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');

// 创建数据库连接池
const pool = new Pool(getPoolConfig());

// 温控器协议配置模板
const THERMOSTAT_PROTOCOL_CONFIG = {
  "command_config": {
    "commands": {
      "power_on": {
        "template": {
          "uuid": "",
          "pType": "params",
          "func": "write",
          "body": {
            "id": [],
            "setOn": 1,
            "setTemp": 250,
            "setMode": 1,
            "setFan": 1
          }
        }
      },
      "power_off": {
        "template": {
          "uuid": "",
          "pType": "params", 
          "func": "write",
          "body": {
            "id": [],
            "setOn": 0
          }
        }
      },
      "set_temperature": {
        "template": {
          "uuid": "",
          "pType": "params",
          "func": "write", 
          "body": {
            "id": [],
            "setTemp": 250
          }
        }
      },
      "set_mode": {
        "template": {
          "uuid": "",
          "pType": "params",
          "func": "write",
          "body": {
            "id": [],
            "setMode": 1
          }
        }
      },
      "set_fan_speed": {
        "template": {
          "uuid": "",
          "pType": "params",
          "func": "write",
          "body": {
            "id": [],
            "setFan": 1
          }
        }
      },
      "set_lock": {
        "template": {
          "uuid": "",
          "pType": "params",
          "func": "write",
          "body": {
            "id": [],
            "lock": 0
          }
        }
      }
    }
  }
};

async function setupThermostatProtocolConfig() {
  const client = await pool.connect();
  
  try {
    console.log('✅ 数据库连接成功');
    console.log('🚀 开始设置温控器协议配置...\n');
    
    // 开始事务
    await client.query('BEGIN');
    console.log('🔄 事务已开始\n');
    
    // 1. 更新集中器的协议配置
    console.log('🔧 更新集中器协议配置...');
    const concentratorUpdateQuery = `
      UPDATE devices 
      SET configuration = $1
      WHERE id = '5cc69707-c8d5-4910-b00b-329287f50e06'
    `;
    
    const concentratorResult = await client.query(concentratorUpdateQuery, [JSON.stringify(THERMOSTAT_PROTOCOL_CONFIG)]);
    console.log(`✅ 集中器协议配置更新成功，影响行数: ${concentratorResult.rowCount}`);
    
    // 2. 更新温控器设备的协议配置
    console.log('🔧 更新温控器设备协议配置...');
    const thermostatUpdateQuery = `
      UPDATE devices 
      SET configuration = $1
      WHERE name LIKE '%1号楼1层东区-100%房间'
    `;
    
    const thermostatResult = await client.query(thermostatUpdateQuery, [JSON.stringify(THERMOSTAT_PROTOCOL_CONFIG)]);
    console.log(`✅ 温控器设备协议配置更新成功，影响行数: ${thermostatResult.rowCount}`);
    
    // 3. 验证配置是否正确设置
    console.log('\n🔍 验证配置设置结果...');
    const verifyQuery = `
      SELECT name, configuration->'command_config'->'commands' as commands
      FROM devices 
      WHERE id = '5cc69707-c8d5-4910-b00b-329287f50e06' 
         OR name LIKE '%1号楼1层东区-100%房间'
      ORDER BY name
    `;
    
    const verifyResult = await client.query(verifyQuery);
    
    for (const row of verifyResult.rows) {
      console.log(`📋 设备: ${row.name}`);
      if (row.commands && Object.keys(row.commands).length > 0) {
        console.log(`   ✅ 协议配置已设置，包含命令: ${Object.keys(row.commands).join(', ')}`);
      } else {
        console.log(`   ❌ 协议配置未正确设置`);
      }
    }
    
    // 提交事务
    await client.query('COMMIT');
    console.log('\n✅ 事务提交成功');
    console.log('🎉 温控器协议配置设置完成！');
    
  } catch (error) {
    // 回滚事务
    await client.query('ROLLBACK');
    console.error('❌ 设置协议配置失败，事务已回滚:', error);
    throw error;
  } finally {
    client.release();
    console.log('🔌 数据库连接已释放');
    // 关闭连接池
    await pool.end();
    console.log('🔌 数据库连接池已关闭');
  }
}

// 执行脚本
if (require.main === module) {
  setupThermostatProtocolConfig()
    .then(() => {
      console.log('\n🎯 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { setupThermostatProtocolConfig, THERMOSTAT_PROTOCOL_CONFIG };