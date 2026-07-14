import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  auditParaphraseQueuePipeline,
  simulateCoverageRounds,
  PARA_SESSION_SIZE,
  takeNextParaphraseSession
} from "../app/lib/reading-g-vocab/paraphrase-cycle.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const groups = JSON.parse(
  fs.readFileSync(path.join(root, "public/data/reading-g-paraphrases.json"), "utf8")
).groups;

const pipeline = auditParaphraseQueuePipeline(groups, { sessionSize: 10 });
const simGuided = simulateCoverageRounds(groups, 40, 10, rngSeq(101));
const simQuick = simulateCoverageRounds(groups, 20, 20, rngSeq(202));
const simFull = simulateCoverageRounds(groups, 10, 80, rngSeq(303));

function rngSeq(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const report = {
  totalGroups: pipeline.totalGroups,
  highGroups: pipeline.highGroups,
  autoQuizGroups: pipeline.autoQuizGroups,
  validMeaningGroups: pipeline.validMeaningGroups,
  deduplicatedGroups: pipeline.deduplicatedGroups,
  filteredGroups: pipeline.filteredGroups,
  statusFilteredGroups: pipeline.statusFilteredGroups,
  sessionPoolBeforeLimit: pipeline.sessionPoolBeforeLimit,
  sessionPoolAfterLimit: pipeline.sessionPoolAfterLimit,
  excludedGroupIds: pipeline.excludedGroupIds,
  excludedReasons: pipeline.excludedReasons,
  diagnosis: {
    eightyIs: "session_cap",
    classification: "F — 队列生成只取前80组（会话截断），不是数据只有80组",
    codeLocations: {
      nextWas: "page.jsx Math.min(80, eligible.length)",
      staticWas: "reading-g.js quizQueue.length < 60",
      nextNow: "PARA_SESSION_SIZE guided=10 / quick=20 / full=80 + takeNextParaphraseSession",
      staticNow: "SESSION_SIZES + coverage cycle"
    }
  },
  pipeline,
  simulation: {
    guided10: simGuided,
    quick20: simQuick,
    full80: simFull,
    first10GuidedRounds: simGuided.history.slice(0, 10),
    roundsToCover: { guided: simGuided.roundsRun, quick: simQuick.roundsRun, full: simFull.roundsRun },
    coversAll: { guided: simGuided.coversAll, quick: simQuick.coversAll, full: simFull.coversAll }
  },
  sessionSizes: PARA_SESSION_SIZE,
  sampleFirstSession: (() => {
    const b = takeNextParaphraseSession(groups, {}, null, {
      sessionMode: "guided",
      sessionSize: 10,
      rng: rngSeq(99)
    });
    return {
      questionCount: b.questions.length,
      sessionIds: b.sessionIds.length,
      poolSize: b.poolSize,
      cumulativeUnique: b.cumulativeUnique,
      sessionKinds: b.sessionKinds
    };
  })()
};

const outDesk = path.join("C:/Users/Administrator/Desktop/agent-tools/paraphrase-queue-audit.json");
const outProj = path.join(root, "reports/paraphrase-queue-audit.json");
fs.mkdirSync(path.dirname(outDesk), { recursive: true });
fs.mkdirSync(path.dirname(outProj), { recursive: true });
fs.writeFileSync(outDesk, JSON.stringify(report, null, 2));
fs.writeFileSync(outProj, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      classification: report.diagnosis.classification,
      poolBeforeLimit: pipeline.sessionPoolBeforeLimit,
      historical80: pipeline.historicalNextLimit,
      historical60: pipeline.historicalStaticLimit,
      afterGuidedLimit: pipeline.sessionPoolAfterLimit,
      rounds: report.simulation.roundsToCover,
      coversAll: report.simulation.coversAll,
      finalUnique: { guided: simGuided.finalUnique, quick: simQuick.finalUnique, full: simFull.finalUnique }
    },
    null,
    2
  )
);
