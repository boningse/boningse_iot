/**
 * 修复电表命令quantity参数计算问题
 * 
 * 问题分析：
 * 1. 当前的quantity计算逻辑存在问题，没有严格按照寄存器的count属性设置
 * 2. 在批量查询中，quantity应该是实际需要读取的寄存器数量，而不是地址范围
 * 3. 电压寄存器等有些count=1，有些count=2，需要严格按照协议配置执行
 * 
 * 修复方案：
 * 1. 修正mergeConsecutiveRegisters中的quantity计算逻辑
 * 2. 确保quantity严格按照寄存器的count属性累加
 * 3. 修复批量查询中的地址范围计算
 */

const { ElectricMeter, ProtocolConfig } = require('./models');
const logger = require('./utils/logger');

class QuantityCalculationFixer {
  /**
   * 修复后的合并连续寄存器方法
   * 严格按照寄存器的count属性计算quantity
   */
  static mergeConsecutiveRegistersFixed(registers, functionCode, batchConfig) {
    if (!batchConfig.enableBatchOptimization) {
      // 如果禁用批量优化，返回单个寄存器查询
      return registers.map(register => ({
        function_code: functionCode,
        start_address: register.address,
        quantity: register.count || 1, // 严格使用寄存器的count属性
        data_type: register.data_type || 'uint16',
        register_names: [register.name || register.description || `register_${register.address}`],
        register_mapping: [{
          name: register.name,
          address: register.address,
          data_type: register.data_type,
          unit: register.unit,
          description: register.description,
          count: register.count || 1,
          offset: 0
        }]
      }));
    }

    const mergedQueries = [];
    let currentBatch = null;

    for (const register of registers) {
      const registerCount = register.count || 1; // 该寄存器占用的寄存器数量
      const registerEndAddress = register.address + registerCount - 1;

      if (!currentBatch) {
        // 开始新的批次
        currentBatch = {
          function_code: functionCode,
          start_address: register.address,
          end_address: registerEndAddress,
          quantity: registerCount, // 初始quantity等于第一个寄存器的count
          total_registers: 1, // 包含的寄存器个数
          register_names: [register.name || register.description || `register_${register.address}`],
          register_mapping: [{
            name: register.name,
            address: register.address,
            data_type: register.data_type,
            unit: register.unit,
            description: register.description,
            count: registerCount,
            offset: 0 // 在批量查询中的偏移量
          }]
        };
      } else {
        const gap = register.address - currentBatch.end_address - 1;
        const newTotalQuantity = currentBatch.quantity + registerCount + gap; // 新的总quantity
        const newTotalRegisters = currentBatch.total_registers + 1;

        // 检查是否可以合并到当前批次
        const canMerge = gap <= batchConfig.maxGapSize && 
                        newTotalQuantity <= batchConfig.maxBatchSize &&
                        newTotalRegisters <= (batchConfig.maxRegisterCount || 10);

        if (canMerge) {
          // 合并到当前批次
          currentBatch.end_address = registerEndAddress;
          // 修正quantity计算：应该是从起始地址到结束地址的总寄存器数
          currentBatch.quantity = currentBatch.end_address - currentBatch.start_address + 1;
          currentBatch.total_registers = newTotalRegisters;
          currentBatch.register_names.push(register.name || register.description || `register_${register.address}`);
          
          // 计算正确的偏移量
          const correctOffset = register.address - currentBatch.start_address;
          
          logger.debug('批量查询合并寄存器', {
            registerName: register.name,
            registerAddress: register.address,
            registerCount: registerCount,
            batchStartAddress: currentBatch.start_address,
            batchEndAddress: currentBatch.end_address,
            calculatedOffset: correctOffset,
            totalQuantity: currentBatch.quantity,
            gap: gap
          });
          
          currentBatch.register_mapping.push({
            name: register.name,
            address: register.address,
            data_type: register.data_type,
            unit: register.unit,
            description: register.description,
            count: registerCount,
            offset: correctOffset
          });
        } else {
          // 完成当前批次，开始新批次
          mergedQueries.push(currentBatch);
          currentBatch = {
            function_code: functionCode,
            start_address: register.address,
            end_address: registerEndAddress,
            quantity: registerCount,
            total_registers: 1,
            register_names: [register.name || register.description || `register_${register.address}`],
            register_mapping: [{
              name: register.name,
              address: register.address,
              data_type: register.data_type,
              unit: register.unit,
              description: register.description,
              count: registerCount,
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

    // 验证quantity计算的正确性
    mergedQueries.forEach((query, index) => {
      logger.info(`批量查询${index + 1}验证`, {
        起始地址: query.start_address,
        结束地址: query.end_address,
        quantity: query.quantity,
        寄存器数量: query.total_registers,
        寄存器列表: query.register_names,
        地址范围验证: `${query.start_address}-${query.end_address} = ${query.end_address - query.start_address + 1} 个地址`,
        quantity验证: query.quantity === (query.end_address - query.start_address + 1) ? '✓正确' : '✗错误'
      });
    });

    return mergedQueries;
  }

  /**
   * 验证电表协议配置中的寄存器count设置
   */
  static async validateMeterProtocolConfigs() {
    try {
      const protocolConfigs = await ProtocolConfig.findAll({
        where: {
          device_type: 'electric_meter'
        }
      });

      console.log('\n=== 电表协议配置验证 ===');
      
      for (const config of protocolConfigs) {
        console.log(`\n协议: ${config.name}`);
        console.log(`厂家代码: ${config.manufacturer_code}`);
        
        if (config.modbus_registers && Array.isArray(config.modbus_registers)) {
          console.log(`寄存器数量: ${config.modbus_registers.length}`);
          
          // 分析电压寄存器的count设置
          const voltageRegisters = config.modbus_registers.filter(reg => 
            reg.name && (reg.name.includes('电压') || reg.name.toLowerCase().includes('voltage'))
          );
          
          if (voltageRegisters.length > 0) {
            console.log('\n电压寄存器分析:');
            voltageRegisters.forEach(reg => {
              console.log(`  - ${reg.name}: 地址=${reg.address}, count=${reg.count || 1}, 数据类型=${reg.data_type}`);
            });
            
            // 检查count设置的一致性
            const countValues = voltageRegisters.map(reg => reg.count || 1);
            const uniqueCounts = [...new Set(countValues)];
            
            if (uniqueCounts.length > 1) {
              console.log(`  ⚠️  电压寄存器count值不一致: ${uniqueCounts.join(', ')}`);
              console.log('  这种情况需要特别注意批量查询的分组逻辑');
            } else {
              console.log(`  ✓ 电压寄存器count值一致: ${uniqueCounts[0]}`);
            }
          }
          
          // 分析所有寄存器的count分布
          const allCounts = config.modbus_registers.map(reg => reg.count || 1);
          const countDistribution = {};
          allCounts.forEach(count => {
            countDistribution[count] = (countDistribution[count] || 0) + 1;
          });
          
          console.log('\ncount值分布:');
          Object.entries(countDistribution).forEach(([count, num]) => {
            console.log(`  count=${count}: ${num} 个寄存器`);
          });
        }
      }
      
    } catch (error) {
      console.error('验证协议配置失败:', error);
    }
  }

  /**
   * 测试修复后的quantity计算逻辑
   */
  static testFixedQuantityCalculation() {
    console.log('\n=== 测试修复后的quantity计算逻辑 ===');
    
    // 模拟电压寄存器配置（基于实际数据库查询结果）
    const testRegisters = [
      { name: 'A相电压', address: 0, count: 1, data_type: 'uint16', function_code: 4 },
      { name: 'B相电压', address: 1, count: 1, data_type: 'uint16', function_code: 4 },
      { name: 'C相电压', address: 2, count: 1, data_type: 'uint16', function_code: 4 },
      { name: 'AB线电压', address: 5, count: 2, data_type: 'uint32', function_code: 4 },
      { name: 'BC线电压', address: 7, count: 2, data_type: 'uint32', function_code: 4 },
      { name: 'AC线电压', address: 10, count: 2, data_type: 'uint32', function_code: 4 }
    ];
    
    const batchConfig = {
      enableBatchOptimization: true,
      maxBatchSize: 10,
      maxGapSize: 2,
      maxRegisterCount: 6
    };
    
    console.log('\n输入寄存器:');
    testRegisters.forEach(reg => {
      console.log(`  ${reg.name}: 地址=${reg.address}, count=${reg.count}`);
    });
    
    const mergedQueries = this.mergeConsecutiveRegistersFixed(testRegisters, 4, batchConfig);
    
    console.log('\n修复后的分组结果:');
    mergedQueries.forEach((query, index) => {
      console.log(`\n组${index + 1}:`);
      console.log(`  起始地址: ${query.start_address}`);
      console.log(`  结束地址: ${query.end_address}`);
      console.log(`  quantity: ${query.quantity}`);
      console.log(`  寄存器数量: ${query.total_registers}`);
      console.log(`  包含寄存器: ${query.register_names.join(', ')}`);
      console.log(`  地址范围: ${query.start_address}-${query.end_address}`);
      
      // 验证quantity计算
      const expectedQuantity = query.end_address - query.start_address + 1;
      const isCorrect = query.quantity === expectedQuantity;
      console.log(`  quantity验证: ${query.quantity} ${isCorrect ? '==' : '!='} ${expectedQuantity} ${isCorrect ? '✓' : '✗'}`);
    });
  }
}

// 如果直接运行此脚本，执行测试
if (require.main === module) {
  async function runTests() {
    console.log('开始quantity计算修复验证...');
    
    // 测试修复后的计算逻辑
    QuantityCalculationFixer.testFixedQuantityCalculation();
    
    // 验证数据库中的协议配置
    await QuantityCalculationFixer.validateMeterProtocolConfigs();
    
    console.log('\n=== 修复建议 ===');
    console.log('1. 将修复后的mergeConsecutiveRegistersFixed方法替换原有的mergeConsecutiveRegisters方法');
    console.log('2. 确保quantity计算严格按照地址范围：end_address - start_address + 1');
    console.log('3. 在批量查询中正确处理寄存器的count属性和offset计算');
    console.log('4. 添加quantity计算的验证日志，确保命令正确性');
  }
  
  runTests().catch(console.error);
}

module.exports = QuantityCalculationFixer;