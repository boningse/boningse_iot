const WebSocket = require('ws');

// 模拟设备数据
const mockDeviceData = {
  '201房间温控器': {
    id: 1,
    device_id: '869861065075201',
    data: {
      body: {
        id: [1],
        data: [[1, 2, 1, 0, 220, 0, 170, 290, 235]], // runOn=1, runMode=2, runFanSpeed=1, runTemp=220, roomTemp=235
        items: ['runOn', 'runMode', 'runFanSpeed', 'runFanDirect', 'runTemp', 'remote', 'minSetTemp', 'maxSetTemp', 'roomTemp']
      },
      func: 'report',
      uuid: '869861065075201',
      eCode: 0,
      pType: 'params'
    }
  },
  '202房间温控器': {
    id: 2,
    device_id: '869861065075202',
    data: {
      body: {
        id: [1],
        data: [[0, 1, 2, 0, 190, 0, 170, 290, 280]], // runOn=0, runMode=1, runFanSpeed=2, runTemp=190, roomTemp=280
        items: ['runOn', 'runMode', 'runFanSpeed', 'runFanDirect', 'runTemp', 'remote', 'minSetTemp', 'maxSetTemp', 'roomTemp']
      },
      func: 'report',
      uuid: '869861065075202',
      eCode: 0,
      pType: 'params'
    }
  }
};

async function simulateWebSocketData() {
  console.log('🚀 [WebSocket模拟] 开始模拟设备数据推送');
  
  try {
    // 连接到WebSocket服务器
    const ws = new WebSocket('ws://localhost:3000');
    
    ws.on('open', () => {
      console.log('✅ [连接成功] WebSocket连接已建立');
      
      // 模拟定期推送设备数据
      let counter = 0;
      const interval = setInterval(() => {
        counter++;
        
        // 交替推送不同设备的数据
        const deviceNames = Object.keys(mockDeviceData);
        const deviceName = deviceNames[counter % deviceNames.length];
        const deviceInfo = mockDeviceData[deviceName];
        
        // 随机修改一些数据值来模拟状态变化
        const data = JSON.parse(JSON.stringify(deviceInfo.data)); // 深拷贝
        const dataArray = data.body.data[0];
        
        // 随机切换电源状态 (runOn)
        if (Math.random() > 0.7) {
          dataArray[0] = dataArray[0] === 1 ? 0 : 1;
          console.log(`🔄 [状态变化] ${deviceName} 电源状态切换为: ${dataArray[0] === 1 ? '开机' : '关机'}`);
        }
        
        // 随机调整温度 (roomTemp)
        if (dataArray.length > 8) {
          dataArray[8] = 200 + Math.floor(Math.random() * 100); // 20.0°C - 30.0°C
        }
        
        // 随机调整目标温度 (runTemp)
        if (Math.random() > 0.8) {
          dataArray[4] = 180 + Math.floor(Math.random() * 120); // 18.0°C - 30.0°C
          console.log(`🎯 [温度调整] ${deviceName} 目标温度调整为: ${dataArray[4] / 10}°C`);
        }
        
        // 发送device_data事件
        const message = {
          type: 'device_data',
          device_id: deviceInfo.id,
          data: data,
          timestamp: new Date().toISOString()
        };
        
        ws.send(JSON.stringify(message));
        console.log(`📡 [数据推送] 推送 ${deviceName} 数据 (第${counter}次):`, {
          设备ID: deviceInfo.id,
          电源状态: dataArray[0] === 1 ? '开机' : '关机',
          当前温度: dataArray[8] ? `${dataArray[8] / 10}°C` : '未知',
          目标温度: `${dataArray[4] / 10}°C`,
          运行模式: dataArray[1],
          风速: dataArray[2]
        });
        
        // 推送10次后停止
        if (counter >= 10) {
          clearInterval(interval);
          console.log('🏁 [推送完成] 模拟数据推送结束');
          ws.close();
        }
      }, 3000); // 每3秒推送一次
      
    });
    
    ws.on('message', (data) => {
      console.log('📨 [收到消息]', data.toString());
    });
    
    ws.on('error', (error) => {
      console.error('❌ [WebSocket错误]', error.message);
    });
    
    ws.on('close', () => {
      console.log('🔌 [连接关闭] WebSocket连接已断开');
    });
    
  } catch (error) {
    console.error('❌ [模拟失败]', error);
  }
}

// 运行模拟
simulateWebSocketData();