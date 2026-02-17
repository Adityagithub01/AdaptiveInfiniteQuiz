import { createHash } from "crypto";
export function hashAnswer(answer: string, salt: string): string {
  return createHash("sha256")
    .update(`${salt}::${answer.trim()}`, "utf8")
    .digest("hex");
}