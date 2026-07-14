#!/usr/bin/env python3
"""Build the curated 6,000-word IELTS General Training meaning bank.

Reads public/data/words.json and writes public/data/meaning-6000.json plus
an audit report. The master lexicon is read-only and is never modified.

Requires: pip install wordfreq
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import statistics
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

try:
    from wordfreq import zipf_frequency
except ImportError as exc:  # pragma: no cover
    raise SystemExit("Missing build dependency: pip install wordfreq") from exc

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "public/data/words.json"
DEFAULT_OUTPUT = ROOT / "public/data/meaning-6000.json"
DEFAULT_LEGACY = ROOT / "public/data/meaning-4500.json"
DEFAULT_REPORT = ROOT / "reports/meaning-bank-selection-report.json"
TARGET_COUNT = 6000


def load_selector_set(name: str) -> set[str]:
    selector = ROOT / "app/lib/meaning-mode/selector.mjs"
    if not selector.exists():
        return set()
    text = selector.read_text(encoding="utf-8-sig")
    match = re.search(rf"const {re.escape(name)} = new Set\(\[(.*?)\]\);", text, re.S)
    return set(re.findall(r'"([^"\n]+)"', match.group(1))) if match else set()


BASIC_SKIP = load_selector_set("BASIC_WORDS")
PERSON_NAMES = load_selector_set("PERSON_NAMES")

# Function words, calendar labels, elementary numerals and obvious proper names are
# intentionally excluded so the finite training bank is spent on lexical content.
FUNCTION_OR_TRIVIAL_WORDS = set("""
a an the i you he she it we they me him her us them my your his its our their mine yours hers ours theirs
this that these those am is are was were be been being have has had do does did will would shall should can could
may might must and or but so if in on at to for of with from by about as into through during before after above below
between under again then now here there yes no not one two three four five six seven eight nine ten eleven twelve
thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety
monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september
october november december mr mrs ms miss dr hello goodbye please thank sorry ok okay hi hey
red blue green yellow black white third hundreds sir
""".split())

PROPER_WORDS = set("""
ben tim democrats victorian
canada japan china india france germany italy spain britain england america australia africa asia europe ohio massachusetts
amazon olympics cossacks roman james john jane helene philip richard norman mary michael william david robert charles
joseph thomas american canadian japanese chinese indian french german italian spanish british english australian african
asian european swedish
""".split())

ABBREVIATIONS = {"gdp", "usa", "uk", "eu", "un", "tv", "pm", "am", "corp", "inc", "ltd", "llc", "rep"}
INVALID_FUNCTION_POS = re.compile(
    r"pronoun|preposition|conjunction|interjection|article|determiner|number|ordinal|"
    r"abbreviation|prefix|suffix|modal",
    re.I,
)

LEXICALIZED_PLURALS = {
    "affairs", "arms", "belongings", "clothes", "customs", "earnings", "economics",
    "funds", "goods", "headquarters", "logistics", "means", "odds", "outskirts",
    "premises", "quarters", "sales", "savings", "species", "stairs", "statistics",
    "surroundings", "works",
}
IRREGULAR_PLURALS = {
    "children": "child", "men": "man", "women": "woman", "feet": "foot",
    "teeth": "tooth", "mice": "mouse", "geese": "goose", "people": "person",
}
IRREGULAR_PAST = {
    "did": "do", "went": "go", "gone": "go", "threw": "throw", "thrown": "throw",
    "spoke": "speak", "spoken": "speak", "saw": "see", "seen": "see", "sat": "sit",
    "stood": "stand", "found": "find", "bought": "buy", "brought": "bring",
    "thought": "think", "heard": "hear", "held": "hold", "left": "leave",
    "lost": "lose", "made": "make", "paid": "pay", "said": "say", "sent": "send",
    "built": "build", "caught": "catch", "taught": "teach", "wrote": "write",
    "written": "write", "ran": "run", "fell": "fall", "fallen": "fall",
    "grew": "grow", "grown": "grow", "knew": "know", "known": "know",
    "gave": "give", "given": "give", "took": "take", "taken": "take",
    "became": "become", "began": "begin", "begun": "begin", "chose": "choose",
    "chosen": "choose", "drove": "drive", "driven": "drive", "told": "tell",
    "met": "meet", "led": "lead",
}

# Explicit grammatical-form descriptions are strong evidence that an entry is only
# an inflected duplicate. Suffix shape alone is deliberately NOT used; words such as
# economics, recording, housing, related and scheduled have independent quiz value.
FORM_MEANING_PATTERN = re.compile(
    r"过去式|过去分词|现在分词|复数形式|的复数|比较级|最高级|"
    r"past tense|past participle|present participle|plural form|comparative form|superlative form",
    re.I,
)

BAD_NOTE_PATTERNS = re.compile(
    r"proper name|proper noun|专有名词|人名|截断|非标准|rare word|uncommon word|"
    r"meaningzh (?:was|is|may be) (?:incorrect|inaccurate)|"
    r"original meaning (?:was|is|may be) (?:incorrect|inaccurate|unclear)|"
    r"原义有误|原文含义有误|原译错误|含义不准确|current meaningzh incorrect|"
    r"corrected from erroneous|input meaning .* inaccurate|lowercase headword refers",
    re.I,
)

BAD_MEANING_PATTERNS = re.compile(
    r"^(?:一些；时间|人；结束|那里；只有|价格；|能够的；好的；服务|短的；在|时间；更多|任何；工作|"
    r"可获得的；人们|服务；人们|每个；其他的|第一；时间的行为|人；假的|只有；通常|从；的（法语介词）|男性名|女性名)$"
)

MANUAL_MEANING_FIXES = {
    "done": "完成的；做完的",
    "sales": "销售额；销售",
    "developed": "发达的；先进的",
    "overwhelming": "压倒性的；巨大的",
    "viewing": "观看；查看",
    "wrestling": "摔跤；角力",
    "civilized": "文明的",
    "scheduled": "预定的；按计划的",
    "founding": "创立；成立",
    "kidnapping": "绑架",
    "seating": "座位；座位安排",
    "means": "方法；手段",
    "sat": "坐（sit 的过去式）",
    "adopted": "采用的；收养的",
    "quarters": "住处；四分之一（复数）",
    "undertaking": "任务；事业；承诺",
    "coursework": "课程作业",
    "advert": "广告",
    "alluring": "诱人的；有吸引力的",
    "carriageway": "车行道",
    "scalper": "黄牛；倒票者",
    "straddle": "跨坐；跨越",
    "limited": "有限的；受限制的",
    "chameleon": "变色龙",
    "olympics": "奥林匹克运动会",
    "harmonise": "使和谐；协调",
}

G_TOPIC_RE = re.compile(
    r"住房|工作|旅行|交通|购物|消费|公共服务|健康|教育|社区|家庭|法律|金融|"
    r"求职|租房|投诉|预约|政府|银行|保险|医疗|学校|环境|科技"
)

POS_PATTERNS = (
    ("noun", re.compile(r"(?:^|[/,.&\s-])(?:noun|n\.?)(?:$|[/,.&\s-])", re.I)),
    ("verb", re.compile(r"(?:^|[/,.&\s-])(?:verb|v\.?)(?:$|[/,.&\s-])", re.I)),
    ("adjective", re.compile(r"(?:^|[/,.&\s-])(?:adjective|adj\.?)(?:$|[/,.&\s-])", re.I)),
    ("adverb", re.compile(r"(?:^|[/,.&\s-])(?:adverb|adv\.?)(?:$|[/,.&\s-])", re.I)),
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def norm_pos(pos: str) -> str:
    """Return the first lexical POS family, including mixed labels such as n./v."""
    text = f" {str(pos or '').strip().lower()} "
    matches: list[tuple[int, str]] = []
    for family, pattern in POS_PATTERNS:
        match = pattern.search(text)
        if match:
            matches.append((match.start(), family))
    if matches:
        return min(matches)[1]
    # Tolerate common long labels without separators.
    for family, token in (("noun", "noun"), ("verb", "verb"), ("adjective", "adject"), ("adverb", "adverb")):
        if token in text:
            return family
    return "other"


def compact_quiz_gloss(value: str) -> str:
    text = re.sub(r"[（(][^）)]*[）)]", "", str(value or "")).strip()
    parts = [p.strip() for p in re.split(r"[；;,，、/]", text) if p.strip()]
    return (parts[0] if parts else text).strip()


def repaired_meanings(entry: dict) -> tuple[str, str, str]:
    word = str(entry.get("word") or "").lower()
    raw = str(entry.get("meaning") or entry.get("definition") or "").strip()
    detailed = str(
        entry.get("meaningDetailedZh")
        or entry.get("meaningDetailZh")
        or entry.get("definition")
        or raw
    ).strip()

    senses = entry.get("quizSenses") or []
    if isinstance(senses, list) and senses and isinstance(senses[0], dict):
        curated = str(senses[0].get("quizMeaningZh") or "").strip()
        if curated:
            raw = curated
            detailed = str(senses[0].get("meaningDetailedZh") or detailed or curated).strip()

    if word in MANUAL_MEANING_FIXES:
        raw = MANUAL_MEANING_FIXES[word]
        detailed = MANUAL_MEANING_FIXES[word]
        source = "manual-fix"
    elif senses and isinstance(senses, list) and isinstance(senses[0], dict) and senses[0].get("quizMeaningZh"):
        source = "curated-quiz-sense"
    else:
        source = "master-lexicon"

    quiz = compact_quiz_gloss(raw)
    return quiz or raw, detailed or raw, source


def source_evidence(entry: dict) -> list[str]:
    out: list[str] = []
    for key in ("listeningPriority", "readingPriority", "writingPriority"):
        if entry.get(key):
            out.append(key)
    for key in ("excelSourceTags", "ieltsUse", "topics", "collocations", "quizSenses"):
        if entry.get(key):
            out.append(key)
    return out


def metadata_score(entry: dict, z: float, *, is_legacy: bool, pos_family: str) -> tuple[float, dict]:
    uses = "|".join(map(str, entry.get("ieltsUse") or []))
    topics = "|".join(map(str, entry.get("topics") or []))
    pri = sum(bool(entry.get(k)) for k in ("listeningPriority", "readingPriority", "writingPriority"))
    skills = {
        "listening": bool(re.search(r"Listening|听力", uses, re.I)),
        "reading": bool(re.search(r"Reading|阅读", uses, re.I)),
        "writing": bool(re.search(r"Writing|写作|Task|G类书信", uses, re.I)),
        "speaking": bool(re.search(r"Speaking|口语", uses, re.I)),
    }

    g_bonus = 0
    if re.search(r"G类|General Training|生活高频|工作高频", uses, re.I):
        g_bonus += 10
    g_bonus += sum(v for v, ok in zip((5, 4, 5, 4), skills.values()) if ok)
    if G_TOPIC_RE.search(topics):
        g_bonus += 7

    evidence = (3 if entry.get("excelSourceTags") else 0) + min(5, len(entry.get("excelSourceSheets") or []))
    coll = min(4, len(entry.get("collocations") or [])) + min(3, len(entry.get("phraseCollocations") or []))
    difficulty = {
        "基础高频": 13,
        "中级核心": 16,
        "高级加分": 6,
        "阅读扩展": 3,
        "低频认识即可": -16,
    }.get(entry.get("difficulty"), 0)
    source = {
        "internal-editorial": 6,
        "deepseek-editorial": 2,
        "existing-with-excel-priority-tags": 4,
        "excel-import": -2,
        "quality-repair": 6,
    }.get(entry.get("sourceType"), 0)

    commonness = z * 15
    rare_penalty = -30 if z < 2 else -15 if z < 2.5 else -6 if z < 3 else 0
    long_penalty = -10 if len(str(entry.get("word") or "")) > 15 and z < 3.2 else 0
    legacy_bonus = 11 if is_legacy else 0
    curated_bonus = 5 if entry.get("quizSenses") else 0
    pos_bonus = {"noun": 0, "verb": 5, "adjective": 4, "adverb": 8}.get(pos_family, 0)

    score = (
        commonness
        + pri * 7
        + g_bonus
        + evidence
        + coll
        + difficulty
        + source
        + rare_penalty
        + long_penalty
        + legacy_bonus
        + curated_bonus
        + pos_bonus
    )
    breakdown = {
        "zipf": z,
        "priority": pri,
        "gBonus": g_bonus,
        "evidence": evidence,
        "collocation": coll,
        "difficulty": difficulty,
        "source": source,
        "rarePenalty": rare_penalty,
        "longPenalty": long_penalty,
        "legacyBonus": legacy_bonus,
        "curatedSenseBonus": curated_bonus,
        "posBalanceBonus": pos_bonus,
    }
    return round(score, 3), breakdown


def _meaning_key(value: str) -> str:
    return re.sub(r"[^\u4e00-\u9fffA-Za-z0-9]", "", compact_quiz_gloss(value)).lower()


def _full_meaning_key(value: str) -> str:
    return re.sub(r"[^\u4e00-\u9fffA-Za-z0-9]", "", str(value or "")).lower()


def _plural_base_candidates(word: str) -> list[str]:
    if word in IRREGULAR_PLURALS:
        return [IRREGULAR_PLURALS[word]]
    out: list[str] = []
    if len(word) > 4 and word.endswith("ies"):
        out.append(word[:-3] + "y")
    if len(word) > 4 and word.endswith("ves"):
        out.extend([word[:-3] + "f", word[:-3] + "fe"])
    if len(word) > 4 and word.endswith("es"):
        out.extend([word[:-2], word[:-1]])
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        out.append(word[:-1])
    return list(dict.fromkeys(out))


def _regular_verb_bases(word: str) -> list[str]:
    out: list[str] = []
    if len(word) > 5 and word.endswith("ied"):
        out.append(word[:-3] + "y")
    if len(word) > 4 and word.endswith("ed"):
        stem = word[:-2]
        out.extend([stem, stem + "e"])
        if len(stem) > 2 and stem[-1] == stem[-2]:
            out.append(stem[:-1])
    if len(word) > 5 and word.endswith("ing"):
        stem = word[:-3]
        out.extend([stem, stem + "e"])
        if len(stem) > 2 and stem[-1] == stem[-2]:
            out.append(stem[:-1])
    return list(dict.fromkeys(out))


def redundant_form_reason(entry: dict, by_lower: dict[str, dict], pos_family: str) -> str | None:
    word = str(entry.get("word") or "").strip().lower()
    if word in MANUAL_MEANING_FIXES:
        return None
    meaning = str(entry.get("meaning") or entry.get("definition") or "")
    note = str(entry.get("editorialNote") or "")
    if FORM_MEANING_PATTERN.search(meaning + " " + note):
        return "explicit-inflected-form"

    if pos_family == "noun" and word not in LEXICALIZED_PLURALS:
        current_key = _full_meaning_key(meaning)
        for base in _plural_base_candidates(word):
            base_entry = by_lower.get(base)
            if not base_entry:
                continue
            base_key = _full_meaning_key(str(base_entry.get("meaning") or base_entry.get("definition") or ""))
            if current_key and base_key and (
                current_key == base_key
                or (len(current_key) >= 2 and current_key in base_key)
                or (len(base_key) >= 2 and base_key in current_key)
            ):
                return "redundant-plural"

    if pos_family == "verb":
        base = IRREGULAR_PAST.get(word)
        if base and base in by_lower:
            return "redundant-irregular-form"
        if any(base_word in by_lower for base_word in _regular_verb_bases(word)):
            return "redundant-verb-form"

    if (word.endswith("er") or word.endswith("est")) and re.match(r"^(更|较|最)", meaning):
        base = word[:-2] if word.endswith("er") else word[:-3]
        if base in by_lower or (base + "e") in by_lower:
            return "redundant-comparison-form"
    return None


def build(source: Path, output: Path, legacy: Path, report_path: Path, count: int) -> None:
    data = json.loads(source.read_text(encoding="utf-8-sig"))
    words = data["words"]
    by_lower = {str(item.get("word") or "").strip().lower(): item for item in words}
    legacy_items = []
    if legacy.exists():
        legacy_items = json.loads(legacy.read_text(encoding="utf-8-sig")).get("items", [])
    legacy_ids = {x.get("wordId") for x in legacy_items if x.get("wordId")}

    excluded = Counter()
    excluded_legacy = Counter()
    candidates: list[dict] = []

    for entry in words:
        word = str(entry.get("word") or "").strip()
        lower = word.lower()
        meaning = str(entry.get("meaning") or entry.get("definition") or "").strip()
        pos = str(entry.get("pos") or "").strip()
        note = str(entry.get("editorialNote") or "")
        is_legacy = entry.get("wordId") in legacy_ids

        reason = None
        if not word or not meaning or not entry.get("wordId"):
            reason = "missing-core-field"
        elif lower in FUNCTION_OR_TRIVIAL_WORDS:
            reason = "function-or-trivial"
        elif lower in BASIC_SKIP:
            reason = "separate-basic-bank"
        elif lower in PROPER_WORDS or lower in PERSON_NAMES or "proper noun" in pos.lower():
            reason = "proper-name"
        elif lower in ABBREVIATIONS or "abbreviation" in pos.lower():
            reason = "abbreviation"
        elif INVALID_FUNCTION_POS.search(pos):
            reason = "function-pos"
        elif norm_pos(pos) == "other":
            reason = "unsupported-pos"
        elif BAD_NOTE_PATTERNS.search(note) and lower not in MANUAL_MEANING_FIXES:
            reason = "editorial-warning"
        elif BAD_MEANING_PATTERNS.search(meaning) and lower not in MANUAL_MEANING_FIXES:
            reason = "suspicious-meaning"
        elif str(entry.get("sourceType") or "") == "local-personal-wrong":
            reason = "known-bad-source"
        else:
            reason = redundant_form_reason(entry, by_lower, norm_pos(pos))

        if reason:
            excluded[reason] += 1
            if is_legacy:
                excluded_legacy[reason] += 1
            continue

        z = max(zipf_frequency(lower, "en"), zipf_frequency(lower.replace("-", " "), "en"))
        strong_evidence = sum(bool(entry.get(k)) for k in ("listeningPriority", "readingPriority", "writingPriority")) >= 2
        g_specific = bool(G_TOPIC_RE.search("|".join(map(str, entry.get("topics") or []))))
        if z < 1.8 and not (strong_evidence or g_specific or is_legacy):
            excluded["too-rare"] += 1
            if is_legacy:
                excluded_legacy["too-rare"] += 1
            continue

        pos_family = norm_pos(pos)
        score, breakdown = metadata_score(entry, z, is_legacy=is_legacy, pos_family=pos_family)
        quiz, detailed, meaning_source = repaired_meanings(entry)
        if not quiz or (BAD_MEANING_PATTERNS.search(quiz) and lower not in MANUAL_MEANING_FIXES):
            excluded["bad-quiz-gloss"] += 1
            if is_legacy:
                excluded_legacy["bad-quiz-gloss"] += 1
            continue

        tags: list[str] = []
        uses = "|".join(map(str, entry.get("ieltsUse") or []))
        if re.search(r"Listening|听力", uses, re.I):
            tags.append("listening")
        if re.search(r"Reading|阅读", uses, re.I):
            tags.append("reading")
        if re.search(r"Writing|写作|Task|G类书信", uses, re.I):
            tags.append("writing")
        if re.search(r"Speaking|口语", uses, re.I):
            tags.append("speaking")

        candidates.append({
            "wordId": entry["wordId"],
            "word": word,
            "quizMeaningZh": quiz,
            "meaningZh": quiz,
            "meaningDetailedZh": detailed,
            "meaningSource": meaning_source,
            "posFamily": pos_family,
            "difficulty": entry.get("difficulty") or "中级核心",
            "selectionScore": score,
            "zipfFrequency": round(z, 2),
            "scoreBreakdown": breakdown,
            "tags": tags,
            "topics": entry.get("topics") or [],
            "sourceEvidence": source_evidence(entry),
            "legacy4500": is_legacy,
        })

    candidates.sort(key=lambda x: (-x["selectionScore"], -x["zipfFrequency"], x["word"].lower()))
    selected = candidates[:count]
    if len(selected) < count:
        raise SystemExit(f"Only {len(selected)} eligible entries for requested {count}")

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    out = {
        "version": f"meaning-{count}-v4-gt-quality-curated",
        "generatedAt": now,
        "count": len(selected),
        "sourceLexiconVersion": data.get("version"),
        "sourceLexiconCount": len(words),
        "sourceLexiconSha256": sha256(source),
        "selectionPolicy": "ielts-gt-quality-frequency-v4",
        "items": selected,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    selected_ids = {x["wordId"] for x in selected}
    report = {
        "generatedAt": now,
        "targetCount": count,
        "sourceCount": len(words),
        "sourceSha256": sha256(source),
        "eligibleCount": len(candidates),
        "legacyCount": len(legacy_ids),
        "retainedFromLegacy": len(selected_ids & legacy_ids),
        "removedFromLegacy": len(legacy_ids - selected_ids),
        "newFromMaster": len(selected_ids - legacy_ids),
        "excludedReasons": dict(excluded),
        "excludedLegacyReasons": dict(excluded_legacy),
        "difficulty": dict(Counter(x["difficulty"] for x in selected)),
        "posFamily": dict(Counter(x["posFamily"] for x in selected)),
        "skills": dict(Counter(tag for x in selected for tag in x["tags"])),
        "meaningSource": dict(Counter(x["meaningSource"] for x in selected)),
        "zipf": {
            "min": min(x["zipfFrequency"] for x in selected),
            "median": statistics.median(x["zipfFrequency"] for x in selected),
            "max": max(x["zipfFrequency"] for x in selected),
        },
        "lowestSelected": [
            {"word": x["word"], "meaningZh": x["meaningZh"], "score": x["selectionScore"], "zipf": x["zipfFrequency"]}
            for x in selected[-120:]
        ],
        "newSample": [
            {"word": x["word"], "meaningZh": x["meaningZh"], "score": x["selectionScore"]}
            for x in selected if x["wordId"] not in legacy_ids
        ][:120],
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        key: report[key]
        for key in (
            "targetCount",
            "eligibleCount",
            "retainedFromLegacy",
            "removedFromLegacy",
            "newFromMaster",
            "difficulty",
            "posFamily",
            "skills",
            "meaningSource",
            "zipf",
        )
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=TARGET_COUNT)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--legacy", type=Path, default=DEFAULT_LEGACY)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    build(args.source, args.output, args.legacy, args.report, args.count)
