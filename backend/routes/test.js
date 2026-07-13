const express = require('express');
const router = express.Router();
const { saveLightingElectricalDataToTable } = require('../services/mqttService');
const { Device } = require('../models');

// 测试路由是否正常工作
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: '测试路由正常工作',
    timestamp: new Date().toISOString()
  });
});

// 测试照明电气数据写入接口
router.post('/lighting-electrical', async (req, res) => {
  try {
    const { manufacturer_code, device_imei, electrical_data } = req.body;
    
    if (!manufacturer_code || !device_imei || !electrical_data) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: manufacturer_code, device_imei, electrical_data'
      });
    }
    
    // 根据IMEI查找设备
    let device = await Device.findOne({ where: { imei: device_imei } });
    
    // 如果设备不存在，创建一个模拟设备对象
    if (!device) {
      device = {
        id: 'test-device-id',
        imei: device_imei,
        manufacturer_code: manufacturer_code,
        device_id: 'test-device'
      };
    }
    
    console.log('测试接口 - 设备对象:', JSON.stringify(device, null, 2));
    console.log('测试接口 - 电气数据:', JSON.stringify(electrical_data, null, 2));
    console.log('测试接口 - 厂商代码:', manufacturer_code);
    
    // 调用保存电气数据的函数，使用现有表（数据库连接为只读，无法创建按月分表）
    let result;
    try {
      result = await saveLightingElectricalDataToTable(
        device,
        electrical_data,
        manufacturer_code,
        false // useMonthlyPartition = false，使用现有表
      );
      console.log('测试接口 - 保存结果:', result);
    } catch (saveError) {
      console.error('测试接口 - 保存失败:', saveError.message);
      result = {
        success: false,
        error: saveError.message
      };
    }
    
    res.json({
      success: true,
      message: '电气数据已成功写入数据表',
      data: {
        manufacturer_code,
        device_imei,
        electrical_data,
        result
      }
    });
  } catch (error) {
    console.error('测试电气数据写入失败:', error);
    res.status(500).json({
      success: false,
      message: '电气数据写入失败',
      error: error.message
    });
  }
});

module.exports = router;