#!/usr/bin/env node

/**
 * CRC状态监控脚本
 */

const fs = require('fs');
const path = require('path');

class CRCStatusMonitor {
  constructor() {
    this.logPath = path.join(__dirname, '../backend/logs/app.log');
    this.monitorInterval = 60000; // 1分钟检查一次
  }

  start() {
    console.log('CRC状态监控启动...');
    console.log('按 Ctrl+C 停止监控\n');
    
    this.monitor();
    setInterval(() => this.monitor(), this.monitorInterval);
  }

  monitor() {
    try {
      const stats = this.analyzeCRCStatus();
      
      console.log(`\n[${new Date().toLocaleString()}] CRC状态报告:`);
      console.log(`- 最近5分钟CRC错误: ${stats.recentErrors}`);
      console.log(`- 手动解析成功: ${stats.manualParseSuccess}`);
      console.log(`- 数据恢复率: ${(stats.recoveryRate * 100).toFixed(1)}%`);
      console.log(`- 系统状态: ${stats.systemStatus}`);
      
      if (stats.recentErrors > 10) {
        console.log('⚠️  警告: CRC错误率较高，建议检查设备连接');
      } else if (stats.recentErrors === 0) {
        console.log('✅ 系统运行正常，无CRC错误');
      }
      
    } catch (error) {
      console.error('监控CRC状态失败:', error);
    }
  }

  analyzeCRCStatus() {
    if (!fs.existsSync(this.logPath)) {
      return {
        recentErrors: 0,
        manualParseSuccess: 0,
        recoveryRate: 0,
        systemStatus: '无日志文件'
      };
    }

    const logContent = fs.readFileSync(this.logPath, 'utf8');
    const lines = logContent.split('\n');
    
    // 分析最近5分钟的日志
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentLines = lines.filter(line => {
      const timeMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
      if (!timeMatch) return false;
      
      const logTime = new Date(timeMatch[1]);
      return logTime > fiveMinutesAgo;
    });
    
    const crcErrors = recentLines.filter(line => line.includes('CRC校验失败')).length;
    const manualSuccess = recentLines.filter(line => line.includes('传统手动解析RTU响应成功')).length;
    
    const recoveryRate = crcErrors > 0 ? manualSuccess / crcErrors : 1;
    
    let systemStatus = '正常';
    if (crcErrors > 15) {
      systemStatus = '异常';
    } else if (crcErrors > 5) {
      systemStatus = '警告';
    }
    
    return {
      recentErrors: crcErrors,
      manualParseSuccess: manualSuccess,
      recoveryRate,
      systemStatus
    };
  }
}

if (require.main === module) {
  const monitor = new CRCStatusMonitor();
  monitor.start();
}

module.exports = CRCStatusMonitor;
