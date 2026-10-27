// 새싹로봇 그림(피그마 "개발 v1.0"에서 내려받은 원본, public/art).
import Image from "next/image";
import type { CSSProperties } from "react";

const sizes = {
  logo: [436, 337],
  "robot-done": [760, 468],
  "robot-face": [480, 460],
  "robot-full": [525, 410],
  "robot-home-empty": [466, 360],
  "robot-home-header": [400, 336],
  "robot-home": [526, 334],
  "robot-mic-off": [564, 500],
  "robot-processing": [566, 514],
  "robot-ready": [540, 468],
  "robot-recording": [904, 750],
  "robot-rest": [830, 460],
  "robot-start": [884, 528],
  "robot-voice": [924, 500],
  "robot-welcome": [528, 520],
  "robot-writing": [348, 310],
} as const;

export type ArtName = keyof typeof sizes;

export function Art({
  name,
  width,
  alt = "새싹로봇",
  className = "art fluid",
  style,
  priority,
}: {
  name: ArtName;
  /** 화면에 보일 너비(px). 높이는 그림 비율대로. */
  width: number;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
}) {
  const [w, h] = sizes[name];
  return (
    <Image
      className={className}
      src={`/art/${name}.png`}
      alt={alt}
      width={width}
      height={Math.round((width * h) / w)}
      style={style}
      priority={priority}
    />
  );
}
