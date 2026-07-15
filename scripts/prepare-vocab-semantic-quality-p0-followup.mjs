import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PATCH_COLUMNS, hashExample, hashMeaning, toTsv } from "./lib/vocab-semantic-quality-v1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const payload = JSON.parse(fs.readFileSync(path.join(ROOT, ".static-export-cache", "words.json"), "utf8"));
const words = payload.words || payload;
const byWord = new Map(words.map((entry) => [entry.word, entry]));

const FIXES = {
  opinion: "In my opinion, education is essential.",
  diagnosis: "The doctor's diagnosis was flu.",
  sick: "I feel sick; I need a day off.",
  entirely: "I entirely agree with you.",
  hat: "Wear a hat to protect yourself from the sun.",
  redundant: "He was made redundant from his job.",
  various: "There are various options to choose from.",
  fracture: "He suffered a fracture in his arm.",
  whole: "I read the whole book in one day.",
  irish: "I met an Irish friend at the pub.",
  password: ["Enter your password to log in.", "输入密码登录。"],
  rubdown: "After the long run, she treated herself to a relaxing rubdown at the spa.",
  correspondence: "I have a long correspondence with my penfriend.",
  subsidize: "The government subsidizes public transport to encourage people to use it.",
  teller: "The teller asked for my identification.",
  wagon: "They loaded the wagon with hay.",
  breeze: "A gentle breeze was blowing from the sea.",
  prevail: "Justice will prevail in the end.",
  cue: "The cue for the next speaker is a nod.",
  comet: "We saw a comet in the sky.",
  cocktail: "We ordered cocktails at the bar.",
  mosquito: "A mosquito bit me on the arm.",
  temptation: "I resisted the temptation to buy it.",
  arc: "The rainbow formed a perfect arc in the sky.",
  tattoo: "He got a tattoo on his arm.",
  mustard: "I want mustard on my hot dog.",
  prototype: "They tested the prototype of the new car.",
  informant: "The police relied on an informant for information.",
  persistence: "Her persistence paid off in the end.",
  vastly: "The new system is vastly superior to the old one.",
  conjure: "She can conjure a rabbit out of a hat.",
  hawk: "A hawk circled overhead in the sky.",
  brag: "He bragged about his new car.",
  sting: "A bee stung him on the arm.",
  lighten: "She lightened her hair with dye.",
  chopped: "Add the chopped onions to the pan.",
  unidentified: "An unidentified object was spotted in the sky.",
  inclined: "I am inclined to agree with your view.",
  outraged: "The citizens were outraged by the new tax.",
  bones: "He broke two bones in his arm.",
  wanted: "I wanted to buy a new car.",
  crescent: "A crescent moon hung in the sky.",
  abash: "The compliment did not abash her at all.",
  imprint: "The seal left an imprint of the company logo on the wax.",
  injector: "The vet used a special injector to administer the vaccine to the dog.",
  promenade: "We walked along the promenade by the sea.",
  grieve: "She took time to grieve after the loss of her pet.",
  username: ["Enter your username and password to log in.", "输入你的用户名和密码登录。"],
  sledge: "They transported supplies by sledge across the ice.",
  cork: "He pulled the cork out of the wine bottle with a pop.",
  animals: "The children love to see animals at the zoo.",
  birds: "The birds fly high in the sky.",
  clouds: "The clouds are moving slowly across the sky.",
  flowers: "She bought some flowers for her mother.",
  positions: "The positions of the trees are marked on the map.",
  header: "The header shows the page number at the top.",
  instructions: "Follow the instructions on the box.",
  sailors: "The sailors sailed the boat across the sea.",
  falcons: "Falcons fly high in the sky.",
  replaced: "The old phone was replaced by a new one.",
  isles: "The misty isles lie far out in the sea.",
  octopus: "The octopus swims quickly in the sea.",
  smelting: "The factory uses smelting to extract metal from ore.",
  montana: "He lives in Montana with his dog.",
  jeff: "Jeff is a common name for a man.",
  newer: "This phone is newer than my old one.",
  seabird: "A seabird followed the boat across the bay.",
  gibson: "He ordered a Gibson at the bar.",
  varies: "The weather varies from day to day.",
  "twenty-four": "There are twenty-four hours in a day.",
  "ninety-nine": "He has ninety-nine problems, but a girl is not one of them.",
  headlamp: ["The car's headlamp needs replacing because it is broken.", "汽车前灯坏了，需要更换。"],
  pets: ["My pets are a cat and a dog.", "我的宠物是一只猫和一只狗。"],
  hearts: ["He gave her a red heart on Valentine's Day.", "他在情人节送给她一颗红心。"]
};

const rows = Object.entries(FIXES).map(([word, value]) => {
  const entry = byWord.get(word);
  if (!entry) throw new Error(`missing follow-up target: ${word}`);
  const [example, exampleCn] = Array.isArray(value) ? value : [value, entry.exampleCn];
  return {
    id: String(entry.id || entry.wordId || ""), word, action: "repair",
    setJson: JSON.stringify({ example, exampleCn }), addFormsJson: "", addMeaningsJson: "", addQuizSensesJson: "",
    reason: "human-semantic-followup", evidence: "现有完整中文例句与人工语义复核",
    expectedMeaningHash: hashMeaning(entry), expectedExampleHash: hashExample(entry)
  };
});

const output = path.join(ROOT, "data", "vocab-semantic-quality", "batch-p0-followup.tsv");
fs.writeFileSync(output, toTsv(rows, PATCH_COLUMNS));
console.log(JSON.stringify({ output: path.relative(ROOT, output).replace(/\\/g, "/"), count: rows.length }, null, 2));
