-- 기본 화면 테마를 노을(sunset)로. 숲은 이제까지의 기본값이라 고른 사람과 안 고른 사람을 가릴 수 없어 모두 노을로 옮긴다
-- (바다·저녁을 고른 사람은 그대로). 숲으로 돌아가려면 설정 > 화면에서 고르면 된다
ALTER TABLE "User" ALTER COLUMN "palette" SET DEFAULT 'sunset';
UPDATE "User" SET "palette" = 'sunset' WHERE "palette" = 'forest';
