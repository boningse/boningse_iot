-- 修复照明电气数据时间戳约束问题
-- 该脚本用于移除所有lighting_electrical_bndk_*表的时间戳约束，解决数据插入失败问题

-- 创建函数移除所有照明电气数据表的时间戳约束
CREATE OR REPLACE FUNCTION remove_all_lighting_electrical_timestamp_constraints()
RETURNS INTEGER AS $$
DECLARE
    table_record RECORD;
    constraint_record RECORD;
    constraint_count INTEGER := 0;
BEGIN
    -- 查找所有lighting_electrical_bndk_开头的表
    FOR table_record IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE 'lighting_electrical_bndk_%'
    LOOP
        -- 查找该表的所有时间戳约束
        FOR constraint_record IN 
            SELECT constraint_name 
            FROM information_schema.constraint_column_usage 
            WHERE table_schema = 'public' 
            AND table_name = table_record.table_name
            AND constraint_name LIKE '%_timestamp_check'
        LOOP
            -- 移除约束
            EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', 
                          table_record.table_name, 
                          constraint_record.constraint_name);
            
            RAISE NOTICE '已移除表 % 的约束: %', 
                        table_record.table_name, 
                        constraint_record.constraint_name;
            
            constraint_count := constraint_count + 1;
        END LOOP;
    END LOOP;
    
    RETURN constraint_count;
END;
$$ LANGUAGE plpgsql;

-- 执行函数移除所有约束
SELECT remove_all_lighting_electrical_timestamp_constraints();

-- 移除特定的约束（根据错误日志）
ALTER TABLE lighting_electrical_bndk_370282 
DROP CONSTRAINT IF EXISTS lighting_electrical_bndk_2025_07_timestamp_check;

-- 清理
DROP FUNCTION IF EXISTS remove_all_lighting_electrical_timestamp_constraints();

-- 查询确认约束是否已移除
SELECT conname, conrelid::regclass AS table_name
FROM pg_constraint
WHERE conname LIKE '%_timestamp_check'
AND conrelid::regclass::text LIKE 'lighting_electrical_bndk_%';