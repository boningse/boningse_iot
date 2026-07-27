/**
 * 0xFD字节监控脚本
 * 实时监控MQTT数据中0xFD字节的出现情况和修复效果
 */

const fs = require('fs');
const path = require('path');
const { tail } = require('tail');

class FDByteMonitor {
  constructor() {
    this.stats = {
      totalMessages: 0,
      messagesWithFD: 0,
      fdBytesDetected: 0,
      crcFailures: 0,
      successfulFixes: 0,
      fixStrategies: {
        CRC_RECALCULATION: 0,
        ENCODING_FIX: 0,
        MANUAL_PARSING: 0
      },
      deviceStats: {},
      hourlyStats: {}
    };
    
    this.logFile = path.join(__dirname, 'logs/app.log');
    this.reportFile = path.join(__dirname, 'fd_monitoring_report.json');
    
    this.startTime = new Date();
    this.lastReportTime = new Date();
  }
  
  /**
   * 开始监控
   */
  startMonitoring() {
    console.log('开始监控0xFD字节问题...');
    console.log('日志文件:', this.logFile);
    console.log('报告文件:', this.reportFile);
    console.log('开始时间:', this.startTime.toISOString());
    console.log('=' .repeat(60));
    
    // 检查日志文件是否存在
    if (!fs.existsSync(this.logFile)) {
      console.error('日志文件不存在:', this.logFile);
      return;
    }
    
    // 创建tail实例监控日志文件
    const tailInstance = new tail.Tail(this.logFile);
    
    tailInstance.on('line', (line) => {
      this.processLogLine(line);
    });
    
    tailInstance.on('error', (error) => {
      console.error('监控日志文件时发生错误:', error);
    });
    
    // 定期生成报告
    setInterval(() => {
      this.generateReport();
    }, 60000); // 每分钟生成一次报告
    
    // 定期显示实时统计
    setInterval(() => {
      this.displayRealTimeStats();
    }, 10000); // 每10秒显示一次统计
    
    // 优雅退出处理
    process.on('SIGINT', () => {
      console.log('\n正在停止监控...');
      this.generateFinalReport();
      process.exit(0);
    });
  }
  
  /**
   * 处理日志行
   */
  processLogLine(line) {
    try {
      // 解析日志行
      const logMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\]: (.+) \| Meta: (.+)$/);
      if (!logMatch) return;
      
      const [, timestamp, level, message, metaStr] = logMatch;
      let meta;
      
      try {
        meta = JSON.parse(metaStr);
      } catch (e) {
        return; // 无法解析meta，跳过
      }
      
      const hour = new Date(timestamp).getHours();
      if (!this.stats.hourlyStats[hour]) {
        this.stats.hourlyStats[hour] = {
          messages: 0,
          fdDetections: 0,
          fixes: 0
        };
      }
      
      // 处理不同类型的日志
      if (message.includes('RTU响应数据转换为Buffer')) {
        this.stats.totalMessages++;
        this.stats.hourlyStats[hour].messages++;
        
        if (meta.fdByteCount && meta.fdByteCount > 0) {
          this.stats.messagesWithFD++;
          this.stats.fdBytesDetected += meta.fdByteCount;
          this.stats.hourlyStats[hour].fdDetections++;
          
          // 提取设备信息
          const deviceInfo = this.extractDeviceInfo(meta.hexString);
          if (deviceInfo) {
            this.updateDeviceStats(deviceInfo, meta.fdByteCount);
          }
        }
      }
      
      else if (message.includes('CRC校验失败')) {
        this.stats.crcFailures++;
      }
      
