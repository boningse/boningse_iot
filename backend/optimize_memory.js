#!/usr/bin/env node
/**
 * 内存优化脚本
 * 用于优化IoT系统的内存使用，提高系统稳定性和运行效率
 * 
 * 优化内容：
 * 1. 数据库连接池配置优化
 * 2. MQTT服务内存优化
 * 3. 日志配置优化
 * 4. WebSocket连接管理优化
 * 5. 定时任务查询优化
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class MemoryOptimizer {
    constructor() {
        this.backupDir = path.join(__dirname, 'config_backups');
        this.optimizations = [];
        this.errors = [];
    }

    /**
     * 创建备份目录
     */
    createBackupDir() {
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
            console.log(`✓ 创建备份目录: ${this.backupDir}`);
        }
    }

    /**
     * 备份文件
     */
    backupFile(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                console.log(`⚠ 文件不存在，跳过备份: ${filePath}`);
                return false;
            }

            const fileName = path.basename(filePath);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(this.backupDir, `${fileName}.${timestamp}.backup`);
            
            fs.copyFileSync(filePath, backupPath);
            console.log(`✓ 备份文件: ${fileName} -> ${path.basename(backupPath)}`);
            return true;
        } catch (error) {
            console.error(`✗ 备份文件失败: ${filePath}`, error.message);
            this.errors.push(`备份失败: ${filePath} - ${error.message}`);
            return false;
        }
    }

    /**
     * 优化数据库连接池配置
     */
    optimizeDatabasePool() {
        console.log('\n=== 优化数据库连接池配置 ===');
        
        const configFiles = [
            path.join(__dirname, 'config/database.js'),
            path.join(__dirname, 'config/database-pool.js')
        ];

        configFiles.forEach(configPath => {
            if (!fs.existsSync(configPath)) {
                console.log(`⚠ 配置文件不存在: ${configPath}`);
                return;
            }

            this.backupFile(configPath);
            
            try {
                let content = fs.readFileSync(configPath, 'utf8');
                let modified = false;

                // 优化开发环境连接池配置
                if (content.includes('development')) {
                    // 降低最大连接数
                    content = content.replace(
                        /(development[\s\S]*?pool[\s\S]*?max:\s*)(\d+)/,
                        (match, prefix, value) => {
                            if (parseInt(value) > 20) {
                                modified = true;
                                return prefix + '20';
                            }
                            return match;
                        }
                    );

                    // 降低最小连接数
                    content = content.replace(
                        /(development[\s\S]*?pool[\s\S]*?min:\s*)(\d+)/,
                        (match, prefix, value) => {
                            if (parseInt(value) > 5) {
                                modified = true;
                                return prefix + '5';
                            }
                            return match;
                        }
                    );

                    // 添加连接空闲超时
                    if (!content.includes('idle:') && content.includes('pool:')) {
                        content = content.replace(
                            /(pool:\s*{[^}]*)(})/,
                            '$1,\n        idle: 10000,\n        evict: 1000$2'
                        );
                        modified = true;
                    }
                }

                // 优化生产环境连接池（如果配置过高）
                if (content.includes('production')) {
                    content = content.replace(
                        /(production[\s\S]*?pool[\s\S]*?max:\s*)(\d+)/,
                        (match, prefix, value) => {
                            if (parseInt(value) > 50) {
                                modified = true;
                                return prefix + '50';
                            }
                            return match;
                        }
                    );
                }

                if (modified) {
                    fs.writeFileSync(configPath, content);
                    console.log(`✓ 优化数据库连接池配置: ${path.basename(configPath)}`);
                    this.optimizations.push(`数据库连接池配置优化: ${path.basename(configPath)}`);
                } else {
                    console.log(`- 数据库连接池配置已是最优: ${path.basename(configPath)}`);
                }
            } catch (error) {
                console.error(`✗ 优化数据库配置失败: ${configPath}`, error.message);
                this.errors.push(`数据库配置优化失败: ${configPath} - ${error.message}`);
            }
        });
    }

    /**
     * 优化MQTT服务内存使用
     */
    optimizeMqttService() {
        console.log('\n=== 优化MQTT服务内存使用 ===');
        
        const mqttServicePath = path.join(__dirname, 'services/mqttService.js');
        
        if (!fs.existsSync(mqttServicePath)) {
            console.log(`⚠ MQTT服务文件不存在: ${mqttServicePath}`);
            return;
        }

        this.backupFile(mqttServicePath);
        
        try {
            let content = fs.readFileSync(mqttServicePath, 'utf8');
            let modified = false;

            // 优化设备缓存过期时间（从5分钟减少到2分钟）
            content = content.replace(
                /(DEVICE_CACHE_EXPIRE_TIME\s*=\s*)(\d+)(\s*\*\s*60\s*\*\s*1000)/,
                (match, prefix, minutes, suffix) => {
                    if (parseInt(minutes) > 2) {
                        modified = true;
                        return prefix + '2' + suffix;
                    }
                    return match;
                }
            );

            // 优化缓存清理间隔（从5分钟减少到2分钟）
            content = content.replace(
                /(setInterval\([^,]+,\s*)(\d+)(\s*\*\s*60\s*\*\s*1000)/,
                (match, prefix, minutes, suffix) => {
                    if (parseInt(minutes) >= 5) {
                        modified = true;
                        return prefix + '2' + suffix;
                    }
                    return match;
                }
            );

            // 限制消息统计数据大小
            if (!content.includes('MAX_MESSAGE_STATS_SIZE')) {
                const statsDeclaration = `
// 限制消息统计数据大小，防止内存泄漏
const MAX_MESSAGE_STATS_SIZE = 1000;
const MAX_DEVICE_CACHE_SIZE = 500;
`;
                content = content.replace(
                    /(class MqttService {)/,
                    statsDeclaration + '$1'
                );
                modified = true;
            }

            // 添加消息统计大小检查
            if (!content.includes('checkMessageStatsSize')) {
                const checkStatsMethod = `
    /**
     * 检查并限制消息统计数据大小
     */
    checkMessageStatsSize() {
        const statsKeys = Object.keys(this.messageStats);
        if (statsKeys.length > MAX_MESSAGE_STATS_SIZE) {
            // 删除最旧的统计数据
            const sortedKeys = statsKeys.sort();
            const keysToDelete = sortedKeys.slice(0, statsKeys.length - MAX_MESSAGE_STATS_SIZE);
            keysToDelete.forEach(key => {
                delete this.messageStats[key];
            });
            logger.info('清理过多的消息统计数据', { deletedCount: keysToDelete.length });
        }

        // 检查设备缓存大小
        if (this.deviceCache.size > MAX_DEVICE_CACHE_SIZE) {
            const entries = Array.from(this.deviceCache.entries());
            const sortedEntries = entries.sort((a, b) => a[1].lastSeen - b[1].lastSeen);
            const entriesToDelete = sortedEntries.slice(0, this.deviceCache.size - MAX_DEVICE_CACHE_SIZE);
            entriesToDelete.forEach(([key]) => {
                this.deviceCache.delete(key);
            });
            logger.info('清理过多的设备缓存', { deletedCount: entriesToDelete.length });
        }
    }
`;
                content = content.replace(
                    /(cleanupStats\(\) {[\s\S]*?})/,
                    '$1' + checkStatsMethod
                );
                modified = true;
            }

            // 在消息处理中添加大小检查
            if (!content.includes('this.checkMessageStatsSize()')) {
                content = content.replace(
                    /(this\.messageStats\[dateKey\]\+\+;)/,
                    '$1\n        this.checkMessageStatsSize();'
                );
                modified = true;
            }

            if (modified) {
                fs.writeFileSync(mqttServicePath, content);
                console.log(`✓ 优化MQTT服务内存使用`);
                this.optimizations.push('MQTT服务内存优化');
            } else {
                console.log(`- MQTT服务内存配置已是最优`);
            }
        } catch (error) {
            console.error(`✗ 优化MQTT服务失败:`, error.message);
            this.errors.push(`MQTT服务优化失败: ${error.message}`);
        }
    }

    /**
     * 优化日志配置
     */
    optimizeLogging() {
        console.log('\n=== 优化日志配置 ===');
        
        const loggerPath = path.join(__dirname, 'utils/logger.js');
        
        if (!fs.existsSync(loggerPath)) {
            console.log(`⚠ 日志配置文件不存在: ${loggerPath}`);
            return;
        }

        this.backupFile(loggerPath);
        
        try {
            let content = fs.readFileSync(loggerPath, 'utf8');
            let modified = false;

            // 减少日志文件大小限制（从10MB到5MB）
            content = content.replace(
                /(maxsize:\s*)(\d+)(\s*\*\s*1024\s*\*\s*1024)/,
                (match, prefix, size, suffix) => {
                    if (parseInt(size) > 5) {
                        modified = true;
                        return prefix + '5' + suffix;
                    }
                    return match;
                }
            );

            // 减少保留文件数量
            content = content.replace(
                /(maxFiles:\s*)(\d+)/,
                (match, prefix, files) => {
                    if (parseInt(files) > 5) {
                        modified = true;
                        return prefix + '5';
                    }
                    return match;
                }
            );

            // 添加日志压缩
            if (!content.includes('zippedArchive: true')) {
                content = content.replace(
                    /(maxFiles:\s*\d+)/,
                    '$1,\n        zippedArchive: true'
                );
                modified = true;
            }

            if (modified) {
                fs.writeFileSync(loggerPath, content);
                console.log(`✓ 优化日志配置`);
                this.optimizations.push('日志配置优化');
            } else {
                console.log(`- 日志配置已是最优`);
            }
        } catch (error) {
            console.error(`✗ 优化日志配置失败:`, error.message);
            this.errors.push(`日志配置优化失败: ${error.message}`);
        }
    }

    /**
     * 优化WebSocket连接管理
     */
    optimizeWebSocket() {
        console.log('\n=== 优化WebSocket连接管理 ===');
        
        const wsServicePath = path.join(__dirname, 'services/websocketService.js');
        
        if (!fs.existsSync(wsServicePath)) {
            console.log(`⚠ WebSocket服务文件不存在: ${wsServicePath}`);
            return;
        }

        this.backupFile(wsServicePath);
        
        try {
            let content = fs.readFileSync(wsServicePath, 'utf8');
            let modified = false;

            // 添加连接数限制
            if (!content.includes('MAX_CONNECTIONS')) {
                const connectionLimitCode = `
// WebSocket连接限制，防止内存泄漏
const MAX_CONNECTIONS = 100;
const HEARTBEAT_INTERVAL = 60000; // 60秒心跳间隔
`;
                content = content.replace(
                    /(class WebSocketService {)/,
                    connectionLimitCode + '$1'
                );
                modified = true;
            }

            // 添加连接数检查
            if (!content.includes('checkConnectionLimit')) {
                const connectionCheckMethod = `
    /**
     * 检查连接数限制
     */
    checkConnectionLimit() {
        if (this.clients.size >= MAX_CONNECTIONS) {
            // 关闭最旧的连接
            const oldestClient = Array.from(this.clients.values())
                .sort((a, b) => a.connectedAt - b.connectedAt)[0];
            if (oldestClient) {
                oldestClient.ws.close(1000, 'Connection limit exceeded');
                logger.warn('达到连接数限制，关闭最旧连接', { 
                    totalConnections: this.clients.size,
                    maxConnections: MAX_CONNECTIONS 
                });
            }
        }
    }
`;
                content = content.replace(
                    /(handleConnection\(ws, req\) {)/,
                    connectionCheckMethod + '\n    $1'
                );
                modified = true;
            }

            // 在连接处理中添加限制检查
            if (!content.includes('this.checkConnectionLimit()')) {
                content = content.replace(
                    /(handleConnection\(ws, req\) {[\s\S]*?)(this\.clients\.set)/,
                    '$1this.checkConnectionLimit();\n        $2'
                );
                modified = true;
            }

            // 优化心跳间隔
            content = content.replace(
                /(setInterval\([^,]+,\s*)(\d+)(\s*\))/,
                (match, prefix, interval, suffix) => {
                    if (parseInt(interval) < 60000) {
                        modified = true;
                        return prefix + 'HEARTBEAT_INTERVAL' + suffix;
                    }
                    return match;
                }
            );

            if (modified) {
                fs.writeFileSync(wsServicePath, content);
                console.log(`✓ 优化WebSocket连接管理`);
                this.optimizations.push('WebSocket连接管理优化');
            } else {
                console.log(`- WebSocket连接管理已是最优`);
            }
        } catch (error) {
            console.error(`✗ 优化WebSocket服务失败:`, error.message);
            this.errors.push(`WebSocket服务优化失败: ${error.message}`);
        }
    }

    /**
     * 优化定时任务查询
     */
    optimizeScheduler() {
        console.log('\n=== 优化定时任务查询 ===');
        
        const schedulerPath = path.join(__dirname, 'services/schedulerService.js');
        
        if (!fs.existsSync(schedulerPath)) {
            console.log(`⚠ 定时任务服务文件不存在: ${schedulerPath}`);
            return;
        }

        this.backupFile(schedulerPath);
        
        try {
            let content = fs.readFileSync(schedulerPath, 'utf8');
            let modified = false;

            // 优化查询语句，添加LIMIT限制
            content = content.replace(
                /(SELECT[\s\S]*?FROM\s+thermostat_schedules[\s\S]*?WHERE[\s\S]*?)(;)/,
                (match, query, semicolon) => {
                    if (!query.includes('LIMIT')) {
                        modified = true;
                        return query + ' LIMIT 100' + semicolon;
                    }
                    return match;
                }
            );

            // 添加查询结果缓存
            if (!content.includes('queryCache')) {
                const cacheCode = `
// 查询结果缓存，减少数据库查询
const queryCache = new Map();
const CACHE_TTL = 60000; // 1分钟缓存
`;
                content = content.replace(
                    /(class SchedulerService {)/,
                    cacheCode + '$1'
                );
                modified = true;
            }

            // 添加缓存清理
            if (!content.includes('clearExpiredCache')) {
                const cacheClearMethod = `
    /**
     * 清理过期缓存
     */
    clearExpiredCache() {
        const now = Date.now();
        for (const [key, value] of queryCache.entries()) {
            if (now - value.timestamp > CACHE_TTL) {
                queryCache.delete(key);
            }
        }
    }
`;
                content = content.replace(
                    /(checkAndExecuteThermostatSchedules\(\) {)/,
                    cacheClearMethod + '\n    $1'
                );
                modified = true;
            }

            if (modified) {
                fs.writeFileSync(schedulerPath, content);
                console.log(`✓ 优化定时任务查询`);
                this.optimizations.push('定时任务查询优化');
            } else {
                console.log(`- 定时任务查询已是最优`);
            }
        } catch (error) {
            console.error(`✗ 优化定时任务失败:`, error.message);
            this.errors.push(`定时任务优化失败: ${error.message}`);
        }
    }

    /**
     * 生成优化报告
     */
    generateReport() {
        console.log('\n=== 内存优化报告 ===');
        
        const reportPath = path.join(__dirname, 'memory_optimization_report.txt');
        const timestamp = new Date().toISOString();
        
        let report = `IoT系统内存优化报告\n`;
        report += `优化时间: ${timestamp}\n`;
        report += `备份目录: ${this.backupDir}\n\n`;
        
        if (this.optimizations.length > 0) {
            report += `成功优化项目 (${this.optimizations.length}项):\n`;
            this.optimizations.forEach((opt, index) => {
                report += `${index + 1}. ${opt}\n`;
            });
        } else {
            report += `所有配置已是最优状态，无需优化\n`;
        }
        
        if (this.errors.length > 0) {
            report += `\n优化失败项目 (${this.errors.length}项):\n`;
            this.errors.forEach((error, index) => {
                report += `${index + 1}. ${error}\n`;
            });
        }
        
        report += `\n建议的后续操作:\n`;
        report += `1. 重启应用服务以使配置生效\n`;
        report += `2. 监控内存使用情况\n`;
        report += `3. 定期运行此优化脚本\n`;
        report += `4. 如有问题，可从备份目录恢复原始配置\n`;
        
        fs.writeFileSync(reportPath, report);
        console.log(`\n✓ 优化报告已生成: ${reportPath}`);
        
        // 输出摘要
        console.log(`\n优化摘要:`);
        console.log(`- 成功优化: ${this.optimizations.length} 项`);
        console.log(`- 优化失败: ${this.errors.length} 项`);
        console.log(`- 配置备份: ${this.backupDir}`);
    }

    /**
     * 执行所有优化
     */
    async run() {
        console.log('开始IoT系统内存优化...');
        console.log('========================================');
        
        try {
            this.createBackupDir();
            this.optimizeDatabasePool();
            this.optimizeMqttService();
            this.optimizeLogging();
            this.optimizeWebSocket();
            this.optimizeScheduler();
            this.generateReport();
            
            console.log('\n========================================');
            console.log('✓ 内存优化完成！');
            
            if (this.optimizations.length > 0) {
                console.log('\n⚠ 请重启应用服务以使优化生效:');
                console.log('  npm restart 或 pm2 restart app');
            }
            
        } catch (error) {
            console.error('\n✗ 优化过程中发生错误:', error.message);
            process.exit(1);
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const optimizer = new MemoryOptimizer();
    optimizer.run().catch(console.error);
}

module.exports = MemoryOptimizer;