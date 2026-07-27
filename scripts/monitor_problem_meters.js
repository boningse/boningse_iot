/**
 * 问题电表监控脚本
 * 实时监控特定电表的数据异常并生成报告
 */

const fs = require('fs');
const path = require('path');
const MeterDataValidator = require('./validate_meter_data');

class ProblemMeterMonitor {
    constructor() {
        this.validator = new MeterDataValidator();
        this.logFile = '/mnt/mydisk/iot/backend/logs/app.log';
        this.problemMeters = [
            '865661075118854001'  // 已知问题电表
        ];
        this.monitoringActive = false;
        this.stats = {
            totalChecks: 0,
            anomaliesDetected: 0,
            lastCheck: null,
            problemMeterStats: {}
        };
        
        // 初始化问题电表统计
        this.problemMeters.forEach(meter => {
            this.stats.problemMeterStats[meter] = {
                totalRecords: 0,
                validRecords: 0,
                invalidRecords: 0,
                lastAnomaly: null,
                anomalyTypes: {}
            };
        });
    }

    /**
     * 开始监控
     */
    startMonitoring() {
        console.log('🔍 启动问题电表监控...');
        console.log(`监控电表: ${this.problemMeters.join(', ')}`);
        console.log('按 Ctrl+C 停止监控\n');
        
        this.monitoringActive = true;
        this.monitorLoop();
        
        // 设置定期报告
        setInterval(() => {
            this.generateStatusReport();
        }, 60000); // 每分钟生成一次状态报告
    }

    /**
     * 监控循环
     */
    async monitorLoop() {
        while (this.monitoringActive) {
            try {
                await this.checkRecentData();
                this.stats.lastCheck = new Date().toISOString();
                await this.sleep(10000); // 每10秒检查一次
            } catch (error) {
                console.error('监控过程中发生错误:', error.message);
                await this.sleep(5000);
            }
        }
    }

    /**
     * 检查最近的数据
     */
    async checkRecentData() {
        try {
            // 读取日志文件的最后几行
            const logContent = fs.readFileSync(this.logFile, 'utf8');
            const lines = logContent.split('\n').slice(-50); // 最后50行
            
            for (const line of lines) {
                if (this.isRelevantLogLine(line)) {
                    await this.processLogLine(line);
                }
            }
            
            this.stats.totalChecks++;
        } catch (error) {
            console.error('读取日志文件失败:', error.message);
        }
    }

    /**
     * 判断是否为相关日志行
     */
    isRelevantLogLine(line) {
        // 检查是否包含问题电表号
        const containsProblemMeter = this.problemMeters.some(meter => line.includes(meter));
        
        // 检查是否为数据相关日志
        const isDataRelated = line.includes('聚合电表数据已保存') || 
                              line.includes('编码修复后RTU响应解析成功') ||
                              line.includes('传统手动解析RTU响应成功') ||
                              line.includes('RTU响应解析失败');
        
        return containsProblemMeter && isDataRelated;
    }

    /**
     * 处理日志行
     */
    async processLogLine(line) {
        try {
            // 提取时间戳
            const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
            if (!timestampMatch) return;
            
            const timestamp = timestampMatch[1];
            const now = new Date();
            const logTime = new Date(timestamp);
            
            // 只处理最近5分钟的日志
            if (now - logTime > 5 * 60 * 1000) return;
            
            // 提取电表号
            const meterMatch = this.problemMeters.find(meter => line.includes(meter));
            if (!meterMatch) return;
            
            // 分析不同类型的日志
            if (line.includes('编码修复后RTU响应解析成功')) {
                this.analyzeEncodingFixLog(line, meterMatch, timestamp);
            } else if (line.includes('传统手动解析RTU响应成功')) {
                this.analyzeManualParsingLog(line, meterMatch, timestamp);
            } else if (line.includes('RTU响应解析失败')) {
                this.analyzeParsingFailureLog(line, meterMatch, timestamp);
            } else if (line.includes('聚合电表数据已保存')) {
                this.analyzeDataSavedLog(line, meterMatch, timestamp);
            }
            
        } catch (error) {
            console.error('处理日志行失败:', error.message);
        }
    }

    /**
     * 分析编码修复日志
     */
    analyzeEncodingFixLog(line, meterNumber, timestamp) {
        try {
            const metaMatch = line.match(/Meta: ({.*})/);
            if (!metaMatch) return;
            
            const meta = JSON.parse(metaMatch[1]);
            if (meta.registers) {
                const hasAnomalousValues = meta.registers.some(reg => 
                    reg > 50000 || (reg > 1000 && reg < 65000)
                );
                
                if (hasAnomalousValues) {
                    this.recordAnomaly(meterNumber, 'encoding_fix_anomalous_registers', {
                        timestamp,
                        registers: meta.registers,
                        strategy: meta.fixStrategy
                    });
                }
            }
        } catch (error) {
            console.error('分析编码修复日志失败:', error.message);
        }
    }

