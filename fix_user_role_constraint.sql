-- 修复用户角色约束问题
-- 当前约束只允许: 'admin', 'manager', 'user', 'viewer'
-- 但模型定义需要: 'admin', 'tenant_admin', 'user'

-- 删除旧的约束
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- 添加新的约束，匹配模型定义
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('admin', 'tenant_admin', 'user'));

-- 验证约束
SELECT conname, pg_get_constraintdef(oid) as constraint_def 
FROM pg_constraint 
WHERE conname = 'users_role_check' 
  AND conrelid = (SELECT oid FROM pg_class WHERE relname = 'users');