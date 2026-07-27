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

class BatchThermostatSequenceIdFixer {
    constructor() {
        this.client = null;
        this.results = [];
        this.errors = [];
    }

    async connect() {
        this.client = await pool.connect();
        console.log('✅ 数据库连接成功');
    }

    async disconnect() {
        if (this.client) {
            this.client.release();
            console.log('✅ 数据库连接已关闭');
        }
        // 关闭连接池
        await pool.end();
        console.log('✅ 数据库连接池已关闭');
    }

    async findDeviceByName(deviceName) {
        const query = `
            SELECT 
                id, 
                name, 
                device_type, 
                parent_device_id,
                concentrator_id,
                concentrator_sequence_id,
                status
            FROM devices 
            WHERE name = $1 AND device_type = 'thermostat'
        `;
        
        const result = await this.client.query(query, [deviceName]);
        return result.rows[0] || null;
    }

    async checkSequenceIdConflict(concentratorId, sequenceId, excludeDeviceId = null) {
        let query = `
            SELECT id, name 
            FROM devices 
            WHERE concentrator_id = $1 
            AND concentrator_sequence_id = $2
        `;
        let params = [concentratorId, sequenceId];

        if (excludeDeviceId) {
            query += ' AND id != $3';
            params.push(excludeDeviceId);
        }

        const result = await this.client.query(query, params);
        return result.rows;
    }

    async updateDeviceSequenceId(deviceId, concentratorId, sequenceId) {
        const query = `
            UPDATE devices 
            SET 
                concentrator_id = $1,
                concentrator_sequence_id = $2,
                updated_at = NOW()
            WHERE id = $3
            RETURNING id, name, concentrator_id, concentrator_sequence_id
        `;
        
        const result = await this.client.query(query, [concentratorId, sequenceId, deviceId]);
        return result.rows[0];
    }

    async processDevice(deviceMapping) {
        const { name, sequenceId } = deviceMapping;
        
        try {
            console.log(`\n🔍 处理设备: ${name} (序列号: ${sequenceId})`);
            
            // 1. 查找设备
            const device = await this.findDeviceByName(name);
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
            const conflicts = await this.checkSequenceIdConflict(concentratorId, sequenceId, device.id);
            if (conflicts.length > 0) {
                throw new Error(`序列号 ${sequenceId} 在集中器 ${concentratorId} 下已被设备 ${conflicts[0].name} 使用`);
            }

            // 5. 更新设备
            const updatedDevice = await this.updateDeviceSequenceId(device.id, concentratorId, sequenceId);
            
            console.log(`   ✅ 更新成功`);
            console.log(`   📋 新状态: concentrator_id=${updatedDevice.concentrator_id}, sequence_id=${updatedDevice.concentrator_sequence_id}`);

            this.results.push({
                deviceName: name,
                deviceId: device.id,
                sequenceId: sequenceId,
                concentratorId: concentratorId,
                status: 'success',
                oldValues: {
                    concentrator_id: device.concentrator_id,
                    concentrator_sequence_id: device.concentrator_sequence_id
                },
                newValues: {
                    concentrator_id: updatedDevice.concentrator_id,
                    concentrator_sequence_id: updatedDevice.concentrator_sequence_id
                }
            });

        } catch (error) {
            console.log(`   ❌ 处理失败: ${error.message}`);
            this.errors.push({
                deviceName: name,
                sequenceId: sequenceId,
                error: error.message
            });
        }
    }

    async run() {
        try {
            await this.connect();
            
            console.log('🚀 开始批量修复温控器序列号...\n');
            console.log(`📊 待处理设备数量: ${DEVICE_MAPPINGS.length}`);

            // 开始事务
            await this.client.query('BEGIN');
            console.log('🔄 事务已开始');

            // 处理每个设备
            for (const deviceMapping of DEVICE_MAPPINGS) {
                await this.processDevice(deviceMapping);
            }

            // 检查是否有错误
            if (this.errors.length > 0) {
                console.log('\n❌ 发现错误，回滚事务...');
                await this.client.query('ROLLBACK');
                console.log('🔄 事务已回滚');
            } else {
                console.log('\n✅ 所有设备处理成功，提交事务...');
                await this.client.query('COMMIT');
                console.log('🔄 事务已提交');
            }

            // 打印执行摘要
            this.printSummary();

        } catch (error) {
            console.error('💥 执行过程中发生严重错误:', error.message);
            if (this.client) {
                try {
                    await this.client.query('ROLLBACK');
                    console.log('🔄 事务已回滚');
                } catch (rollbackError) {
                    console.error('💥 回滚失败:', rollbackError.message);
                }
            }
        } finally {
            await this.disconnect();
        }
    }

    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 执行摘要');
        console.log('='.repeat(60));
        
        console.log(`✅ 成功处理: ${this.results.length} 个设备`);
        console.log(`❌ 处理失败: ${this.errors.length} 个设备`);
        
        if (this.results.length > 0) {
            console.log('\n✅ 成功处理的设备:');
            this.results.forEach((result, index) => {
                console.log(`   ${index + 1}. ${result.deviceName}`);
                console.log(`      设备ID: ${result.deviceId}`);
                console.log(`      集中器ID: ${result.concentratorId}`);
                console.log(`      序列号: ${result.oldValues.concentrator_sequence_id} → ${result.newValues.concentrator_sequence_id}`);
            });
        }

        if (this.errors.length > 0) {
            console.log('\n❌ 处理失败的设备:');
            this.errors.forEach((error, index) => {
                console.log(`   ${index + 1}. ${error.deviceName} (序列号: ${error.sequenceId})`);
                console.log(`      错误: ${error.error}`);
            });
        }

        console.log('\n' + '='.repeat(60));
        console.log(this.errors.length === 0 ? '🎉 批量修复完成！' : '⚠️  批量修复完成，但有部分失败');
        console.log('='.repeat(60));
    }
}

// 主执行函数
async function main() {
    const fixer = new BatchThermostatSequenceIdFixer();
    await fixer.run();
    process.exit(0);
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(error => {
        console.error('💥 脚本执行失败:', error);
        process.exit(1);
    });
}

module.exports = BatchThermostatSequenceIdFixer;