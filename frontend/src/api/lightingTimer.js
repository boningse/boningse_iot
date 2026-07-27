import request from '@/utils/request'

// 获取照明设备定时列表
export function getLightingTimers(deviceId) {
  return request({
    url: `/api/lighting-timer/${deviceId}`,
    method: 'get'
  })
}

// 创建照明设备定时
export function createLightingTimer(data) {
  return request({
    url: '/api/lighting-timer',
    method: 'post',
    data
  })
}

// 切换定时状态
export function toggleLightingTimer(id, enabled) {
  return request({
    url: `/api/lighting-timer/${id}/toggle`,
    method: 'put',
    data: { enabled }
  })
}

// 删除照明设备定时
export function deleteLightingTimer(id) {
  return request({
    url: `/api/lighting-timer/${id}`,
    method: 'delete'
  })
}