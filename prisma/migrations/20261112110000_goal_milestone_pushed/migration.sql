-- 아침 알림으로 보낸 목표 진행률 단계 (25·50·75·100). 기존 목표는 홈에서 이미 본 단계까지 보낸 것으로 친다
ALTER TABLE "AssetGoal" ADD COLUMN "milestonePushed" INTEGER NOT NULL DEFAULT 0;
UPDATE "AssetGoal" SET "milestonePushed" = "milestoneSeen";
