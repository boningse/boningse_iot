#!/usr/bin/env node
/**
 * 内存监控脚本
 * 用于监控IoT系统的内存使用情况，验证优化效果
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class MemoryMonitor {
    constructor() {
        this.logFile = path.join(__dirname, 'memory_monitor.log');
        this.interval = 30000; // 30秒监控一次
        this.monitorTimer = null;
        this.startTime = Date.now();
    }

    /**
     * 获取系统内存信息
     */
    getSystemMemory() {
        try {
            const output = execSync('free -m', { encoding: 'utf8' });
            const lines = output.split('\n');
            const memLine = lines[1].split(/\s+/);
            
            return {
                total: parseInt(memLine[1]),
                used: parseInt(memLine[2]),
                free: parseInt(memLine[3]),
                available: parseInt(memLine[6]),
                usagePercent: Math.round((parseInt(memLine[2]) / parseInt(memLine[1])) * 100)
            };
        } catch (error) {
            console.error('获取系统内存信息失败:', error.message);
            return null;
        }
    }

    /**
     * 获取Node.js进程内存信息
     */
    getNodeProcessMemory() {
        try {
            const output = execSync('ps aux | grep "node app.js" | grep -v grep', { encoding: 'utf8' });
            const lines = output.trim().split('\n').filter(line => line.trim());
            
            let totalMemory = 0;
            let processCount = 0;
            
            lines.forEach(line => {
                const parts = line.split(/\s+/);
                if (parts.length >= 6) {
                    const memoryKB = parseInt(parts[5]); // RSS内存（KB）
                    if (!isNaN(memoryKB)) {
                        totalMemory += memoryKB;
                        processCount++;
                    }
                }
            });
            
            return {
                processCount,
                totalMemoryMB: Math.round(totalMemory / 1024),
                averageMemoryMB: processCount > 0 ? Math.round(totalMemory / 1024 / processCount) : 0
            };
        } catch (error) {
            console.error('获取Node.js进程内存信息失败:', error.message);
            return { processCount: 0, totalMemoryMB: 0, averageMemoryMB: 0 };
        }
    }

    /**
     * 记录监控数据
     */
    logMemoryUsage() {
        const timestamp = new Date().toISOString();
        const systemMem = this.getSystemMemory();
        const nodeMem = this.getNodeProcessMemory();
        const uptime = Math.round((Date.now() - this.startTime) / 1000 / 60); // 运行时间（分钟）
        
        const logEntry = {
            timestamp,
            uptime: `${uptime}分钟`,
            system: systemMem,
            nodeProcesses: nodeMem
        };
        
        // 输出到控制台
        console.log(`\n=== 内存监控报告 (${timestamp}) ===`);
        if (systemMem) {
            console.log(`系统内存: ${systemMem.used}MB/${systemMem.total}MB (${systemMem.usagePercent}%)`);
            console.log(`可用内存: ${systemMem.available}MB`);
        }
        console.log(`Node.js进程: ${nodeMem.processCount}个进程，总计${nodeMem.totalMemoryMB}MB`);
        if (nodeMem.processCount > 0) {
            console.log(`平均每进程: ${nodeMem.averageMemoryMB}MB`);
        }
        console.log(`运行时间: ${uptime}分钟`);
        
        // 写入日志文件
        const logLine = JSON.stringify(logEntry) + '\n';
        fs.appendFileSync(this.logFile, logLine);
        
        // 内存使用警告
        if (systemMem && systemMem.usagePercent > 80) {
            console.log('⚠️  警告: 系统内存使用率超过80%');
        }
        
        if (nodeMem.totalMemoryMB > 500) {
            console.log('⚠️  警告: Node.js进程内存使用超过500MB');
        }
    }

    /**
     * 开始监控
     */
    start() {
        console.log('开始内存监控...');
        console.log(`监控间隔: ${this.interval / 1000}秒`);
        console.log(`日志文件: ${this.logFile}`);
        console.log('按 Ctrl+C 停止监控');
        
        // 立即执行一次
        this.logMemoryUsage();
        
        // 设置定时监控
        this.monitorTimer = setInterval(() => {
            this.logMemoryUsage();
        }, this.interval);
        
        // 处理退出信号
        process.on('SIGINT', () => {
            this.stop();
        });
        
        process.on('SIGTERM', () => {
            this.stop();
        });
    }

    /**
     * 停止监控
     */
    stop() {
        if (this.monitorTimer) {
            clearInterval(this.monitorTimer);
            this.monitorTimer = null;
        }
        
        console.log('\n内存监控已停止');
        this.generateSummary();
        process.exit(0);
    }

    /**
     * 生成监控摘要
     */
    generateSummary() {
        try {
            if (!fs.existsSync(this.logFile)) {
                console.log('没有监控数据');
                return;
            }
            
            const logContent = fs.readFileSync(this.logFile, 'utf8');
            const logs = logContent.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
            
            if (logs.length === 0) {
                console.log('没有有效的监控数据');
                return;
            }
            
            const systemMemUsages = logs
                .filter(log => log.system)
                .map(log => log.system.usagePercent);
            
            const nodeMemUsages = logs
                .map(log => log.nodeProcesses.totalMemoryMB);
            
            console.log('\n=== 监控摘要 ===');
            console.log(`监控时长: ${logs[logs.length - 1].uptime}`);
            console.log(`数据点数: ${logs.length}`);
            
            if (systemMemUsages.length > 0) {
                const avgSystemMem = Math.round(systemMemUsages.reduce((a, b) => a + b, 0) / systemMemUsages.length);
                const maxSystemMem = Math.max(...systemMemUsages);
                const minSystemMem = Math.min(...systemMemUsages);
                
                console.log(`系统内存使用率: 平均${avgSystemMem}%, 最高${maxSystemMem}%, 最低${minSystemMem}%`);
            }
            
            if (nodeMemUsages.length > 0) {
                const avgNodeMem = Math.round(nodeMemUsages.reduce((a, b) => a + b, 0) / nodeMemUsages.length);
                const maxNodeMem = Math.max(...nodeMemUsages);
                const minNodeMem = Math.min(...nodeMemUsages);
                
                console.log(`Node.js内存使用: 平均${avgNodeMem}MB, 最高${maxNodeMem}MB, 最低${minNodeMem}MB`);
            }
            
        } catch (error) {
            console.error('生成监控摘要失败:', error.message);
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const monitor = new MemoryMonitor();
    monitor.start();
}

module.exports = MemoryMonitor;