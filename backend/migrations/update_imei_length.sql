-- 更新设备表中IMEI字段的长度限制
ALTER TABLE devices ALTER COLUMN imei TYPE VARCHAR(50);

-- 添加注释
COMMENT ON COLUMN devices.imei IS 'IMEI编号，不低于15位，可以是数字或字母加数字的组合';