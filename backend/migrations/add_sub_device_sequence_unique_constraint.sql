-- 添加子设备序号唯一性约束
-- 确保同一父设备下的子设备序号不能重复

-- 首先检查是否已存在该约束
DO $$
BEGIN
    -- 检查约束是否已存在
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'devices_parent_sub_sequence_unique'
    ) THEN
        -- 添加唯一约束：同一父设备下的子设备序号必须唯一
        ALTER TABLE devices 
        ADD CONSTRAINT devices_parent_sub_sequence_unique 
        UNIQUE (parent_device_id, sub_device_sequence);
        
        RAISE NOTICE '已添加子设备序号唯一性约束';
    ELSE
        RAISE NOTICE '子设备序号唯一性约束已存在';
    END IF;
END $$;

-- 添加注释
COMMENT ON CONSTRAINT devices_parent_sub_sequence_unique ON devices 
IS '确保同一父设备下的子设备序号唯一';