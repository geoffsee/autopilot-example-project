ALTER TABLE _audit ADD COLUMN delta INTEGER;

-- down:
ALTER TABLE _audit DROP COLUMN delta;
