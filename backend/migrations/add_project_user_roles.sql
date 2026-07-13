DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_role') THEN
    ALTER TYPE enum_users_role ADD VALUE IF NOT EXISTS 'building_user';
    ALTER TYPE enum_users_role ADD VALUE IF NOT EXISTS 'group_user';
  END IF;
END $$;
