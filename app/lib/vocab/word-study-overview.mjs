const STATUS_FAMILIAR = "熟悉";
const STATUS_BLURRY = "模糊";
const STATUS_UNFAMILIAR = "不熟";

export function countWordStudyQueue(words = []) {
  const counts = {
    total: 0,
    familiar: 0,
    blurry: 0,
    unfamiliar: 0,
    unmarked: 0,
    favorite: 0
  };

  for (const word of words) {
    if (!word) continue;
    counts.total += 1;
    if (word.favorite) counts.favorite += 1;
    if (word.status === STATUS_FAMILIAR) counts.familiar += 1;
    else if (word.status === STATUS_BLURRY) counts.blurry += 1;
    else if (word.status === STATUS_UNFAMILIAR) counts.unfamiliar += 1;
    else counts.unmarked += 1;
  }

  return counts;
}

function metric(label, value, tone = "scope") {
  return { label, value, tone };
}

function clampPosition(position, total) {
  if (!total) return 0;
  const numeric = Number.isFinite(Number(position)) ? Math.trunc(Number(position)) : 0;
  return Math.min(total, Math.max(1, numeric + 1));
}

export function getWordStudyProgressLabel(filter = {}, isExternalIdictationItem = false) {
  if (isExternalIdictationItem || filter.type === "idictation") return "词表进度";
  if (filter.type === "status" && [STATUS_BLURRY, STATUS_UNFAMILIAR].includes(filter.value)) return "复习进度";
  if (filter.type === "status" && filter.value === STATUS_FAMILIAR) return "回顾进度";
  return "浏览进度";
}

export function buildWordStudyOverviewModel({
  filter = { type: "all", value: "" },
  filterName = "待学词浏览",
  studyWords = [],
  queueCounts = null,
  currentPosition = 0,
  wordLibraryStats = {},
  isExternalIdictationItem = false
} = {}) {
  const counts = queueCounts || countWordStudyQueue(studyWords);
  const position = clampPosition(currentPosition, counts.total);
  const progressPercent = counts.total ? Math.round((position / counts.total) * 100) : 0;
  const globalToday = Math.max(0, Number(wordLibraryStats.todayReviewed || 0));
  const globalBlurry = Math.max(0, Number(wordLibraryStats.blurry || 0));
  const globalUnfamiliar = Math.max(0, Number(wordLibraryStats.unfamiliar || 0));
  const globalFamiliar = Math.max(0, Number(wordLibraryStats.familiar || 0));
  const positionValue = `${position}/${counts.total}`;
  const base = {
    title: filterName,
    ringLabel: "浏览位置",
    progressPercent,
    progressAria: `当前位置 ${positionValue}`,
    metrics: [],
    facts: [],
    note: "翻页只代表浏览，不会自动计为熟悉；只有主动标记才会改变学习状态。"
  };

  if (isExternalIdictationItem || filter.type === "idictation") {
    return {
      ...base,
      title: "听写词表浏览",
      ringLabel: "词表位置",
      metrics: [
        metric("词表总数", counts.total),
        metric("当前位置", positionValue, "known"),
        metric("独立进度", "是", "blurry")
      ],
      facts: [
        metric("主词库状态", "不改写"),
        metric("本页操作", "下一个 / 稍后 / 跳过")
      ],
      note: "此模式的浏览操作只控制当前听写词表，不会自动标记主词库熟悉或不熟。"
    };
  }

  if (filter.type === "status" && filter.value === STATUS_UNFAMILIAR) {
    return {
      ...base,
      title: "不熟词复习",
      ringLabel: "复习位置",
      metrics: [
        metric("本组剩余", counts.total, "unfamiliar"),
        metric("当前位置", positionValue, "known"),
        metric("其中收藏", counts.favorite, "favorite")
      ],
      facts: [
        metric("全库不熟", globalUnfamiliar),
        metric("今日状态操作", globalToday)
      ],
      note: "标记为熟悉或模糊后，该词会离开当前不熟队列。"
    };
  }

  if (filter.type === "status" && filter.value === STATUS_BLURRY) {
    return {
      ...base,
      title: "模糊词巩固",
      ringLabel: "复习位置",
      metrics: [
        metric("本组剩余", counts.total, "blurry"),
        metric("当前位置", positionValue, "known"),
        metric("其中收藏", counts.favorite, "favorite")
      ],
      facts: [
        metric("全库模糊", globalBlurry),
        metric("今日状态操作", globalToday)
      ],
      note: "只有主动重新标记，词条的模糊、不熟或熟悉状态才会改变。"
    };
  }

  if (filter.type === "status" && filter.value === STATUS_FAMILIAR) {
    return {
      ...base,
      title: "熟悉词回顾",
      ringLabel: "回顾位置",
      metrics: [
        metric("本组熟悉", counts.total, "known"),
        metric("当前位置", positionValue, "scope"),
        metric("其中收藏", counts.favorite, "favorite")
      ],
      facts: [
        metric("全库熟悉", globalFamiliar),
        metric("今日状态操作", globalToday)
      ],
      note: "这里用于回顾已经主动标记熟悉的词，进入页面本身不会新增熟悉记录。"
    };
  }

  if (filter.type === "status" && filter.value === "收藏") {
    return {
      ...base,
      title: "收藏词浏览",
      metrics: [
        metric("收藏范围", counts.total, "favorite"),
        metric("未标记", counts.unmarked, "unlearned"),
        metric("待复习", counts.blurry + counts.unfamiliar, "unfamiliar")
      ],
      facts: [
        metric("当前位置", positionValue),
        metric("今日状态操作", globalToday)
      ]
    };
  }

  return {
    ...base,
    title: filter.type === "all" ? "待学词浏览" : filterName,
    metrics: [
      metric("当前范围", counts.total),
      metric("未标记", counts.unmarked, "unlearned"),
      metric("模糊", counts.blurry, "blurry"),
      metric("不熟", counts.unfamiliar, "unfamiliar")
    ],
    facts: [
      metric("当前位置", positionValue),
      metric("今日状态操作", globalToday),
      metric("当前收藏", counts.favorite)
    ]
  };
}
