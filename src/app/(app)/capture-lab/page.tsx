import { notFound } from "next/navigation";
import { CaptureLab } from "./capture-lab";

/** 캡처 글자 인식 정확도 시험 (개발 전용). 운영에서는 열리지 않는다 */
export default function CaptureLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CaptureLab />;
}
