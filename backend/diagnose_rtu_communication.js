/**
 * RTU通信诊断脚本
 * 用于诊断电表RTU通信问题，特别是"电表不回复"的情况
 */

const fs = require('fs');
const path = require('path');

// 诊断配置
const DIAGNOSIS_CONFIG = {
  deviceId: '865661074511729',
  logFile: path.join(__dirname, 'logs/app.log'),
  timeWindow: 30, // 检查最近30分钟的日志
  expectedResponseInterval: 60 // 期望的响应间隔（秒）
};

/**
 * 解析日志时间戳
 */
function parseLogTimestamp(logLine) {
  const match = logLine.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  return match ? new Date(match[1]) : null;
}

/**
 * 检查RTU命令发送状态
 */
function checkRtuCommandSending() {
  console.log('\n=== 检查RTU命令发送状态 ===');
  
  try {
    const logContent = fs.readFileSync(DIAGNOSIS_CONFIG.logFile, 'utf8');
    const lines = logContent.split('\n');
    
    const now = new Date();
    const timeThreshold = new Date(now.getTime() - DIAGNOSIS_CONFIG.timeWindow * 60 * 1000);
    
    const recentCommands = [];
    
    for (const line of lines) {
      const timestamp = parseLogTimestamp(line);
      if (!timestamp || timestamp < timeThreshold) continue;
      
      if (line.includes('RTU命令已发布到MQTT') && line.includes(DIAGNOSIS_CONFIG.deviceId)) {
        const match = line.match(/"hexCommand":"([^"]+)"/);
        if (match) {
          recentCommands.push({
            time: timestamp,
            command: match[1],
            line: line
          });
        }
      }
    }
    
    console.log(`最近${DIAGNOSIS_CONFIG.timeWindow}分钟内发送的RTU命令数量: ${recentCommands.length}`);
    
    if (recentCommands.length > 0) {
      console.log('\n最近的命令:');
      recentCommands.slice(-5).forEach((cmd, index) => {
        console.log(`  ${index + 1}. ${cmd.time.toLocaleTimeString()} - ${cmd.command}`);
      });
      
      // 检查命令发送频率
      if (recentCommands.length >= 2) {
        const intervals = [];
        for (let i = 1; i < recentCommands.length; i++) {
          const interval = (recentCommands[i].time - recentCommands[i-1].time) / 1000;
          intervals.push(interval);
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        console.log(`\n平均发送间隔: ${avgInterval.toFixed(1)}秒`);
        
        if (avgInterval < 10) {
          console.log('⚠️  警告: 发送间隔过短，可能导致电表响应不及时');
        } else if (avgInterval > 60) {
          console.log('⚠️  警告: 发送间隔过长，可能影响数据实时性');
        } else {
          console.log('✅ 发送间隔正常');
        }
      }
    } else {
      console.log('❌ 最近没有发送RTU命令');
    }
    
    return recentCommands.length > 0;
    
  } catch (error) {
    console.error('检查RTU命令发送失败:', error.message);
    return false;
  }
}

/**
 * 检查电表响应状态
 */
function checkMeterResponse() {
  console.log('\n=== 检查电表响应状态 ===');
  
  try {
    const logContent = fs.readFileSync(DIAGNOSIS_CONFIG.logFile, 'utf8');
    const lines = logContent.split('\n');
    
    const now = new Date();
    const timeThreshold = new Date(now.getTime() - DIAGNOSIS_CONFIG.timeWindow * 60 * 1000);
    
    const responses = [];
    const crcErrors = [];
    
    for (const line of lines) {
      const timestamp = parseLogTimestamp(line);
      if (!timestamp || timestamp < timeThreshold) continue;
      
      if (line.includes('处理原始RTU响应数据')) {
        responses.push({
          time: timestamp,
          line: line
        });
      }
      
      if (line.includes('CRC校验失败')) {
        crcErrors.push({
          time: timestamp,
          line: line
        });
      }
    }
    
    console.log(`最近${DIAGNOSIS_CONFIG.timeWindow}分钟内收到的响应数量: ${responses.length}`);
    console.log(`CRC校验失败次数: ${crcErrors.length}`);
    
    if (responses.length > 0) {
      const lastResponse = responses[responses.length - 1];
      const timeSinceLastResponse = (now - lastResponse.time) / 1000 / 60;
      console.log(`\n最后一次响应时间: ${lastResponse.time.toLocaleString()}`);
      console.log(`距离现在: ${timeSinceLastResponse.toFixed(1)}分钟`);
      
      if (timeSinceLastResponse > 5) {
        console.log('❌ 电表响应中断，超过5分钟没有响应');
      } else {
        console.log('✅ 电表响应正常');
      }
    } else {
      console.log('❌ 最近没有收到电表响应');
    }
    
    if (crcErrors.length > 0) {
      const errorRate = (crcErrors.length / responses.length * 100).toFixed(1);
      console.log(`\n⚠️  CRC校验失败率: ${errorRate}%`);
      
      if (crcErrors.length > 0) {
        console.log('最近的CRC错误:');
        crcErrors.slice(-3).forEach((error, index) => {
          console.log(`  ${index + 1}. ${error.time.toLocaleTimeString()}`);
        });
      }
    }
    
    return {
      hasResponse: responses.length > 0,
      lastResponseTime: responses.length > 0 ? responses[responses.length - 1].time : null,
      crcErrorCount: crcErrors.length,
      responseCount: responses.length
    };
    
  } catch (error) {
    console.error('检查电表响应失败:', error.message);
    return null;
  }
}