    /**
     * 分析手动解析日志
     */
    analyzeManualParsingLog(line, meterNumber, timestamp) {
        try {
            const metaMatch = line.match(/Meta: ({.*})/);
            if (!metaMatch) return;
            
            const meta = JSON.parse(metaMatch[1]);
            if (meta.parsedResponse && meta.parsedResponse.data && meta.parsedResponse.data.registers) {
                const registers = meta.parsedResponse.data.registers;
                const hasAnomalousValues = registers.some(reg => 
                    reg > 50000 || (reg > 1000 && reg < 65000)
                );
                
                if (hasAnomalousValues) {
                    this.recordAnomaly(meterNumber, 'manual_parsing_anomalous_registers', {
                        timestamp,
                        registers,
                        confidence: meta.parsedResponse.diagnostics?.confidence
                    });
                }
            }
        } catch (error) {
            console.error('分析手动解析日志失败:', error.message);
        }
    }

    /**
     * 分析解析失败日志
     */
    analyzeParsingFailureLog(line, meterNumber, timestamp) {
        this.recordAnomaly(meterNumber, 'parsing_failure', {
            timestamp,
            reason: 'RTU响应解析失败'
        });
    }

    /**
     * 分析数据保存日志
     */
    analyzeDataSavedLog(line, meterNumber, timestamp) {
        try {
            const metaMatch = line.match(/Meta: ({.*})/);
            if (!metaMatch) return;
            
            const meta = JSON.parse(metaMatch[1]);
            const stats = this.stats.problemMeterStats[meterNumber];
            
            stats.totalRecords++;
            
            if (meta.quality < 100) {
                this.recordAnomaly(meterNumber, 'low_data_quality', {
                    timestamp,
                    quality: meta.quality,
                    dataPoints: meta.dataPoints
                });
                stats.invalidRecords++;
            } else {
                stats.validRecords++;
            }
        } catch (error) {
            console.error('分析数据保存日志失败:', error.message);
        }
    }

    /**
     * 记录异常
     */
    recordAnomaly(meterNumber, type, details) {
        const stats = this.stats.problemMeterStats[meterNumber];
        
        if (!stats.anomalyTypes[type]) {
            stats.anomalyTypes[type] = 0;
        }
        stats.anomalyTypes[type]++;
        stats.lastAnomaly = details.timestamp;
        
        this.stats.anomaliesDetected++;
        
        console.log(`⚠️  [${details.timestamp}] 电表 ${meterNumber} 检测到异常:`);
        console.log(`   类型: ${type}`);
        console.log(`   详情: ${JSON.stringify(details, null, 2)}\n`);
    }

    /**
     * 生成状态报告
     */
    generateStatusReport() {
        console.log('\n📊 === 问题电表监控状态报告 ===');
        console.log(`报告时间: ${new Date().toLocaleString()}`);
        console.log(`总检查次数: ${this.stats.totalChecks}`);
        console.log(`检测到异常: ${this.stats.anomaliesDetected}`);
        console.log(`最后检查: ${this.stats.lastCheck}`);
        
        console.log('\n📈 各电表详细统计:');
        Object.entries(this.stats.problemMeterStats).forEach(([meter, stats]) => {
            console.log(`\n  电表 ${meter}:`);
            console.log(`    总记录数: ${stats.totalRecords}`);
            console.log(`    有效记录: ${stats.validRecords}`);
            console.log(`    无效记录: ${stats.invalidRecords}`);
            console.log(`    数据质量: ${stats.totalRecords > 0 ? ((stats.validRecords / stats.totalRecords) * 100).toFixed(1) : 0}%`);
            console.log(`    最后异常: ${stats.lastAnomaly || '无'}`);
            
            if (Object.keys(stats.anomalyTypes).length > 0) {
                console.log(`    异常类型统计:`);
                Object.entries(stats.anomalyTypes).forEach(([type, count]) => {
                    console.log(`      ${type}: ${count}次`);
                });
            }
        });
        
        console.log('\n===============================\n');
    }

    /**
     * 停止监控
     */
    stopMonitoring() {
        this.monitoringActive = false;
        console.log('\n🛑 监控已停止');
        this.generateStatusReport();
    }

    /**
     * 休眠函数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 主程序
if (require.main === module) {
    const monitor = new ProblemMeterMonitor();
    
    // 处理退出信号
    process.on('SIGINT', () => {
        monitor.stopMonitoring();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        monitor.stopMonitoring();
        process.exit(0);
    });
    
    // 开始监控
    monitor.startMonitoring();
}

module.exports = ProblemMeterMonitor;