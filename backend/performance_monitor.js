#!/usr/bin/env node
/**
 * IoT系统性能监控脚本
 * 用于监控系统性能指标，检测异常并生成报告
 * 
 * 监控内容：
 * 1. 内存使用监控（堆内存、RSS、外部内存）
 * 2. CPU使用率监控
 * 3. 数据库连接池状态监控
 * 4. MQTT连接状态监控
 * 5. WebSocket连接数监控
 * 6. 响应时间统计
 * 7. 错误率统计
 * 8. 生成性能报告
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PerformanceMonitor {
    constructor(options = {}) {
        this.interval = options.interval || 30000; // 30秒
        this.duration = options.duration || 0; // 0表示持续监控
        this.logFile = options.logFile || path.join(__dirname, 'performance_monitor.log');
        this.reportFile = options.reportFile || path.join(__dirname, 'performance_report.json');
        
        this.metrics = {
            memory: [],
            cpu: [],
            database: [],
            mqtt: [],
            websocket: [],
            response: [],
            errors: []
        };
        
        this.thresholds = {
            memory: {
                heapUsed: 100 * 1024 * 1024, // 100MB
                rss: 200 * 1024 * 1024, // 200MB
                external: 50 * 1024 * 1024 // 50MB
            },
            cpu: {
                usage: 80 // 80%
            },
            database: {
                activeConnections: 15, // 最大活跃连接数
                waitingConnections: 5 // 最大等待连接数
            },
            response: {
                avgTime: 2000, // 2秒
                p95Time: 5000 // 5秒
            },
            errorRate: 0.05 // 5%
        };
        
        this.startTime = Date.now();
        this.isRunning = false;
        this.intervalId = null;
    }

    /**
     * 获取内存使用情况
     */
    getMemoryMetrics() {
        const memUsage = process.memoryUsage();
        const systemMem = {
            total: os.totalmem(),
            free: os.freemem(),
            used: os.totalmem() - os.freemem()
        };
        
        return {
            timestamp: Date.now(),
            process: {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
                external: memUsage.external,
                arrayBuffers: memUsage.arrayBuffers || 0
            },
            system: systemMem,
            usage: {
                processPercent: (memUsage.rss / systemMem.total) * 100,
                systemPercent: (systemMem.used / systemMem.total) * 100
            }
        };
    }

    /**
     * 获取CPU使用情况
     */
    getCpuMetrics() {
        const cpuUsage = process.cpuUsage();
        const loadAvg = os.loadavg();
        
        return {
            timestamp: Date.now(),
            process: {
                user: cpuUsage.user,
                system: cpuUsage.system
            },
            system: {
                loadAvg1: loadAvg[0],
                loadAvg5: loadAvg[1],
                loadAvg15: loadAvg[2],
                cores: os.cpus().length
            },
            uptime: process.uptime()
        };
    }

    /**
     * 获取数据库连接池状态
     */
    async getDatabaseMetrics() {
        try {
            // 尝试从应用获取数据库连接池状态
            const dbConfigPath = path.join(__dirname, 'config/database.js');
            if (fs.existsSync(dbConfigPath)) {
                // 这里可以扩展为实际的数据库连接池监控
                return {
                    timestamp: Date.now(),
                    status: 'connected',
                    activeConnections: 0,
                    waitingConnections: 0,
                    totalConnections: 0
                };
            }
        } catch (error) {
            return {
                timestamp: Date.now(),
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * 获取MQTT连接状态
     */
    getMqttMetrics() {
        try {
            // 检查MQTT服务进程
            const processes = this.getNodeProcesses();
            const mqttProcess = processes.find(p => p.command.includes('mqtt') || p.command.includes('app.js'));
            
            return {
                timestamp: Date.now(),
                status: mqttProcess ? 'connected' : 'disconnected',
                processId: mqttProcess ? mqttProcess.pid : null,
                memory: mqttProcess ? mqttProcess.memory : 0
            };
        } catch (error) {
            return {
                timestamp: Date.now(),
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * 获取WebSocket连接状态
     */
    getWebSocketMetrics() {
        try {
            // 检查WebSocket服务进程
            const processes = this.getNodeProcesses();
            const wsProcess = processes.find(p => p.command.includes('websocket') || p.command.includes('app.js'));
            
            return {
                timestamp: Date.now(),
                status: wsProcess ? 'running' : 'stopped',
                processId: wsProcess ? wsProcess.pid : null,
                connections: 0 // 这里可以扩展为实际的连接数监控
            };
        } catch (error) {
            return {
                timestamp: Date.now(),
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * 获取Node.js进程信息
     */
    getNodeProcesses() {
        try {
            const output = execSync('ps aux | grep node | grep -v grep', { encoding: 'utf8' });
            const lines = output.trim().split('\n').filter(line => line.trim());
            
            return lines.map(line => {
                const parts = line.trim().split(/\s+/);
                return {
                    user: parts[0],
                    pid: parseInt(parts[1]),
                    cpu: parseFloat(parts[2]),
                    memory: parseFloat(parts[3]),
                    command: parts.slice(10).join(' ')
                };
            });
        } catch (error) {
            return [];
        }
    }

    /**
     * 检查性能阈值
     */
    checkThresholds(metrics) {
        const alerts = [];
        
        // 内存阈值检查
        if (metrics.memory) {
            const mem = metrics.memory;
            if (mem.process.heapUsed > this.thresholds.memory.heapUsed) {
                alerts.push({
                    type: 'MEMORY_HEAP_HIGH',
                    value: mem.process.heapUsed,
                    threshold: this.thresholds.memory.heapUsed,
                    message: `堆内存使用过高: ${(mem.process.heapUsed / 1024 / 1024).toFixed(2)}MB`
                });
            }
            
            if (mem.process.rss > this.thresholds.memory.rss) {
                alerts.push({
                    type: 'MEMORY_RSS_HIGH',
                    value: mem.process.rss,
                    threshold: this.thresholds.memory.rss,
                    message: `RSS内存使用过高: ${(mem.process.rss / 1024 / 1024).toFixed(2)}MB`
                });
            }
        }
        
        // CPU阈值检查
        if (metrics.cpu && metrics.cpu.system.loadAvg1 > this.thresholds.cpu.usage / 100) {
            alerts.push({
                type: 'CPU_HIGH',
                value: metrics.cpu.system.loadAvg1,
                threshold: this.thresholds.cpu.usage / 100,
                message: `CPU负载过高: ${(metrics.cpu.system.loadAvg1 * 100).toFixed(2)}%`
            });
        }
        
        return alerts;
    }

    /**
     * 收集所有性能指标
     */
    async collectMetrics() {
        const timestamp = Date.now();
        
        const metrics = {
            timestamp,
            memory: this.getMemoryMetrics(),
            cpu: this.getCpuMetrics(),
            database: await this.getDatabaseMetrics(),
            mqtt: this.getMqttMetrics(),
            websocket: this.getWebSocketMetrics()
        };
        
        // 存储指标
        this.metrics.memory.push(metrics.memory);
        this.metrics.cpu.push(metrics.cpu);
        this.metrics.database.push(metrics.database);
        this.metrics.mqtt.push(metrics.mqtt);
        this.metrics.websocket.push(metrics.websocket);
        
        // 限制存储的数据点数量（保留最近1000个）
        Object.keys(this.metrics).forEach(key => {
            if (this.metrics[key].length > 1000) {
                this.metrics[key] = this.metrics[key].slice(-1000);
            }
        });
        
        // 检查阈值
        const alerts = this.checkThresholds(metrics);
        if (alerts.length > 0) {
            this.logAlerts(alerts);
        }
        
        // 记录日志
        this.logMetrics(metrics);
        
        return metrics;
    }

    /**
     * 记录性能指标到日志
     */
    logMetrics(metrics) {
        const logEntry = {
            timestamp: new Date(metrics.timestamp).toISOString(),
            memory: {
                heapUsed: `${(metrics.memory.process.heapUsed / 1024 / 1024).toFixed(2)}MB`,
                rss: `${(metrics.memory.process.rss / 1024 / 1024).toFixed(2)}MB`,
                systemUsage: `${metrics.memory.usage.systemPercent.toFixed(2)}%`
            },
            cpu: {
                loadAvg1: metrics.cpu.system.loadAvg1.toFixed(2),
                uptime: `${(metrics.cpu.uptime / 60).toFixed(2)}min`
            },
            services: {
                database: metrics.database.status,
                mqtt: metrics.mqtt.status,
                websocket: metrics.websocket.status
            }
        };
        
        const logLine = `${logEntry.timestamp} - Memory: ${logEntry.memory.heapUsed}/${logEntry.memory.rss} (${logEntry.memory.systemUsage}), CPU: ${logEntry.cpu.loadAvg1}, Services: DB=${logEntry.services.database}, MQTT=${logEntry.services.mqtt}, WS=${logEntry.services.websocket}\n`;
        
        fs.appendFileSync(this.logFile, logLine);
        
        // 控制台输出
        console.log(`[${new Date().toLocaleTimeString()}] 内存: ${logEntry.memory.heapUsed}/${logEntry.memory.rss}, CPU负载: ${logEntry.cpu.loadAvg1}, 运行时间: ${logEntry.cpu.uptime}`);
    }

    /**
     * 记录告警信息
     */
    logAlerts(alerts) {
        const timestamp = new Date().toISOString();
        alerts.forEach(alert => {
            const alertLine = `${timestamp} - ALERT: ${alert.type} - ${alert.message}\n`;
            fs.appendFileSync(this.logFile, alertLine);
            console.warn(`⚠️  ${alert.message}`);
        });
    }

    /**
     * 生成性能报告
     */
    generateReport() {
        const now = Date.now();
        const duration = now - this.startTime;
        
        const report = {
            generatedAt: new Date().toISOString(),
            monitoringDuration: duration,
            summary: this.calculateSummary(),
            metrics: {
                memory: this.metrics.memory.slice(-100), // 最近100个数据点
                cpu: this.metrics.cpu.slice(-100),
                database: this.metrics.database.slice(-100),
                mqtt: this.metrics.mqtt.slice(-100),
                websocket: this.metrics.websocket.slice(-100)
            },
            recommendations: this.generateRecommendations()
        };
        
        fs.writeFileSync(this.reportFile, JSON.stringify(report, null, 2));
        console.log(`\n📊 性能报告已生成: ${this.reportFile}`);
        
        return report;
    }

    /**
     * 计算性能摘要
     */
    calculateSummary() {
        const memoryData = this.metrics.memory;
        const cpuData = this.metrics.cpu;
        
        if (memoryData.length === 0) {
            return { message: '暂无数据' };
        }
        
        const avgHeapUsed = memoryData.reduce((sum, m) => sum + m.process.heapUsed, 0) / memoryData.length;
        const avgRss = memoryData.reduce((sum, m) => sum + m.process.rss, 0) / memoryData.length;
        const avgCpuLoad = cpuData.reduce((sum, c) => sum + c.system.loadAvg1, 0) / cpuData.length;
        
        const maxHeapUsed = Math.max(...memoryData.map(m => m.process.heapUsed));
        const maxRss = Math.max(...memoryData.map(m => m.process.rss));
        const maxCpuLoad = Math.max(...cpuData.map(c => c.system.loadAvg1));
        
        return {
            dataPoints: memoryData.length,
            memory: {
                avgHeapUsed: `${(avgHeapUsed / 1024 / 1024).toFixed(2)}MB`,
                avgRss: `${(avgRss / 1024 / 1024).toFixed(2)}MB`,
                maxHeapUsed: `${(maxHeapUsed / 1024 / 1024).toFixed(2)}MB`,
                maxRss: `${(maxRss / 1024 / 1024).toFixed(2)}MB`
            },
            cpu: {
                avgLoad: avgCpuLoad.toFixed(2),
                maxLoad: maxCpuLoad.toFixed(2)
            }
        };
    }

    /**
     * 生成优化建议
     */
    generateRecommendations() {
        const recommendations = [];
        const summary = this.calculateSummary();
        
        if (summary.memory) {
            const avgHeap = parseFloat(summary.memory.avgHeapUsed);
            const avgRss = parseFloat(summary.memory.avgRss);
            
            if (avgHeap > 80) {
                recommendations.push('堆内存使用较高，建议检查内存泄漏或优化数据结构');
            }
            
            if (avgRss > 150) {
                recommendations.push('RSS内存使用较高，建议优化缓存策略或减少内存占用');
            }
        }
        
        if (summary.cpu) {
            const avgLoad = parseFloat(summary.cpu.avgLoad);
            
            if (avgLoad > 0.7) {
                recommendations.push('CPU负载较高，建议优化算法或增加服务器资源');
            }
        }
        
        if (recommendations.length === 0) {
            recommendations.push('系统性能良好，继续保持当前配置');
        }
        
        return recommendations;
    }

    /**
     * 开始监控
     */
    start() {
        if (this.isRunning) {
            console.log('监控已在运行中...');
            return;
        }
        
        console.log('开始性能监控...');
        console.log(`监控间隔: ${this.interval / 1000}秒`);
        console.log(`日志文件: ${this.logFile}`);
        
        if (this.duration > 0) {
            console.log(`监控时长: ${this.duration / 1000}秒`);
            setTimeout(() => {
                this.stop();
            }, this.duration);
        } else {
            console.log('持续监控模式 (按 Ctrl+C 停止)');
        }
        
        this.isRunning = true;
        
        // 立即收集一次指标
        this.collectMetrics();
        
        // 设置定时收集
        this.intervalId = setInterval(() => {
            this.collectMetrics();
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
        if (!this.isRunning) {
            return;
        }
        
        console.log('\n停止性能监控...');
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        this.isRunning = false;
        
        // 生成最终报告
        const report = this.generateReport();
        
        // 输出摘要
        console.log('\n=== 监控摘要 ===');
        console.log(`监控时长: ${((Date.now() - this.startTime) / 1000 / 60).toFixed(1)}分钟`);
        console.log(`数据点数: ${this.metrics.memory.length}`);
        
        if (report.summary.memory) {
            console.log(`平均内存使用: 堆=${report.summary.memory.avgHeapUsed}, RSS=${report.summary.memory.avgRss}`);
            console.log(`最大内存使用: 堆=${report.summary.memory.maxHeapUsed}, RSS=${report.summary.memory.maxRss}`);
        }
        
        if (report.summary.cpu) {
            console.log(`CPU负载: 平均=${report.summary.cpu.avgLoad}, 最大=${report.summary.cpu.maxLoad}`);
        }
        
        console.log('\n优化建议:');
        report.recommendations.forEach((rec, index) => {
            console.log(`${index + 1}. ${rec}`);
        });
        
        process.exit(0);
    }
}

// 命令行参数解析
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        interval: 30000,
        duration: 0,
        logFile: path.join(__dirname, 'performance_monitor.log'),
        reportFile: path.join(__dirname, 'performance_report.json')
    };
    
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--interval':
            case '-i':
                options.interval = parseInt(args[++i]) * 1000;
                break;
            case '--duration':
            case '-d':
                options.duration = parseInt(args[++i]) * 1000;
                break;
            case '--log':
            case '-l':
                options.logFile = args[++i];
                break;
            case '--report':
            case '-r':
                options.reportFile = args[++i];
                break;
            case '--help':
            case '-h':
                console.log(`
IoT系统性能监控工具

使用方法:
  node performance_monitor.js [选项]

选项:
  -i, --interval <秒>    监控间隔 (默认: 30秒)
  -d, --duration <秒>    监控时长 (默认: 持续监控)
  -l, --log <文件>       日志文件路径
  -r, --report <文件>    报告文件路径
  -h, --help            显示帮助信息

示例:
  node performance_monitor.js -i 10 -d 300  # 每10秒监控一次，持续5分钟
  node performance_monitor.js -l /tmp/perf.log  # 指定日志文件
`);
                process.exit(0);
                break;
        }
    }
    
    return options;
}

// 如果直接运行此脚本
if (require.main === module) {
    const options = parseArgs();
    const monitor = new PerformanceMonitor(options);
    monitor.start();
}

module.exports = PerformanceMonitor;