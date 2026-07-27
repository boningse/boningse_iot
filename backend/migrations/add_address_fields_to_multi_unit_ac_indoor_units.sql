-- 为多联机内机表添加地址相关字段
-- 创建时间: 2024-01-20

-- 添加地址相关字段
ALTER TABLE multi_unit_ac_indoor_units 
ADD COLUMN unit_address VARCHAR(100),
ADD COLUMN channel_number INTEGER,
ADD COLUMN outdoor_unit_address INTEGER,
ADD COLUMN indoor_unit_address INTEGER,
ADD COLUMN room_name VARCHAR(100),
ADD COLUMN model VARCHAR(100),
ADD COLUMN power INTEGER,
ADD COLUMN brand VARCHAR(50),
ADD COLUMN ac_type VARCHAR(10) DEFAULT 'v',
ADD COLUMN capacity INTEGER,
ADD COLUMN location VARCHAR(200),
ADD COLUMN description TEXT;

-- 添加字段注释
COMMENT ON COLUMN multi_unit_ac_indoor_units.unit_address IS '内机完整地址';
COMMENT ON COLUMN multi_unit_ac_indoor_units.channel_number IS '通道号';
COMMENT ON COLUMN multi_unit_ac_indoor_units.outdoor_unit_address IS '外机地址';
COMMENT ON COLUMN multi_unit_ac_indoor_units.indoor_unit_address IS '内机地址';
COMMENT ON COLUMN multi_unit_ac_indoor_units.room_name IS '房间名称';
COMMENT ON COLUMN multi_unit_ac_indoor_units.model IS '型号';
COMMENT ON COLUMN multi_unit_ac_indoor_units.power IS '功率';
COMMENT ON COLUMN multi_unit_ac_indoor_units.brand IS '品牌';
COMMENT ON COLUMN multi_unit_ac_indoor_units.ac_type IS '空调类型';
COMMENT ON COLUMN multi_unit_ac_indoor_units.capacity IS '制冷量';
COMMENT ON COLUMN multi_unit_ac_indoor_units.location IS '位置';
COMMENT ON COLUMN multi_unit_ac_indoor_units.description IS '描述';

-- 为现有记录设置默认值
UPDATE multi_unit_ac_indoor_units 
SET 
  channel_number = 1,
  outdoor_unit_address = 1,
  indoor_unit_address = unit_number,
  ac_type = 'v'
WHERE channel_number IS NULL;