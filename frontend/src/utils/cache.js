/**
 * API缓存工具
 * 提供请求缓存、防抖和节流功能
 */

class APICache {
  constructor() {
    this.cache = new Map()
    this.pendingRequests = new Map()
    this.debounceTimers = new Map()
  }

  /**
   * 生成缓存键
   */
  generateKey(url, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((result, key) => {
        result[key] = params[key]
        return result
      }, {})
    return `${url}:${JSON.stringify(sortedParams)}`
  }

  /**
   * 获取缓存数据
   */
  get(key) {
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data
    }
    this.cache.delete(key)
    return null
  }

  /**
   * 设置缓存数据
   */
  set(key, data, ttl = 5 * 60 * 1000) { // 默认5分钟
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })
  }

  /**
   * 清除缓存
   */
  clear(pattern = null) {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key)
        }
      }
    } else {
      this.cache.clear()
    }
  }

  /**
   * 防重复请求
   */
  async request(key, requestFn) {
    // 检查是否有相同的请求正在进行
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)
    }

    // 执行请求
    const promise = requestFn()
    this.pendingRequests.set(key, promise)

    try {
      const result = await promise
      return result
    } finally {
      this.pendingRequests.delete(key)
    }
  }

  /**
   * 防抖函数
   */
  debounce(key, fn, delay = 300) {
    return (...args) => {
      clearTimeout(this.debounceTimers.get(key))
      const timer = setTimeout(() => {
        fn.apply(this, args)
        this.debounceTimers.delete(key)
      }, delay)
      this.debounceTimers.set(key, timer)
    }
  }

  /**
   * 清理过期缓存
   */
  cleanup() {
    const now = Date.now()
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp >= cached.ttl) {
        this.cache.delete(key)
      }
    }
  }
}

// 创建全局缓存实例
const apiCache = new APICache()

// 定期清理过期缓存
setInterval(() => {
  apiCache.cleanup()
}, 5 * 60 * 1000) // 每5分钟清理一次

export default apiCache

/**
 * 缓存装饰器
 */
export function withCache(ttl = 5 * 60 * 1000) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value
    
    descriptor.value = async function(...args) {
      const key = apiCache.generateKey(`${target.constructor.name}.${propertyKey}`, args[0])
      
      // 尝试从缓存获取
      const cached = apiCache.get(key)
      if (cached) {
        return cached
      }
      
      // 防重复请求
      return apiCache.request(key, async () => {
        const result = await originalMethod.apply(this, args)
        apiCache.set(key, result, ttl)
        return result
      })
    }
    
    return descriptor
  }
}

/**
 * 防抖装饰器
 */
export function debounced(delay = 300) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value
    
    descriptor.value = function(...args) {
      const key = `${target.constructor.name}.${propertyKey}`
      return apiCache.debounce(key, originalMethod.bind(this), delay)(...args)
    }
    
    return descriptor
  }
}