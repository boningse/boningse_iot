-- 修复多联机内机地址格式
-- 创建时间: 2024-01-21
-- 问题：部分内机地址中第1段显示为"undefined"，需要修复为正确的concentrator_id

-- 修复地址格式错误的记录
UPDATE multi_unit_ac_indoor_units 
SET unit_address = CONCAT(
    (SELECT concentrator_id FROM multi_unit_ac_hosts WHERE id = multi_unit_ac_indoor_units.host_id),
    '-',
    channel_number,
    '-',
    outdoor_unit_address,
    '-',
    indoor_unit_address
)
WHERE unit_address LIKE 'undefined-%' OR unit_address IS NULL;

-- 验证修复结果
SELECT 
    u.id,
    u.unit_address,
    u.channel_number,
    u.outdoor_unit_address,
    u.indoor_unit_address,
    h.concentrator_id
FROM multi_unit_ac_indoor_units u
JOIN multi_unit_ac_hosts h ON u.host_id = h.id
ORDER BY u.created_at DESC;