      else if (message.includes('数据编码修复成功')) {
        this.stats.successfulFixes++;
        this.stats.hourlyStats[hour].fixes++;
        
        if (meta.strategy) {
          this.stats.fixStrategies[meta.strategy] = 
            (this.stats.fixStrategies[meta.strategy] || 0) + 1;
        }
      }
      
    } catch (error) {
      // 忽略解析错误
    }
  }
  
  /**
   * 从十六进制字符串中提取设备信息
   */
  extractDeviceInfo(hexString) {
    if (!hexString) return null;
    
    const parts = hexString.split(' ');
    if (parts.length < 3) return null;
    
    return {
      slaveAddress: parseInt(parts[0], 16),
      functionCode: parseInt(parts[1], 16),
      dataLength: parseInt(parts[2], 16)
    };
  }
  
  /**
   * 更新设备统计信息
   */
  updateDeviceStats(deviceInfo, fdCount) {
    const key = `slave_${deviceInfo.slaveAddress}_fc_${deviceInfo.functionCode}`;
    
    if (!this.stats.deviceStats[key]) {
      this.stats.deviceStats[key] = {
        slaveAddress: deviceInfo.slaveAddress,
        functionCode: deviceInfo.functionCode,
        totalMessages: 0,
        messagesWithFD: 0,
        totalFDBytes: 0
      };
    }
    
    this.stats.deviceStats[key].totalMessages++;
    this.stats.deviceStats[key].messagesWithFD++;
    this.stats.deviceStats[key].totalFDBytes += fdCount;
  }
  
  /**
   * 显示实时统计
   */
  displayRealTimeStats() {
    const now = new Date();
    const runtime = Math.floor((now - this.startTime) / 1000);
    const fdRate = this.stats.totalMessages > 0 ? 
      (this.stats.messagesWithFD / this.stats.totalMessages * 100).toFixed(2) : '0.00';
    const fixRate = this.stats.crcFailures > 0 ? 
      (this.stats.successfulFixes / this.stats.crcFailures * 100).toFixed(2) : '0.00';
    
    console.clear();
    console.log('🔍 0xFD字节实时监控');
    console.log('=' .repeat(60));
    console.log(`运行时间: ${Math.floor(runtime/3600)}h ${Math.floor((runtime%3600)/60)}m ${runtime%60}s`);
    console.log(`当前时间: ${now.toLocaleString()}`);
    console.log('');
    
    console.log('📊 总体统计:');
    console.log(`  总消息数: ${this.stats.totalMessages}`);
    console.log(`  包含0xFD的消息: ${this.stats.messagesWithFD} (${fdRate}%)`);
    console.log(`  检测到的0xFD字节总数: ${this.stats.fdBytesDetected}`);
    console.log(`  CRC校验失败: ${this.stats.crcFailures}`);
    console.log(`  成功修复: ${this.stats.successfulFixes} (${fixRate}%)`);
    console.log('');
    
    console.log('🔧 修复策略统计:');
    Object.entries(this.stats.fixStrategies).forEach(([strategy, count]) => {
      if (count > 0) {
        console.log(`  ${strategy}: ${count}`);
      }
    });
    console.log('');
    
    // 显示最活跃的设备
    const topDevices = Object.values(this.stats.deviceStats)
      .sort((a, b) => b.messagesWithFD - a.messagesWithFD)
      .slice(0, 5);
    
    if (topDevices.length > 0) {
      console.log('📱 0xFD问题最多的设备:');
      topDevices.forEach((device, index) => {
        const rate = (device.messagesWithFD / device.totalMessages * 100).toFixed(1);
        console.log(`  ${index + 1}. 从站${device.slaveAddress} FC${device.functionCode}: ${device.messagesWithFD}/${device.totalMessages} (${rate}%)`);
      });
    }
    
    console.log('');
    console.log('按 Ctrl+C 停止监控并生成最终报告');
  }
  
  /**
   * 生成报告
   */
  generateReport() {
    const now = new Date();
    const report = {
      timestamp: now.toISOString(),
      monitoringPeriod: {
        start: this.startTime.toISOString(),
        end: now.toISOString(),
        durationSeconds: Math.floor((now - this.startTime) / 1000)
      },
      summary: this.stats,
      analysis: this.generateAnalysis()
    };
    
    try {
      fs.writeFileSync(this.reportFile, JSON.stringify(report, null, 2));
    } catch (error) {
      console.error('写入报告文件失败:', error);
    }
  }
  
  /**
   * 生成分析结果
   */
  generateAnalysis() {
    const analysis = {
      fdDetectionRate: 0,
      fixSuccessRate: 0,
      averageFDPerMessage: 0,
      peakHour: null,
      recommendations: []
    };
    
    // 计算检测率
    if (this.stats.totalMessages > 0) {
      analysis.fdDetectionRate = (this.stats.messagesWithFD / this.stats.totalMessages * 100);
    }
    
    // 计算修复成功率
    if (this.stats.crcFailures > 0) {
      analysis.fixSuccessRate = (this.stats.successfulFixes / this.stats.crcFailures * 100);
    }
    
    // 计算平均0xFD字节数
    if (this.stats.messagesWithFD > 0) {
      analysis.averageFDPerMessage = (this.stats.fdBytesDetected / this.stats.messagesWithFD);
    }
    
    // 找出问题最多的时段
    let maxFD = 0;
    Object.entries(this.stats.hourlyStats).forEach(([hour, stats]) => {
      if (stats.fdDetections > maxFD) {
        maxFD = stats.fdDetections;
        analysis.peakHour = parseInt(hour);
      }
    });
    
    // 生成建议
    if (analysis.fdDetectionRate > 10) {
      analysis.recommendations.push('0xFD检测率较高，建议检查MQTT客户端编码设置');
    }
    
    if (analysis.fixSuccessRate < 80) {
      analysis.recommendations.push('修复成功率较低，建议优化数据恢复算法');
    }
    
    if (analysis.averageFDPerMessage > 3) {
      analysis.recommendations.push('平均0xFD字节数较多，可能存在系统性编码问题');
    }
    
    return analysis;
  }
  
  /**
   * 生成最终报告
   */
  generateFinalReport() {
    this.generateReport();
    
    console.log('\n📋 最终监控报告');
    console.log('=' .repeat(60));
    
    const runtime = Math.floor((new Date() - this.startTime) / 1000);
    console.log(`监控时长: ${Math.floor(runtime/3600)}h ${Math.floor((runtime%3600)/60)}m ${runtime%60}s`);
    
    const analysis = this.generateAnalysis();
    console.log(`0xFD检测率: ${analysis.fdDetectionRate.toFixed(2)}%`);
    console.log(`修复成功率: ${analysis.fixSuccessRate.toFixed(2)}%`);
    console.log(`平均0xFD字节数: ${analysis.averageFDPerMessage.toFixed(2)}`);
    
    if (analysis.peakHour !== null) {
      console.log(`问题高峰时段: ${analysis.peakHour}:00`);
    }
    
    if (analysis.recommendations.length > 0) {
      console.log('\n建议:');
      analysis.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }
    
    console.log(`\n详细报告已保存到: ${this.reportFile}`);
  }
}

// 如果直接运行此文件，开始监控
if (require.main === module) {
  const monitor = new FDByteMonitor();
  monitor.startMonitoring();
}

module.exports = FDByteMonitor;