/**
 * 检查MQTT连接状态
 */
function checkMqttConnection() {
  console.log('\n=== 检查MQTT连接状态 ===');
  
  try {
    const logContent = fs.readFileSync(DIAGNOSIS_CONFIG.logFile, 'utf8');
    const lines = logContent.split('\n');
    
    let lastConnection = null;
    let lastDisconnection = null;
    
    for (const line of lines) {
      const timestamp = parseLogTimestamp(line);
      if (!timestamp) continue;
      
      if (line.includes('MQTT连接成功') || line.includes('MQTT服务连接成功')) {
        lastConnection = timestamp;
      }
      
      if (line.includes('MQTT连接断开') || line.includes('MQTT断开连接')) {
        lastDisconnection = timestamp;
      }
    }
    
    if (lastConnection) {
      console.log(`最后连接时间: ${lastConnection.toLocaleString()}`);
      
      if (lastDisconnection && lastDisconnection > lastConnection) {
        console.log(`最后断开时间: ${lastDisconnection.toLocaleString()}`);
        console.log('❌ MQTT连接可能已断开');
        return false;
      } else {
        const timeSinceConnection = (new Date() - lastConnection) / 1000 / 60;
        console.log(`连接持续时间: ${timeSinceConnection.toFixed(1)}分钟`);
        console.log('✅ MQTT连接正常');
        return true;
      }
    } else {
      console.log('❌ 未找到MQTT连接记录');
      return false;
    }
    
  } catch (error) {
    console.error('检查MQTT连接失败:', error.message);
    return false;
  }
}

/**
 * 生成诊断建议
 */
function generateRecommendations(commandSending, responseStatus, mqttConnected) {
  console.log('\n=== 诊断建议 ===');
  
  const recommendations = [];
  
  if (!mqttConnected) {
    recommendations.push('🔴 优先级1: 检查MQTT连接，重启MQTT服务');
  }
  
  if (!commandSending) {
    recommendations.push('🔴 优先级1: 检查电表轮询服务，重启轮询');
  }
  
  if (responseStatus && !responseStatus.hasResponse) {
    recommendations.push('🔴 优先级1: 电表无响应，检查DTU设备和电表连接');
  }
  
  if (responseStatus && responseStatus.hasResponse) {
    const now = new Date();
    const timeSinceLastResponse = (now - responseStatus.lastResponseTime) / 1000 / 60;
    
    if (timeSinceLastResponse > 5) {
      recommendations.push('🟡 优先级2: 电表响应中断，检查设备状态');
    }
    
    if (responseStatus.crcErrorCount > 0) {
      const errorRate = (responseStatus.crcErrorCount / responseStatus.responseCount * 100);
      if (errorRate > 20) {
        recommendations.push('🟡 优先级2: CRC校验失败率过高，检查通信质量');
      }
    }
  }
  
  if (recommendations.length === 0) {
    recommendations.push('✅ 系统运行正常，如仍有问题请检查硬件连接');
  }
  
  recommendations.forEach((rec, index) => {
    console.log(`${index + 1}. ${rec}`);
  });
}

/**
 * 主诊断函数
 */
function runDiagnosis() {
  console.log('RTU通信诊断开始...');
  console.log(`目标设备: ${DIAGNOSIS_CONFIG.deviceId}`);
  console.log(`检查时间窗口: 最近${DIAGNOSIS_CONFIG.timeWindow}分钟`);
  console.log('=' * 50);
  
  const commandSending = checkRtuCommandSending();
  const responseStatus = checkMeterResponse();
  const mqttConnected = checkMqttConnection();
  
  generateRecommendations(commandSending, responseStatus, mqttConnected);
  
  console.log('\n=== 诊断完成 ===');
  console.log('如需更详细的分析，请查看: rtu_communication_analysis_report.md');
}

// 运行诊断
if (require.main === module) {
  runDiagnosis();
}

module.exports = {
  runDiagnosis,
  checkRtuCommandSending,
  checkMeterResponse,
  checkMqttConnection
};