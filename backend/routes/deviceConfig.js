const express = require('express');
const router = express.Router();
const { Device } = require('../models');
const mqttConfigService = require('../services/mqttConfigService');
const mqttService = require('../services/mqttService');
const { authenticateToken, requireDeviceAccess } = require('../middleware/auth');

/**
 * 获取设备MQTT配置
 */
router.get('/:deviceId/mqtt-config', authenticateToken, requireDeviceAccess, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // 检查设备是否存在
    const device = await Device.findOne({ 
      where: { device_id: deviceId },
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      }
    });
    if (!device) {
      return res.status(404).json({ error: '设备不存在' });
    }
    
    // 获取设备MQTT配置
    const config = await mqttConfigService.getDeviceConfig(deviceId);
    
    res.json({
      success: true,
      data: {
        device_id: deviceId,
        mqtt_config: config
      }
    });
  } catch (error) {
    console.error('获取设备MQTT配置失败:', error);
    res.status(500).json({ error: '获取设备MQTT配置失败' });
  }
});

/**
 * 更新设备MQTT配置
 */
router.put('/:deviceId/mqtt-config', authenticateToken, requireDeviceAccess, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { mqtt_config } = req.body;
    
    // 检查设备是否存在
    const device = await Device.findOne({ 
      where: { device_id: deviceId },
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      }
    });
    if (!device) {
      return res.status(404).json({ error: '设备不存在' });
    }
    
    // 验证配置格式
    const validationResult = mqttConfigService.validateConfig(mqtt_config);
    if (!validationResult.valid) {
      return res.status(400).json({ 
        error: '配置格式无效', 
        details: validationResult.errors 
      });
    }
    
    // 更新设备MQTT配置
    await device.update({ mqtt_config });
    
    // 清除缓存
    mqttConfigService.clearDeviceCache(deviceId);
    
    // 通知MQTT服务重新订阅主题
    if (mqttService.isConnected) {
      await mqttService.onDeviceConfigUpdated(deviceId);
    }
    
    res.json({
      success: true,
      message: '设备MQTT配置更新成功',
      data: {
        device_id: deviceId,
        mqtt_config
      }
    });
  } catch (error) {
    console.error('更新设备MQTT配置失败:', error);
    res.status(500).json({ error: '更新设备MQTT配置失败' });
  }
});

/**
 * 获取设备订阅主题列表
 */
router.get('/:deviceId/subscribe-topics', authenticateToken, requireDeviceAccess, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // 检查设备是否存在
    const device = await Device.findOne({ 
      where: { device_id: deviceId },
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      }
    });
    if (!device) {
      return res.status(404).json({ error: '设备不存在' });
    }
    
    const topics = await mqttConfigService.getDeviceSubscribeTopics(deviceId);
    
    res.json({
      success: true,
      data: {
        device_id: deviceId,
        subscribe_topics: topics
      }
    });
  } catch (error) {
    console.error('获取设备订阅主题失败:', error);
    res.status(500).json({ error: '获取设备订阅主题失败' });
  }
});

/**
 * 获取设备发布主题列表
 */
router.get('/:deviceId/publish-topics', authenticateToken, requireDeviceAccess, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // 检查设备是否存在
    const device = await Device.findOne({ 
      where: { device_id: deviceId },
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      }
    });
    if (!device) {
      return res.status(404).json({ error: '设备不存在' });
    }
    
    const topics = await mqttConfigService.getDevicePublishTopics(deviceId);
    
    res.json({
      success: true,
      data: {
        device_id: deviceId,
        publish_topics: topics
      }
    });
  } catch (error) {
    console.error('获取设备发布主题失败:', error);
    res.status(500).json({ error: '获取设备发布主题失败' });
  }
});

/**
 * 启用/禁用设备MQTT功能
 */
router.patch('/:deviceId/mqtt-status', authenticateToken, requireDeviceAccess, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled字段必须是布尔值' });
    }
    
    // 检查设备是否存在
    const device = await Device.findOne({ 
      where: { device_id: deviceId },
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      }
    });
    if (!device) {
      return res.status(404).json({ error: '设备不存在' });
    }
    
    // 更新设备MQTT状态
    const currentConfig = device.mqtt_config || {};
    const newConfig = {
      ...currentConfig,
      enabled
    };
    
    await device.update({ mqtt_config: newConfig });
    
    // 清除缓存
    mqttConfigService.clearDeviceCache(deviceId);
    
    // 根据状态订阅或取消订阅主题
    if (mqttService.isConnected) {
      if (enabled) {
        await mqttService.onDeviceOnline(deviceId);
      } else {
        await mqttService.onDeviceOffline(deviceId);
      }
    }
    
    res.json({
      success: true,
      message: `设备MQTT功能已${enabled ? '启用' : '禁用'}`,
      data: {
        device_id: deviceId,
        enabled
      }
    });
  } catch (error) {
    console.error('更新设备MQTT状态失败:', error);
    res.status(500).json({ error: '更新设备MQTT状态失败' });
  }
});

/**
 * 获取MQTT配置模板
 */
router.get('/mqtt-config-template', authenticateToken, async (req, res) => {
  try {
    const template = {
      subscribe_topics: [
        {
          topic: "device/{device_id}/command",
          qos: 1,
          description: "设备命令主题"
        }
      ],
      publish_topics: [
        {
          topic: "device/{device_id}/data",
          qos: 1,
          message_type: "sensor_data",
          description: "传感器数据主题"
        },
        {
          topic: "device/{device_id}/status",
          qos: 1,
          message_type: "status",
          description: "设备状态主题"
        },
        {
          topic: "device/{device_id}/response",
          qos: 1,
          message_type: "response",
          description: "命令响应主题"
        },
        {
          topic: "device/{device_id}/heartbeat",
          qos: 0,
          message_type: "heartbeat",
          description: "心跳主题"
        }
      ],
      heartbeat_interval: 60,
      offline_timeout: 300,
      auto_subscribe: true,
      enabled: true
    };
    
    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('获取MQTT配置模板失败:', error);
    res.status(500).json({ error: '获取MQTT配置模板失败' });
  }
});

module.exports = router;