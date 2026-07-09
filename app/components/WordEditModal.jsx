"use client";

/**
 * Word edit modal extracted from app/page.jsx (I3.2).
 */
export default function WordEditModal({
  open = false,
  draft = null,
  onClose,
  onChangeField,
  onSave
}) {
  if (!open || !draft) return null;

  return (
    <div className="edit-overlay">
      <div className="edit-word-card">
        <div className="edit-head">
          <div>
            <h2>修改当前单词</h2>
            <p>只改当前这个词。保存后本地词库会更新，重新导出静态站会带上修改。</p>
          </div>
          <button className="edit-close" onClick={onClose} type="button">×</button>
        </div>

        <div className="edit-grid">
          <label>
            英文
            <input value={draft.word} onChange={(event) => onChangeField?.("word", event.target.value)} />
          </label>
          <label>
            音标
            <input value={draft.phonetic} onChange={(event) => onChangeField?.("phonetic", event.target.value)} />
          </label>
          <label>
            词性
            <input value={draft.pos} onChange={(event) => onChangeField?.("pos", event.target.value)} />
          </label>
          <label>
            难度
            <input value={draft.difficulty} onChange={(event) => onChangeField?.("difficulty", event.target.value)} />
          </label>
          <label className="wide-field">
            中文释义
            <textarea value={draft.meaning} onChange={(event) => onChangeField?.("meaning", event.target.value)} />
          </label>
          <label className="wide-field">
            例句
            <textarea value={draft.example} onChange={(event) => onChangeField?.("example", event.target.value)} />
          </label>
          <label className="wide-field">
            例句中文
            <textarea value={draft.exampleCn} onChange={(event) => onChangeField?.("exampleCn", event.target.value)} />
          </label>
          <label className="wide-field">
            常见搭配（一行一个，格式：public transport = 公共交通）
            <textarea value={draft.collocationsText} onChange={(event) => onChangeField?.("collocationsText", event.target.value)} />
          </label>
          <label className="wide-field">
            短语 / 介词搭配（一行一个，格式：in public = 公开地）
            <textarea value={draft.phraseCollocationsText} onChange={(event) => onChangeField?.("phraseCollocationsText", event.target.value)} />
          </label>
          <label className="wide-field">
            听力形式 / 重要变形（一行一个，格式：experienced | 过去式 / 过去分词 | 规则过去式）
            <textarea value={draft.formsText} onChange={(event) => onChangeField?.("formsText", event.target.value)} />
          </label>
          <label className="wide-field">
            词族 / 派生词（一行一个，格式：experience | noun 名词 | 经验）
            <textarea value={draft.wordFamilyText} onChange={(event) => onChangeField?.("wordFamilyText", event.target.value)} />
          </label>
          <label>
            IELTS 用途（逗号分隔）
            <input value={draft.ieltsUseText} onChange={(event) => onChangeField?.("ieltsUseText", event.target.value)} />
          </label>
          <label>
            主题（逗号分隔）
            <input value={draft.topicsText} onChange={(event) => onChangeField?.("topicsText", event.target.value)} />
          </label>
        </div>

        <div className="edit-actions">
          <button className="small-btn ghost" type="button" onClick={onClose}>取消</button>
          <button className="small-btn primary" type="button" onClick={onSave}>保存修改</button>
        </div>
      </div>
    </div>
  );
}
