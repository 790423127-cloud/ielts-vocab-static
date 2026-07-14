"use client";

/**
 * Home tools / admin panel extracted from app/page.jsx (I3.2).
 * Business logic stays in Home; this file is presentational wiring.
 */
export default function VocabAdminToolsPanel({
  toolsMenuRef,
  aiToolsRef,
  toolsOpen = false,
  aiToolsOpen = false,
  onToolsOpenChange,
  onAiToolsOpenChange,
  loading = false,
  pasteText = "",
  onPasteTextChange,
  lastLocalChange = null,
  audioCacheStats = null,
  audioStats = { has: 0, missing: 0, unchecked: 0, total: 0 },
  batchInfo = "",
  duplicateInfo = "",
  isExternalIdictationItem = false,
  actions = {}
}) {
  const a = actions;

  return (
              <details
                className="menu"
                ref={toolsMenuRef}
                open={toolsOpen}
                onToggle={(event) => {
                  onToolsOpenChange?.(event.currentTarget.open);
                }}
              >
                <summary className="top-pill">工具</summary>
                <div className="menu-panel">
                  <h2 className="panel-title">工具</h2>
                  <p className="panel-desc">本地工具默认推荐；AI工具已折叠，点击会二次确认扣费。</p>
    
                  <div className="action-grid">
                    <label className="file-label" htmlFor="fileInput">上传 TXT</label>
                    <button className="small-btn" onClick={a.importFromText}>导入粘贴内容</button>
                  </div>
                  <input id="fileInput" type="file" accept=".txt" onChange={a.handleFile} />
    
                  <div className="field" style={{ marginTop: 10 }}>
                    <label htmlFor="pasteBox">粘贴词表</label>
                    <textarea
                      id="pasteBox"
                      value={pasteText}
                      onChange={(e) => onPasteTextChange?.(e.target.value)}
                      placeholder={`abandon\napplication\nreliable`}
                    />
                  </div>
    
                  <div className="ai-warning">
                    <strong>工具区已精简：</strong>
                    常用功能放外面；低频、危险、排错功能已收进折叠区。导入、删除、清理前先下载完整词库备份。
                  </div>
    
                  <section className="menu-section">
                    <div className="menu-section-head">
                      <h3>常用</h3>
                      <p>日常学习、修改、发布主要用这里。</p>
                    </div>
                    <div className="action-grid">
                      <button className="small-btn warm" disabled={loading || isExternalIdictationItem} onClick={a.openEditCurrentWord}>
                        修改当前单词
                      </button>
                      <button className="small-btn danger" disabled={loading || isExternalIdictationItem} onClick={a.deleteCurrentWord}>
                        删除当前单词
                      </button>
                      <button className="small-btn ghost" disabled={loading} onClick={a.downloadVocabBackup}>
                        下载完整词库备份
                      </button>
                      <button className="small-btn static-export-btn" disabled={loading} onClick={a.exportStaticSite}>
                        导出静态网站
                      </button>
                    </div>
                  </section>
    
                  <section className="menu-section">
                    <div className="menu-section-head">
                      <h3>模板 / 导入导出</h3>
                      <p>按 6 个基础字段填词库；模板导入会合并，不会清空原词库。完整备份恢复才会替换。</p>
                    </div>
                    <div className="action-grid">
                      <button className="small-btn ghost" disabled={loading} onClick={a.downloadBlankVocabTemplateCsv}>
                        下载基础模板CSV
                      </button>
                      <button className="small-btn warm" disabled={loading} onClick={a.importTemplateVocabFile}>
                        合并导入基础模板
                      </button>
                      <button className="small-btn warm" disabled={loading} onClick={a.importVocabBackup}>
                        恢复完整备份
                      </button>
                      <button className="small-btn ghost" disabled={loading} onClick={a.downloadEnglishOnlyTxt}>
                        导出英文词TXT
                      </button>
                    </div>
                  </section>
    
                  <details className="ai-tools-box">
                    <summary>词库整理 / 修复</summary>
                    <p className="ai-warning">
                      低频使用。本地规则工具，不调用 AI。本地只检查 word 单词本身是否疑似有符号问题，不自动修改；需要修复时点 AI修复当前单词符号。
                    </p>
    
                    <details className="ai-tools-box">
                      <summary>本地修改记录 / 撤回</summary>
                      {lastLocalChange ? (
                        <div className="duplicate-box">
                          <div><strong>上次操作：</strong>{lastLocalChange.actionName}</div>
                          <div><strong>词数变化：</strong>{lastLocalChange.beforeCount} → {lastLocalChange.afterCount}</div>
                          <div><strong>涉及词条：</strong>{lastLocalChange.changedCount} 个；这里只显示前 {Math.min(30, lastLocalChange.changes.length)} 条</div>
                          <div className="action-grid">
                            <button className="small-btn danger" disabled={loading} onClick={a.undoLastLocalChange}>
                              撤回上一次本地操作
                            </button>
                            <button className="small-btn ghost" disabled={loading} onClick={a.clearLastLocalChangeLog}>
                              清空记录
                            </button>
                          </div>
                          <div className="word-list mini">
                            {lastLocalChange.changes.slice(0, 30).map((change, changeIndex) => (
                              <div className="word-row" key={`${change.type}-${change.word}-${changeIndex}`}>
                                <div>
                                  <strong>{change.type}：{change.word}</strong>
                                  <div className="muted">
                                    {change.diffs.slice(0, 4).map((diff) => `${diff.label}：${diff.before} → ${diff.after}`).join(" ｜ ")}
                                    {change.diffs.length > 4 ? " ｜ ..." : ""}
                                  </div>
                                </div>
                                <button className="mini-btn danger" disabled={loading} onClick={() => a.undoOneLocalChangeItem?.(changeIndex)}>
                                  撤回这条
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="ai-warning">还没有本地修改记录。执行整理、修复、删除、清理单词符号后，这里会显示改了哪些词；可以撤回全部，也可以只撤回某一条。</p>
                      )}
                    </details>
                    <div className="action-grid">
                      <button className="small-btn local-main" disabled={loading} onClick={a.localOptimizeWordList} title="本地整理词表 → 本地去重 → 本地归并词形">
                        一键本地优化
                      </button>
                      <button className="small-btn" disabled={loading} onClick={a.localCleanWordList}>
                        本地整理词表
                      </button>
                      <button className="small-btn" disabled={loading} onClick={a.localDedupeWords}>
                        本地去重
                      </button>
                      <button className="small-btn" disabled={loading} onClick={a.localMergeWordForms}>
                        本地归并词形
                      </button>
                      <button className="small-btn" disabled={loading} onClick={a.localScanAndRepairWrongWords}>
                        稳定本地修复确定错词
                      </button>
                      <button className="small-btn" disabled={loading} onClick={a.localRepairTruncatedHeadwords}>
                        只修单词本身截断
                      </button>
                      <button className="small-btn" disabled={loading} onClick={a.localScanTtsSymbols}>
                        检查单词符号
                      </button>
                      <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.("AI修复当前单词符号（会扣费）") && a.aiRepairCurrentWordSymbol?.()}>
                        AI修复当前单词符号（会扣费）
                      </button>
                      <button className="small-btn ghost" disabled={loading} onClick={a.clearWrongAiRepairFlags}>
                        清除错误AI修复标记
                      </button>
                      <button className="small-btn" disabled={loading} onClick={a.localScanObscureDerivedWords}>
                        扫描冷僻/派生词
                      </button>
                      <button className="small-btn danger" disabled={loading} onClick={a.localDeleteObscureDerivedWords}>
                        删除冷僻/派生词
                      </button>
                    </div>
                  </details>
    
                  <details className="ai-tools-box">
                    <summary>音频工具</summary>
                    <p className="ai-warning">
                      当前全站只使用 <strong>Edge 兜底发音</strong>（单词/词组/例句同一规则）。真人发音已停用，避免规则混乱。
                    </p>
                    <div className="ai-tool-explain">
                      <p><strong>继续补全兜底音频：</strong>仅生成 Edge TTS 缓存，包含例句和词组，支持断点续跑。</p>
                      <p><strong>删除兜底发音缓存：</strong>清空临时 Edge 缓存；下次播放会重新生成。</p>
                    </div>
                    <div className="duplicate-box">
                      <div><strong>兜底缓存：</strong>{audioCacheStats ? `${audioCacheStats.files?.fallback || 0} 个文件 / 索引 ${audioCacheStats.index?.fallback || 0} 条` : "未读取"}</div>
                      <div className="muted">
                        {audioCacheStats
                          ? `占用：兜底 ${Math.round((audioCacheStats.bytes?.fallback || 0) / 1024)} KB（遗留真人缓存不再用于播放）`
                          : "点击“刷新缓存统计”查看当前 .audio-cache 状态。"}
                      </div>
                    </div>
                    <div className="action-grid">
                      <button className="small-btn ghost" disabled={loading} onClick={() => a.refreshAudioCacheStats?.()}>
                        刷新缓存统计
                      </button>
                      <button className="small-btn danger" disabled={loading} onClick={a.cleanupFallbackAudioCache}>
                        删除兜底发音缓存
                      </button>
                      <button className="small-btn" disabled={loading} onClick={a.prefillWordAudio}>
                        继续补全兜底音频
                      </button>
                      <button className="small-btn warm" disabled={loading} onClick={a.rebuildMissingAudioFromStart}>
                        从头补全兜底音频
                      </button>
                      <button className="small-btn ghost" disabled={loading} onClick={() => a.clearAudioPrefillCursor?.(true)}>
                        重置兜底音频补全进度
                      </button>
                      <button className="small-btn" disabled={loading} onClick={a.dedupeLocalAudio}>
                        本地清理重复音频
                      </button>
                    </div>
                  </details>
    
                  <details className="ai-tools-box">
                    <summary>救急 / 存储</summary>
                    <p className="ai-warning">
                      词库数量异常、浏览器空间不足、缓存出错时才用。恢复成功前不要发布。
                    </p>
                    <div className="action-grid">
                      <button className="small-btn warm" disabled={loading} onClick={a.recoverWordsFromLocalFiles}>
                        紧急恢复词库-本地
                      </button>
                      <button className="small-btn warm" disabled={loading} onClick={a.recoverWordsFromTencentCloud}>
                        紧急恢复词库-腾讯云
                      </button>
                      <button className="small-btn danger" disabled={loading} onClick={a.cleanBrowserStorageNow}>
                        清理浏览器存储空间
                      </button>
                    </div>
                  </details>
    
                  <details className="ai-tools-box">
                    <summary>其他导出</summary>
                    <p className="ai-warning">
                      JSON 主要给开发/排错使用；普通备份优先用“下载完整词库备份”。
                    </p>
                    <div className="action-grid">
                      <button className="small-btn ghost" disabled={loading} onClick={a.downloadBlankVocabTemplateJson}>
                        下载基础模板JSON
                      </button>
                      <button className="small-btn ghost" onClick={a.exportJSON}>
                        导出 JSON
                      </button>
                    </div>
                  </details>
    
                  <details
                    className="ai-tools-box"
                    id="ai-tools"
                    ref={aiToolsRef}
                    open={aiToolsOpen}
                    onToggle={(event) => {
                      onAiToolsOpenChange?.(event.currentTarget.open);
                    }}
                  >
                    <summary>AI工具（会扣费）</summary>
                    <div className="ai-warning">
                      AI 分成四个实用入口：快速补全 100×5、慢速补全+修错字 10×1、逐个补全+查错词 1×1、稳定修错 10×2。所有按钮都会调用 DeepSeek API，可能扣费。
                    </div>
                    <div className="ai-tool-explain">
                      <p><strong>AI处理当前词：</strong>只处理当前这一个词，适合单个词释义、例句、搭配等明显需要重做时使用。</p>
                      <p><strong>AI快速补全缺失资料 100×5：</strong>只补缺失资料，不修错词。适合导入基础模板后批量补搭配、词形、词族、分类和难度，速度快。</p>
                      <p><strong>AI慢速补全+修错字 10×1：</strong>补缺失资料，同时允许 AI 自动修正明显错字，例如 injur→injure。一次只跑一批，更慢但更稳。</p>
                      <p><strong>AI逐个补全+查错词 1×1：</strong>从待补全、未归类、疑似错词和截断词里读取，一次只处理一个词，不并发，允许修正 word，适合最后精修。</p>
                      <p><strong>AI稳定修复确定错词 10×2：</strong>只修确定错词。速度慢一点，但会自动重试，并把失败批次拆成单词级补救。</p>
                      <p><strong>AI修复当前单词符号：</strong>只修当前词条的 word 字段，比如 in/within、effect(s)，不动释义、例句、音标和搭配。</p>
                      <p><strong>AI整理分类/难度：</strong>只用于归纳 IELTS 用途、主题和难度；不建议用它重写释义和例句。</p>
                    </div>
                    <div className="action-grid">
                      <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.("AI处理当前词（会扣费）") && a.generateCurrent?.({ force: true })}>
                        {loading ? "处理中" : "AI处理当前词（会扣费）"}
                      </button>
                      <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.("AI快速补全缺失资料 100×5（会扣费）") && a.generateHundredByFiveBatch?.()}>
                        AI快速补全缺失资料 100×5（会扣费）
                      </button>
                      <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.("AI慢速补全+修错字 10×1（会扣费）") && a.aiSlowCompleteMissing10x1?.()}>
                        AI慢速补全+修错字 10×1（会扣费）
                      </button>
                      <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.("AI逐个补全+查错词 1×1（会扣费）") && a.aiCompletePendingAndUnclassifiedOneByOne?.()}>
                        AI逐个补全+查错词 1×1（会扣费）
                      </button>
                      <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.("AI稳定修复确定错词 10×2（会扣费）") && a.aiStableRepairWrongWords10x2?.()}>
                        AI稳定修复确定错词 10×2（会扣费）
                      </button>
                      <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.("AI修复当前单词符号（会扣费）") && a.aiRepairCurrentWordSymbol?.()}>
                        AI修复当前单词符号（会扣费）
                      </button>
                      <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.("AI整理分类/难度（会扣费）") && a.categorizeWords?.()}>
                        AI整理分类/难度（会扣费）
                      </button>
                    </div>
                  </details>
    
                  <div className="audio-stat-box">
                    单词音频：有 {audioStats.has} · 没有 {audioStats.missing} · 未检查 {audioStats.unchecked} · 总数 {audioStats.total}
                  </div>
    
                  <div className="hint">
                    “一键本地优化”不调用 DeepSeek：会按顺序完成本地整理、本地去重、本地归并词形，并保留复数/过去式/过去分词/词族提示。
                  </div>
                  <div className="hint">
                    “导出静态网站”会打包 index.html、words.json 和本地发音缓存；音频补全支持断点续跑。
                  </div>
                  <div className="hint">
                    AI 工具区只保留 4 个按钮，点击前会二次确认；音频补全已经从 AI 功能中分离。
                  </div>
                  {batchInfo ? <div className="status-line">{batchInfo}</div> : null}
                  {duplicateInfo ? <div className="duplicate-box">{duplicateInfo}</div> : null}
                </div>
              </details>
  );
}
