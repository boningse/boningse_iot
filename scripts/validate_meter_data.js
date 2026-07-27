/**
 * 电表数据验证脚本
 * 用于检测和过滤异常的电表数据值
 */

class MeterDataValidator {
    constructor() {
        // 定义正常数据范围
        this.limits = {
            voltage: { min: 0, max: 500 },      // 电压范围 0-500V
            current: { min: 0, max: 1000 },     // 电流范围 0-1000A
            power: { min: 0, max: 100000 },     // 功率范围 0-100kW
            powerFactor: { min: 0, max: 1 },    // 功率因数 0-1
            frequency: { min: 45, max: 65 },    // 频率 45-65Hz
            temperature: { min: -40, max: 85 }   // 温度 -40到85°C
        };
        
        // 异常值检测阈值
        this.anomalyThresholds = {
            currentSpike: 500,    // 电流突变阈值
            voltageSpike: 300,    // 电压突变阈值
            powerSpike: 50000     // 功率突变阈值
        };
    }

    /**
     * 验证单个数据点
     */
    validateDataPoint(value, type) {
        if (value === null || value === undefined) {
            return { valid: true, reason: 'null_value' };
        }

        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
            return { valid: false, reason: 'not_a_number', value };
        }

        const limit = this.limits[type];
        if (!limit) {
            return { valid: true, reason: 'no_limit_defined' };
        }

        if (numValue < limit.min || numValue > limit.max) {
            return { 
                valid: false, 
                reason: 'out_of_range', 
                value: numValue,
                range: limit
            };
        }

        return { valid: true, value: numValue };
    }

    /**
     * 验证完整的电表数据记录
     */
    validateMeterRecord(data) {
        const results = {
            valid: true,
            errors: [],
            warnings: [],
            cleanedData: { ...data }
        };

        // 验证电压数据
        ['phase_a_voltage', 'phase_b_voltage', 'phase_c_voltage'].forEach(field => {
            const result = this.validateDataPoint(data[field], 'voltage');
            if (!result.valid) {
                results.errors.push({
                    field,
                    reason: result.reason,
                    value: result.value,
                    range: result.range
                });
                results.cleanedData[field] = null;
                results.valid = false;
            }
        });

        // 验证电流数据
        ['phase_a_current', 'phase_b_current', 'phase_c_current'].forEach(field => {
            const result = this.validateDataPoint(data[field], 'current');
            if (!result.valid) {
                results.errors.push({
                    field,
                    reason: result.reason,
                    value: result.value,
                    range: result.range
                });
                results.cleanedData[field] = null;
                results.valid = false;
            }
        });

        // 验证功率数据
        ['phase_a_power', 'phase_b_power', 'phase_c_power', 'total_power'].forEach(field => {
            const result = this.validateDataPoint(data[field], 'power');
            if (!result.valid) {
                results.errors.push({
                    field,
                    reason: result.reason,
                    value: result.value,
                    range: result.range
                });
                results.cleanedData[field] = null;
                results.valid = false;
            }
        });

        // 验证功率因数
        ['phase_a_power_factor', 'phase_b_power_factor', 'phase_c_power_factor', 'total_power_factor'].forEach(field => {
            const result = this.validateDataPoint(data[field], 'powerFactor');
            if (!result.valid) {
                results.errors.push({
                    field,
                    reason: result.reason,
                    value: result.value,
                    range: result.range
                });
                results.cleanedData[field] = null;
                results.valid = false;
            }
        });

        // 验证频率
        const freqResult = this.validateDataPoint(data.frequency, 'frequency');
        if (!freqResult.valid) {
            results.errors.push({
                field: 'frequency',
                reason: freqResult.reason,
                value: freqResult.value,
                range: freqResult.range
            });
            results.cleanedData.frequency = null;
            results.valid = false;
        }

        // 检测异常突变
        this.detectAnomalies(data, results);

        return results;
    }

    /**
     * 检测数据异常突变
     */
    detectAnomalies(data, results) {
        // 检测电流异常突变
        const currents = [
            parseFloat(data.phase_a_current) || 0,
            parseFloat(data.phase_b_current) || 0,
            parseFloat(data.phase_c_current) || 0
        ];

        currents.forEach((current, index) => {
            if (current > this.anomalyThresholds.currentSpike) {
                results.warnings.push({
                    type: 'current_spike',
                    phase: ['A', 'B', 'C'][index],
                    value: current,
                    threshold: this.anomalyThresholds.currentSpike
                });
            }
        });

        // 检测电压异常
        const voltages = [
            parseFloat(data.phase_a_voltage) || 0,
            parseFloat(data.phase_b_voltage) || 0,
            parseFloat(data.phase_c_voltage) || 0
        ];

        voltages.forEach((voltage, index) => {
            if (voltage > this.anomalyThresholds.voltageSpike) {
                results.warnings.push({
                    type: 'voltage_spike',
                    phase: ['A', 'B', 'C'][index],
                    value: voltage,
                    threshold: this.anomalyThresholds.voltageSpike
                });
            }
        });
    }

    /**
     * 生成验证报告
     */
    generateValidationReport(meterNumber, validationResult) {
        const timestamp = new Date().toISOString();
        
        console.log(`\n=== 电表数据验证报告 ===`);
        console.log(`电表号: ${meterNumber}`);
        console.log(`验证时间: ${timestamp}`);
        console.log(`验证结果: ${validationResult.valid ? '通过' : '失败'}`);
        
        if (validationResult.errors.length > 0) {
            console.log(`\n错误 (${validationResult.errors.length}):`);
            validationResult.errors.forEach((error, index) => {
                console.log(`  ${index + 1}. ${error.field}: ${error.reason}`);
                console.log(`     值: ${error.value}, 允许范围: ${error.range?.min}-${error.range?.max}`);
            });
        }
        
        if (validationResult.warnings.length > 0) {
            console.log(`\n警告 (${validationResult.warnings.length}):`);
            validationResult.warnings.forEach((warning, index) => {
                console.log(`  ${index + 1}. ${warning.type}: 相${warning.phase} = ${warning.value} (阈值: ${warning.threshold})`);
            });
        }
        
        console.log(`\n=========================\n`);
        
        return {
            meterNumber,
            timestamp,
            valid: validationResult.valid,
            errorCount: validationResult.errors.length,
            warningCount: validationResult.warnings.length,
            errors: validationResult.errors,
            warnings: validationResult.warnings
        };
    }
}

// 使用示例
if (require.main === module) {
    const validator = new MeterDataValidator();
    
    // 测试异常数据
    const testData = {
        meter_number: '865661075118854001',
        phase_a_voltage: null,
        phase_b_voltage: null,
        phase_c_voltage: null,
        phase_a_current: '307.200',
        phase_b_current: '75479.450',  // 异常值
        phase_c_current: '80879.627',  // 异常值
        total_power: null,
        frequency: '50.0'
    };
    
    console.log('测试异常数据验证:');
    const result = validator.validateMeterRecord(testData);
    const report = validator.generateValidationReport(testData.meter_number, result);
    
    console.log('清理后的数据:');
    console.log(JSON.stringify(result.cleanedData, null, 2));
}

module.exports = MeterDataValidator;