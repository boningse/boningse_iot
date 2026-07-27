-- 修复租户权限问题的SQL脚本
-- 问题：设备属于"山东伯宁"租户，但admin用户属于"默认租户"
-- 解决方案：将admin用户转移到"山东伯宁"租户

-- 查看当前状态
SELECT 
    '当前admin用户租户' as info,
    u.username, 
    u.tenant_id, 
    t.name as tenant_name 
FROM users u 
LEFT JOIN tenants t ON u.tenant_id = t.id 
WHERE u.username = 'admin';

SELECT 
    '设备所属租户' as info,
    d.device_id, 
    d.name as device_name,
    d.tenant_id, 
    t.name as tenant_name 
FROM devices d 
LEFT JOIN tenants t ON d.tenant_id = t.id 
WHERE d.device_id = '869861065084704';

-- 解决方案1：将admin用户转移到山东伯宁租户（推荐）
-- 这样admin可以管理所有27个设备
UPDATE users 
SET tenant_id = 'a594401a-2b16-4c0e-9515-adad1b5b80a4' 
WHERE username = 'admin';

-- 验证修复结果
SELECT 
    '修复后admin用户租户' as info,
    u.username, 
    u.tenant_id, 
    t.name as tenant_name 
FROM users u 
LEFT JOIN tenants t ON u.tenant_id = t.id 
WHERE u.username = 'admin';

-- 可选解决方案2：将设备转移到默认租户（不推荐）
-- 因为山东伯宁租户有27个设备，转移单个设备不合理
-- UPDATE devices 
-- SET tenant_id = 'c749c9ae-3298-4d39-9060-49938f354684' 
-- WHERE device_id = '869861065084704';