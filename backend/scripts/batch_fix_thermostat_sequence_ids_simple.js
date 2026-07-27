const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');

// 创建数据库连接池
const pool = new Pool(getPoolConfig());

// 设备名称和对应序列号的映射
const DEVICE_MAPPINGS = [
    { name: '1号楼1层东区-1001房间', sequenceId: 1 },
    { name: '1号楼1层东区-1002房间', sequenceId: 2 },
    { name: '1号楼1层东区-1003房间', sequenceId: 3 },
    { name: '1号楼1层东区-1004房间', sequenceId: 4 }
];

async function main() {
    const client = await pool.connect();
    
    try {
        console.log('✅ 数据库连接成功');
        console.log('🚀 开始批量修复温控器序列号...\n');
        
        // 开始事务
        await client.query('BEGIN');
        console.log('🔄 事务已开始\n');
        
        let successCount = 0;
        let errorCount = 0;
        
        for (const mapping of DEVICE_MAPPINGS) {
            const { name, sequenceId } = mapping;
            
            try {
                console.log(`🔍 处理设备: ${name} (序列号: ${sequenceId})`);
                
                // 1. 查找设备
                const deviceQuery = `
                    SELECT 
                        d.id, 
                        d.name, 
                        d.parent_device_id,
                        d.concentrator_id,
                        d.concentrator_sequence_id,
                        d.status
                    FROM devices d
                    JOIN device_types dt ON d.device_type_id = dt.id
                    WHERE d.name = $1 AND dt.name = '空调温控器'
                `;
                
                const deviceResult = await client.query(deviceQuery, [name]);
                const device = deviceResult.rows[0];
                
                if (!device) {
                    throw new Error(`设备未找到: ${name}`);
                }
                
                console.log(`   📋 设备ID: ${device.id}`);
                console.log(`   📋 当前状态: parent_device_id=${device.parent_device_id}, concentrator_id=${device.concentrator_id}, sequence_id=${device.concentrator_sequence_id}`);
                
                // 2. 检查是否为集中器管理的温控器
                if (!device.parent_device_id) {
                    throw new Error(`设备 ${name} 不是集中器管理的温控器（缺少parent_device_id）`);
                }
                
                // 3. 获取集中器ID（从parent_device_id）
                const concentratorId = device.parent_device_id;
                
                // 4. 检查序列号冲突
                const conflictQuery = `
                    SELECT d.id, d.name 
                    FROM devices d
                    WHERE d.concentrator_id = $1 
                    AND d.concentrator_sequence_id = $2
                    AND d.id != $3
                `;
                
                const conflictResult = await client.query(conflictQuery, [concentratorId, sequenceId, device.id]);
                
                if (conflictResult.rows.length > 0) {
                    throw new Error(`序列号 ${sequenceId} 在集中器 ${concentratorId} 下已被设备 ${conflictResult.rows[0].name} 使用`);
                }
                
                // 5. 更新设备
                const updateQuery = `
                    UPDATE devices 
                    SET 
                        concentrator_id = $1,
                        concentrator_sequence_id = $2,
                        updated_at = NOW()
                    WHERE id = $3
                    RETURNING id, name, concentrator_id, concentrator_sequence_id
                `;
                
                const updateResult = await client.query(updateQuery, [concentratorId, sequenceId, device.id]);
                const updatedDevice = updateResult.rows[0];
                
                console.log(`   ✅ 更新成功`);
                console.log(`   📋 新状态: concentrator_id=${updatedDevice.concentrator_id}, sequence_id=${updatedDevice.concentrator_sequence_id}\n`);
                
                successCount++;
                
            } catch (error) {
                console.log(`   ❌ 处理失败: ${error.message}\n`);
                errorCount++;
                // 不要抛出错误，继续处理下一个设备
            }
        }
        
        if (errorCount > 0) {
            console.log('❌ 发现错误，回滚事务...');
            await client.query('ROLLBACK');
            console.log('🔄 事务已回滚');
        } else {
            console.log('✅ 所有设备处理成功，提交事务...');
            await client.query('COMMIT');
            console.log('🔄 事务已提交');
        }
        
        // 打印摘要
        console.log('\n' + '='.repeat(60));
        console.log('📊 执行摘要');
        console.log('='.repeat(60));
        console.log(`✅ 成功处理: ${successCount} 个设备`);
        console.log(`❌ 处理失败: ${errorCount} 个设备`);
        console.log('='.repeat(60));
        console.log(errorCount === 0 ? '🎉 批量修复完成！' : '⚠️  批量修复完成，但有部分失败');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('💥 执行过程中发生严重错误:', error.message);
        try {
            await client.query('ROLLBACK');
            console.log('🔄 事务已回滚');
        } catch (rollbackError) {
            console.error('💥 回滚失败:', rollbackError.message);
        }
    } finally {
        client.release();
        console.log('✅ 数据库连接已关闭');
        await pool.end();
    }
}

// 执行主函数
main().catch(error => {
    console.error('💥 脚本执行失败:', error);
    process.exit(1);
});