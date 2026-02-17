import { db } from "../config/database";
import { ql } from "../db/queryLayer";
import { hashAnswer } from "../utils/hash";

const DEFAULT_SALT = "dev-salt-change-me";

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeArithmeticQuestion(difficulty: number) {
  // Difficulty influences operand size and operations.
  const maxOperand = difficulty <= 3 ? 20 : difficulty <= 6 ? 100 : 500;
  const a = randInt(1, maxOperand);
  const b = randInt(1, maxOperand);
  const ops = difficulty <= 3 ? ["+"] : difficulty <= 6 ? ["+", "-", "*"] : ["+", "-", "*"];
  const op = pick(ops);

  let correct = 0;
  let prompt = "";
  switch (op) {
    case "+":
      correct = a + b;
      prompt = `What is ${a} + ${b}?`;
      break;
    case "-":
      correct = a - b;
      prompt = `What is ${a} - ${b}?`;
      break;
    case "*":
      // Keep multiplication slightly bounded
      const ma = randInt(1, Math.max(3, Math.floor(maxOperand / 10)));
      const mb = randInt(1, Math.max(3, Math.floor(maxOperand / 10)));
      correct = ma * mb;
      prompt = `What is ${ma} × ${mb}?`;
      break;
    default:
      correct = a + b;
      prompt = `What is ${a} + ${b}?`;
  }

  // Create 3 plausible distractors
  const distractors = new Set<number>();
  while (distractors.size < 3) {
    const delta = randInt(1, Math.max(3, Math.floor(difficulty * 3)));
    const sign = Math.random() < 0.5 ? -1 : 1;
    const val = correct + sign * delta;
    if (val !== correct) distractors.add(val);
  }

  const correctStr = String(correct);
  const choices = shuffle([correctStr, ...Array.from(distractors).map(String)]);

  return { prompt, choices, correct: correctStr };
}

function makeVocabularyQuestion(difficulty: number) {
  const bank = [
    { word: "concise", correct: "brief", wrong: ["loud", "late", "messy"] },
    { word: "opaque", correct: "unclear", wrong: ["transparent", "bright", "small"] },
    { word: "vital", correct: "important", wrong: ["optional", "ordinary", "fragile"] },
    { word: "diligent", correct: "hardworking", wrong: ["careless", "sleepy", "random"] },
    { word: "novel", correct: "new", wrong: ["ancient", "predictable", "heavy"] },
  ];
  const item = pick(bank);
  const prompt = `Which option is closest in meaning to "${item.word}"?`;
  const correctStr = item.correct;
  const wrong = shuffle(item.wrong).slice(0, 3);
  const choices = shuffle([correctStr, ...wrong]);
  return { prompt, choices, correct: correctStr };
}

async function main() {
  const force = process.argv.includes("--force");
  const desiredCount = Number(process.env.SEED_QUESTION_COUNT ?? 80);
  const salt = process.env.QUIZ_ANSWER_SALT ?? DEFAULT_SALT;

  const existing = await ql.countQuestions();
  if (existing > 0 && !force) {
    console.log(
      `Questions table already has ${existing} row(s). Skipping seed. (Use --force to seed anyway)`
    );
    await db.end();
    return;
  }

  console.log(`Seeding ${desiredCount} question(s)...`);

  const tagPool = [
    "math",
    "arithmetic",
    "vocab",
    "basics",
    "intermediate",
    "advanced",
    "speed",
    "accuracy",
  ];

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // If force, clear existing questions first (safe: questions referenced by user_state/answer_log)
    if (force) {
      await client.query("TRUNCATE TABLE questions CASCADE");
    }

    for (let i = 0; i < desiredCount; i++) {
      const difficulty = ((i % 10) + 1) as number; // 1..10 distribution
      const type = difficulty <= 4 ? "math" : difficulty <= 7 ? pick(["math", "vocab"]) : "math";

      const q =
        type === "vocab"
          ? makeVocabularyQuestion(difficulty)
          : makeArithmeticQuestion(difficulty);

      const tags = shuffle([
        type === "vocab" ? "vocab" : "math",
        difficulty <= 3 ? "basics" : difficulty <= 7 ? "intermediate" : "advanced",
        pick(tagPool),
      ]).slice(0, 3);

      const correctAnswerHash = hashAnswer(q.correct, salt);

      await client.query(
        `INSERT INTO questions (difficulty, prompt, choices, correct_answer_hash, tags)
         VALUES ($1, $2, $3::jsonb, $4, $5::text[])`,
        [difficulty, q.prompt, JSON.stringify(q.choices), correctAnswerHash, tags]
      );
    }

    await client.query("COMMIT");
    console.log("✅ Seed complete");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seed failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

