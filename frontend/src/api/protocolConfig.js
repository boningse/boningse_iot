import { get, post, put, del } from './index.js'

const request = ({ url, method, data, params }) => {
  switch (method.toLowerCase()) {
    case 'get':
      return get(url, params)
    case 'post':
      return post(url, data)
    case 'put':
      return put(url, data)
    case 'delete':
      return del(url)
    default:
      throw new Error(`Unsupported method: ${method}`)
  }
}

const protocolConfigAPI = {
  // 获取协议配置列表
  getProtocolConfigs(params = {}) {
    return request({
      url: '/protocol-configs',
      method: 'get',
      params
    })
  },

  // 获取协议配置详情
  getProtocolConfig(id) {
    return request({
      url: `/protocol-configs/${id}`,
      method: 'get'
    })
  },

  // 创建协议配置
  createProtocolConfig(data) {
    return request({
      url: '/protocol-configs',
      method: 'post',
      data
    })
  },

  // 更新协议配置
  updateProtocolConfig(id, data) {
    return request({
      url: `/protocol-configs/${id}`,
      method: 'put',
      data
    })
  },

  // 删除协议配置
  deleteProtocolConfig(id) {
    return request({
      url: `/protocol-configs/${id}`,
      method: 'delete'
    })
  },

  // 获取协议配置模板
  getTemplate() {
    return request({
      url: '/protocol-configs/template/example',
      method: 'get'
    })
  },

  // 根据厂商获取设备类型列表
  getDeviceTypesByManufacturer(manufacturerCode) {
    return request({
      url: `/protocol-configs/manufacturer/${manufacturerCode}/device-types`,
      method: 'get'
    })
  }
}

export default protocolConfigAPI