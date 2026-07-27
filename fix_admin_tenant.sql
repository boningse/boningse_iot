-- 修复admin用户租户权限问题
-- 将admin用户改回默认租户，apple用户保持在山东伯宁租户

-- 查看当前用户租户状态
SELECT 
    u.username,
    u.tenant_id,
    t.name as tenant_name
FROM users u
LEFT JOIN tenants t ON u.tenant_id = t.id
WHERE u.username IN ('admin', 'apple');

-- 将admin用户改回默认租户
UPDATE users 
SET tenant_id = 'c749c9ae-3298-4d39-9060-49938f354684' 
WHERE username = 'admin';

-- 确认apple用户属于山东伯宁租户（应该已经正确）
-- apple用户的tenant_id应该是: a594401a-2b16-4c0e-9515-adad1b5b80a4

-- 验证修复结果
SELECT 
    u.username,
    u.tenant_id,
    t.name as tenant_name,
    CASE 
        WHEN u.username = 'admin' AND u.tenant_id = 'c749c9ae-3298-4d39-9060-49938f354684' THEN '✓ 正确'
        WHEN u.username = 'apple' AND u.tenant_id = 'a594401a-2b16-4c0e-9515-adad1b5b80a4' THEN '✓ 正确'
        ELSE '✗ 错误'
    END as status
FROM users u
LEFT JOIN tenants t ON u.tenant_id = t.id
WHERE u.username IN ('admin', 'apple')
ORDER BY u.username;

-- 查看山东伯宁租户下的设备（应该由apple用户管理）
SELECT 
    d.id,
    d.name,
    d.imei,
    d.tenant_id,
    t.name as tenant_name
FROM devices d
LEFT JOIN tenants t ON d.tenant_id = t.id
WHERE d.tenant_id = 'a594401a-2b16-4c0e-9515-adad1b5b80a4'
LIMIT 5;