/**
 * 日期时间工具函数
 */

/**
 * 格式化日期时间
 * @param {Date|string|number} date - 日期对象、日期字符串或时间戳
 * @param {string} format - 格式化模板，默认为 'YYYY-MM-DD HH:mm:ss'
 * @returns {string} 格式化后的日期字符串
 */
export function formatDateTime(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!date) return '--'
  
  const d = new Date(date)
  if (isNaN(d.getTime())) return '--'
  
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
}

/**
 * 格式化日期
 * @param {Date|string|number} date - 日期对象、日期字符串或时间戳
 * @returns {string} 格式化后的日期字符串 (YYYY-MM-DD)
 */
export function formatDate(date) {
  return formatDateTime(date, 'YYYY-MM-DD')
}

/**
 * 格式化时间
 * @param {Date|string|number} date - 日期对象、日期字符串或时间戳
 * @returns {string} 格式化后的时间字符串 (HH:mm:ss)
 */
export function formatTime(date) {
  return formatDateTime(date, 'HH:mm:ss')
}

/**
 * 获取相对时间描述
 * @param {Date|string|number} date - 日期对象、日期字符串或时间戳
 * @returns {string} 相对时间描述
 */
export function getRelativeTime(date) {
  if (!date) return '--'
  
  const d = new Date(date)
  if (isNaN(d.getTime())) return '--'
  
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  
  if (diff < minute) {
    return '刚刚'
  } else if (diff < hour) {
    return `${Math.floor(diff / minute)}分钟前`
  } else if (diff < day) {
    return `${Math.floor(diff / hour)}小时前`
  } else if (diff < 7 * day) {
    return `${Math.floor(diff / day)}天前`
  } else {
    return formatDate(date)
  }
}

/**
 * 获取当前时间戳
 * @returns {number} 当前时间戳
 */
export function getCurrentTimestamp() {
  return Date.now()
}

/**
 * 获取当前格式化时间
 * @param {string} format - 格式化模板
 * @returns {string} 格式化后的当前时间
 */
export function getCurrentDateTime(format) {
  return formatDateTime(new Date(), format)
}