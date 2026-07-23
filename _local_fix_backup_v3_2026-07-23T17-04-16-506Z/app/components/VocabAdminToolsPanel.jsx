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
  aiRunState = null,
  qualityStats = {},
  pendingAiCount = 0,
  duplicateInfo = "",
  isExternalIdictationItem = false,
  summaryLabel = "工具",
  showAiTools = true,
  actions = {}
}) {
  const a = actions;
  const continuousActive = ["running", "stopping"].includes(aiRunState?.status);
  const continuousModeLabel = aiRunState?.mode === "enrichment" ? "连续丰富" : "连续补全";
  const continuousStatusLabel = {
    running: `${continuousModeLabel}运行中`,
    stopping: "正在安全停止",
    completed: `${continuousModeLabel}已完成`,
    "completed-with-failures": "仍有失败词待处理",
    stopped: `${continuousModeLabel}已停止`,
    fused: "已触发失败熔断",
    limit: "已到安全轮次上限",
    failed: `${continuousModeLabel}失败`
  }[aiRunState?.status] || "";
  const continuousTotal = Math.max(0, Number(aiRunState?.initialRemaining) || 0);
  const continuousResolved = Math.min(
    continuousTotal,
    Math.max(0, continuousTotal - (Number(aiRunState?.remaining) || 0))
  );

  return (
              <details
                className="menu"
                ref={toolsMenuRef}
                open={toolsOpen}
                onToggle={(event) => {
                  onToolsOpenChange?.(event.currentTarget.open);
                }}
              >
                <summary className="top-pill">{summaryLabel}</summary>
                <div className="menu-panel">
                  <h2 className="panel-title">{summaryLabel}</h2>
                  <p className="panel-desc">本地管理工具默认推荐；危险操作继续保留确认与备份提示。</p>
    
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
                    <div className="ai-tool-explain">
                      <p><strong>本地规整规则：</strong>只使用已经人工审核并写入的 forms、wordFamily、baseWord、baseWordId 和 reference 关系。</p>
                      <p>不按 s/es、ed、ing、er、est、en、ind 或其他后缀猜词根；保留词条 ID、学习状态、收藏和复习进度。派生词扫描只列人工审核候选，不自动删除。</p>
                    </div>
                    <div className="action-grid">
                      <button className="small-btn local-main" disabled={loading} onClick={a.localOptimizeWordList} title="规范格式 → 完全同名去重 → 按已存元数据校验人工词形关系">
                        安全本地规整（推荐）
                      </button>
                      <button className="small-btn" disabled={loading} onClick={a.localCleanWordList}>
                        仅规范词条格式
                      </button>
                      <button className="small-btn" disabled={loading} onClick={a.localDedupeWords}>
                        仅合并完全同名
                      </button>
                      <button className="small-btn" disabled={loading} onClick={a.localMergeWordForms}>
                        校验人工词形关系
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
                      <button className="small-btn ghost" disabled={loading} onClick={a.clearWrongAiRepairFlags}>
                        清除错误AI修复标记
                      </button>
                      <button className="small-btn" disabled={loading} onClick={a.localScanObscureDerivedWords}>
                        审核冷僻/派生词（只扫描）
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
    
                  {showAiTools ? <details
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
                      默认付费队列只处理必须补全、结构异常和分类缺失。搭配数量不足只算“可选丰富”，不会自动重写整个词库。
                    </div>
                    <div className="duplicate-box">
                      <div><strong>必须补全：</strong>{qualityStats.missing || 0}</div>
                      <div><strong>结构异常：</strong>{qualityStats.repairMissing || 0}</div>
                      <div><strong>仅缺分类：</strong>{qualityStats.classifyMissing || 0}</div>
                      <div><strong>可选丰富：</strong>{qualityStats.enrichmentThin || 0}（不进入默认付费队列）</div>
                      <div><strong>词族复核 / 独立词候选：</strong>{qualityStats.familyReview || 0} / {qualityStats.familyPromotion || 0}</div>
                    </div>
                    <div className="ai-tool-explain">
                      <p><strong>单词级：</strong>只重做当前词的完整 AI 内容，保留 ID、学习状态和收藏。</p>
                      <p><strong>单轮补全：</strong>最多 100 词；每请求 5 词、最多 3 路并发，完成后停止。</p>
                      <p><strong>连续补全：</strong>逐轮处理剩余队列，每轮保存检查点；停止后下次从最新队列继续。</p>
                      <p><strong>异常重做：</strong>按字段精准修复，保留词形、词族、ID、收藏和学习进度。</p>
                      <p><strong>可选丰富：</strong>只合并自然搭配与句型，最多 4+4；不覆盖释义、例句、分类或词族。</p>
                    </div>
                    <div className="action-grid">
                      <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.("AI处理当前词（会扣费）") && a.generateCurrent?.({ force: true })}>
                        {loading ? "处理中" : "AI处理当前词（会扣费）"}
                      </button>
                      <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.("AI修复必须补全项：最多100词 / 5词每请求 / 3路并发（会扣费）") && a.generateHundredByFiveBatch?.()}>
                        修复必须项 · 最多100词
                      </button>
                      <button
                        className="small-btn ai-paid ai-continuous-start"
                        disabled={loading}
                        onClick={() => a.confirmAiCost?.(
                          `AI连续修复必须补全项：当前约 ${pendingAiCount} 词；可选丰富不会进入本队列。每轮最多100词，直到队列完成、手动停止或触发失败熔断（会持续扣费）`
                        ) && a.startContinuousAiCompletion?.()}
                      >
                        连续修复必须项 · 可暂停
                      </button>
                      <button
                        className="small-btn ai-stop"
                        disabled={!continuousActive}
                        onClick={a.stopContinuousAiCompletion}
                      >
                        {aiRunState?.status === "stopping" ? "正在停止..." : "停止连续任务"}
                      </button>
                      <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.("AI精准修复结构异常：最多100词 / 每请求5词 / 2并发；不改词族和学习状态（会扣费）") && a.aiStableRepairWrongWords10x2?.()}>
                        精准修复结构异常 · 最多100词
                      </button>
                      <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.(`AI丰富可选词条：当前约 ${qualityStats.enrichmentThin || 0} 词；本轮最多100词，只补搭配和句型（会扣费）`) && a.enrichOptionalBatch?.()}>
                        丰富可选项 · 最多100词
                      </button>
                      <button className="small-btn ai-paid ai-continuous-start" disabled={loading} onClick={() => a.confirmAiCost?.(`AI连续丰富可选词条：当前约 ${qualityStats.enrichmentThin || 0} 词；逐轮处理，可随时停止（会持续扣费）`) && a.startContinuousAiEnrichment?.()}>
                        连续丰富可选项 · 可暂停
                      </button>
                    </div>
                    {continuousStatusLabel ? (
                      <div className={`ai-run-status ai-run-status--${aiRunState.status}`} role="status">
                        <div className="ai-run-status-head">
                          <strong>{continuousStatusLabel}</strong>
                          <span>第 {aiRunState.rounds || 0} 轮</span>
                        </div>
                        {continuousTotal ? (
                          <progress value={continuousResolved} max={continuousTotal}>
                            {continuousResolved} / {continuousTotal}
                          </progress>
                        ) : null}
                        <div className="ai-run-metrics">
                          <span>已补全 {aiRunState.filled || 0}</span>
                          <span>失败待处理 {aiRunState.blocked ?? aiRunState.failed ?? 0}</span>
                          <span>真实剩余 {aiRunState.remaining || 0}</span>
                        </div>
                        {aiRunState.error ? <p>{aiRunState.error}</p> : null}
                      </div>
                    ) : null}
                    <details className="ai-tool-advanced">
                      <summary>高级修复与分类</summary>
                      <div className="action-grid">
                        <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.("AI修复当前单词符号（会扣费）") && a.aiRepairCurrentWordSymbol?.()}>
                          AI修复当前词头符号
                        </button>
                        <button className="small-btn ai-paid" disabled={loading} onClick={() => a.confirmAiCost?.("AI仅补分类/难度（会扣费）") && a.categorizeWords?.()}>
                          AI仅补分类 / 难度
                        </button>
                      </div>
                    </details>
                  </details> : null}
    
                  <div className="audio-stat-box">
                    {audioStats.state === "error"
                      ? "单词音频：缓存核对失败，请刷新统计后重试"
                      : audioStats.state !== "ready"
                      ? "单词音频：正在核对本地缓存..."
                      : `单词音频：有 ${audioStats.has} · 没有 ${audioStats.missing} · 未检查 ${audioStats.unchecked} · 总数 ${audioStats.total}`}
                  </div>
    
                  <div className="hint">
                    “安全本地规整”不调用 DeepSeek：无实际变化时不会改写本地词库，也不会重置当前学习会话。
                  </div>
                  <div className="hint">
                    “导出静态网站”会打包 index.html、words.json 和本地发音缓存；音频补全支持断点续跑。
                  </div>
                  {showAiTools ? <div className="hint">
                    AI 工具区提供 4 个主要入口和 2 个高级入口，付费操作前会二次确认；音频补全已经从 AI 功能中分离。
                  </div> : null}
                  {batchInfo ? <div className="status-line">{batchInfo}</div> : null}
                  {duplicateInfo ? <div className="duplicate-box">{duplicateInfo}</div> : null}
                </div>
              </details>
  );
}
