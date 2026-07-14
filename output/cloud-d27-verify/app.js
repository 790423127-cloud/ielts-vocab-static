const APP_VERSION="20260714_d27_action_dock_stability_v1";
const IDICTATION_ENTRY_COUNTS={listening:3906,reading:3396};
const PROGRESS_KEY="static_vocab_progress_v15_entry_edgetts_cache_fallback";
const OLD_WORDS_KEY="static_vocab_words_v1";
const OLD_SESSION_KEY="static_vocab_session_v1";
const AUDIO_CACHE_NAME="static_vocab_audio_"+APP_VERSION;
const CLOUDBASE_SYNC_CODE_KEY="static_vocab_cloudbase_sync_code_v1";
const TOP_TOOLS_PREF_PREFIX="static_vocab_top_tools_collapsed_v1_";
const CLOUDBASE_SDK_URLS=[
  // CloudBase JS SDK 2.x：旧版 1.x 会触发 ACCESS_TOKEN_DISABLED。
  "https://static.cloudbase.net/cloudbase-js-sdk/2.12.1/cloudbase.full.js",
  "https://static.cloudbase.net/cloudbase-js-sdk/2.8.1/cloudbase.full.js",
  "https://static.cloudbase.net/cloudbase-js-sdk/2.0.0/cloudbase.full.js",
  "https://cdn.jsdelivr.net/npm/@cloudbase/js-sdk@2.12.1/dist/index.umd.js",
  "https://unpkg.com/@cloudbase/js-sdk@2.12.1/dist/index.umd.js"
];

let words=[];
let idictationPayload=null;
let filter="all";
let index=0;
let audio=null;
let mobileMode=false;
let saveTimer=null;
let audioUrlCache=new Map();
let progress={statuses:{},currentWord:"",filter:"all",mobileMode:false,updatedAt:0,deviceId:"",positions:{}};
let cloudbaseApp=null;
let cloudbaseDb=null;
let cloudbaseAuth=null;
let cloudbaseReady=false;
let cloudbaseSyncCode="";
let cloudbaseDocId="";
let vocabId="";
let cloudSyncTimer=null;
let cloudPullTimer=null;
let lastAutoCloudPullAt=0;
let restoreFocusWord="";
let holdStepTimer=null;
let holdStepDelayTimer=null;
let holdStepDir=0;
let holdTouchActive=false;
let suppressNextSwipe=false;

const els={
  top:document.querySelector(".top"),
  topActions:document.getElementById("topActions"),
  topToolsToggle:document.getElementById("topToolsToggle"),
  word:document.getElementById("word"),
  basic:document.getElementById("basic"),
  loadInfo:document.getElementById("loadInfo"),
  example:document.getElementById("example"),
  exampleCn:document.getElementById("exampleCn"),
  exampleSoundBtn:document.getElementById("exampleSoundBtn"),
  formsBox:document.getElementById("formsBox"),
  formsList:document.getElementById("formsList"),
  familyBox:document.getElementById("familyBox"),
  familyList:document.getElementById("familyList"),
  collocations:document.getElementById("collocations"),
  phraseCollocations:document.getElementById("phraseCollocations"),
  count:document.getElementById("count"),
  progressFill:document.getElementById("progressFill"),
  favoriteBtn:document.getElementById("favoriteBtn"),
  unknownBtn:document.getElementById("unknownBtn"),
  unfamiliarAlert:document.getElementById("unfamiliarAlert"),
  toast:document.getElementById("toast"),
  filterSelect:document.getElementById("filterSelect"),
  mobileModeBtn:document.getElementById("mobileModeBtn"),
  swipeArea:document.getElementById("swipeArea"),
  syncBtn:document.getElementById("syncBtn"),
  syncPanel:document.getElementById("syncPanel"),
  syncCloseBtn:document.getElementById("syncCloseBtn"),
  syncStatus:document.getElementById("syncStatus"),
  syncCodeInput:document.getElementById("syncCodeInput"),
  syncConnectBtn:document.getElementById("syncConnectBtn"),
  syncPullBtn:document.getElementById("syncPullBtn"),
  syncPushBtn:document.getElementById("syncPushBtn"),
  syncDisconnectBtn:document.getElementById("syncDisconnectBtn"),
  entryBtn:document.getElementById("entryBtn"),
  entryPanel:document.getElementById("entryPanel"),
  entryCloseBtn:document.getElementById("entryCloseBtn"),
  entryStatus:document.getElementById("entryStatus"),
  entryList:document.getElementById("entryList"),
  editWordBtn:document.getElementById("editWordBtn"),
  deleteWordBtn:document.getElementById("deleteWordBtn"),
  editPanel:document.getElementById("editPanel"),
  editCloseBtn:document.getElementById("editCloseBtn"),
  editCancelBtn:document.getElementById("editCancelBtn"),
  editSaveBtn:document.getElementById("editSaveBtn"),
  editWord:document.getElementById("editWord"),
  editPhonetic:document.getElementById("editPhonetic"),
  editPos:document.getElementById("editPos"),
  editDifficulty:document.getElementById("editDifficulty"),
  editMeaning:document.getElementById("editMeaning"),
  editExample:document.getElementById("editExample"),
  editExampleCn:document.getElementById("editExampleCn"),
  editCollocations:document.getElementById("editCollocations"),
  editPhraseCollocations:document.getElementById("editPhraseCollocations"),
  editForms:document.getElementById("editForms"),
  editWordFamily:document.getElementById("editWordFamily"),
  editIeltsUse:document.getElementById("editIeltsUse"),
  editTopics:document.getElementById("editTopics")
};

function norm(v){return String(v||"").trim().toLowerCase().replace(/\s+/g," ")}
function arr(v){return Array.isArray(v)?v:[]}
function uniq(values){return Array.from(new Set(values.map(x=>String(x||"").trim()).filter(Boolean)))}
function escapeHtml(v){return String(v||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}


function filterLabel(value){
  if(value==="all")return "今日任务 / 全部待学";
  if(value==="everything")return "全部单词";
  if(value==="unfamiliar")return "不熟词库";
  if(value==="familiar")return "熟悉词库";
  if(value==="favorite")return "收藏词";
  if(value==="life-work")return "生活/工作高频";
  if(value==="idictation:listening")return "爱听写听力";
  if(value==="idictation:reading")return "爱听写阅读";
  if(value.indexOf("ielts:")===0)return value.slice(6);
  if(value.indexOf("topic:")===0)return value.slice(6);
  if(value.indexOf("difficulty:")===0)return value.slice(11);
  return "全部待学";
}

function isLifeWorkWord(w){
  const uses=arr(w.ieltsUse);
  const topics=arr(w.topics);
  return uses.includes("生活高频")||uses.includes("工作高频")||topics.some(function(x){return ["工作","住房","交通","健康","消费","旅行","社区","公共服务"].includes(x)});
}

function isIdictationFilter(value){
  return value==="idictation:listening"||value==="idictation:reading";
}

function getIdictationSource(key){
  return idictationPayload&&idictationPayload.sources?idictationPayload.sources[key]||null:null;
}

function buildLibraryWordMap(){
  const map=new Map();
  words.forEach(function(w){
    const key=norm(w.word);
    if(key&&!map.has(key)) map.set(key,w);
  });
  return map;
}

function findIdictationLibraryWord(entry,lookup){
  const candidates=[entry.word,entry.expectedAnswer].concat(arr(entry.acceptedAnswers)).map(norm).filter(Boolean);
  for(let i=0;i<candidates.length;i++){
    const matched=lookup.get(candidates[i]);
    if(matched) return matched;
  }
  return null;
}

function buildIdictationFlashWords(sourceKey){
  const source=getIdictationSource(sourceKey);
  if(!source||!source.entries||!source.entries.length) return [];
  const lookup=buildLibraryWordMap();
  return source.entries.map(function(entry,sourceIndex){
    const libraryWord=findIdictationLibraryWord(entry,lookup);
    const answerText=arr(entry.acceptedAnswers).length?entry.acceptedAnswers.join(" / "):(entry.expectedAnswer||"");
    const frequencyLabel=entry.frequencyGroupLabel||((entry.frequency||0)+"次");
    const statusKey=norm(entry.word);
    const saved=(progress.statuses||{})[statusKey]||{};
    return {
      id:entry.id,
      word:entry.word,
      phonetic:entry.phonetic||libraryWord?.phonetic||"",
      pos:libraryWord?.pos||"word",
      meaning:entry.meaning||libraryWord?.meaning||answerText||frequencyLabel,
      definition:libraryWord?.definition||answerText||entry.meaning||"",
      example:entry.example||libraryWord?.example||"",
      exampleCn:entry.exampleCn||libraryWord?.exampleCn||"",
      collocations:arr(libraryWord?.collocations),
      phraseCollocations:arr(libraryWord?.phraseCollocations),
      ieltsUse:arr(libraryWord?.ieltsUse).length?libraryWord.ieltsUse:[entry.sourceLabel].filter(Boolean),
      topics:arr(libraryWord?.topics).length?libraryWord.topics:[frequencyLabel].filter(Boolean),
      difficulty:libraryWord?.difficulty||frequencyLabel,
      category:libraryWord?.category||entry.sourceLabel||"爱听写",
      status:saved.status||"",
      favorite:!!saved.favorite,
      forms:arr(libraryWord?.forms),
      wordFamily:arr(libraryWord?.wordFamily),
      audio:libraryWord?.audio||"",
      exampleAudio:libraryWord?.exampleAudio||"",
      originalIndex:sourceIndex,
      __idictationFlash:true
    };
  });
}

function activePool(){
  if(isIdictationFilter(filter)) return buildIdictationFlashWords(filter.slice(11));
  return words;
}

function countForFilter(activeFilter){
  if(isIdictationFilter(activeFilter)){
    const key=activeFilter.slice(11);
    const pool=buildIdictationFlashWords(key);
    if(pool.length) return pool.filter(function(w){return passFilterWith(activeFilter,w)}).length;
    return IDICTATION_ENTRY_COUNTS[key]||0;
  }
  return words.filter(function(w){return passFilterWith(activeFilter,w)}).length;
}

async function ensureIdictationPayload(){
  if(idictationPayload&&idictationPayload.sources) return idictationPayload;
  try{
    const res=await fetch("./data/idictation-frequency.json?v="+APP_VERSION,{cache:"no-store"});
    if(res.ok) idictationPayload=await res.json();
  }catch(e){}
  return idictationPayload;
}

const ENTRY_GROUPS=[
  {title:"爱听写独立入口",highlight:true,items:[
    {title:"爱听写听力",desc:"按听力答案词和出现频率整理的独立刷词入口。",filter:"idictation:listening"},
    {title:"爱听写阅读",desc:"按阅读高频答案词和出现频率整理的独立刷词入口。",filter:"idictation:reading"}
  ]},
  {title:"今天优先",items:[
    {title:"今日任务",desc:"快速扫待学词 + 复习不熟词。",filter:"all"},
    {title:"不熟词",desc:"所有标记不熟的词，优先复习。",filter:"unfamiliar"},
    {title:"收藏词",desc:"写作、口语、书信可直接用的重点词。",filter:"favorite"}
  ]},
  {title:"IELTS G 类用途",items:[
    {title:"G类书信",desc:"投诉、申请、预约、感谢、道歉、解释。",filter:"ielts:G类书信"},
    {title:"Listening",desc:"听力生活场景词，优先听音频反应。",filter:"ielts:Listening"},
    {title:"Speaking",desc:"口语可用表达，适合造句。",filter:"ielts:Speaking"},
    {title:"Reading",desc:"阅读识别为主，不要求全会写。",filter:"ielts:Reading"},
    {title:"Task 2",desc:"社会、教育、环境、科技观点词。",filter:"ielts:Task 2"},
    {title:"生活/工作高频",desc:"住房、交通、健康、消费、工作。",filter:"life-work"}
  ]},
  {title:"难度层级",items:[
    {title:"基础必会",desc:"必须快速认出，适合每天扫。",filter:"difficulty:基础高频"},
    {title:"核心高频",desc:"雅思主力词，优先变熟悉。",filter:"difficulty:中级核心"},
    {title:"高级认识",desc:"认识即可，不要花太久。",filter:"difficulty:高级加分"},
    {title:"全部单词",desc:"总仓库，包含熟悉词。",filter:"everything"}
  ]}
];

function rememberPositionForCurrentFilter(){
  const w=currentRaw();
  if(!w||!w.word)return;
  progress.positions=progress.positions||{};
  progress.positions[filter]=norm(w.word);
}

function poolForFilter(activeFilter){
  if(isIdictationFilter(activeFilter)) return buildIdictationFlashWords(activeFilter.slice(11));
  return words;
}

function list(activeFilter){
  const f=activeFilter||filter;
  const pool=poolForFilter(f);
  return pool.map(function(w,i){return Object.assign({},w,{originalIndex:i})}).filter(function(w){return passFilterWith(f,w)});
}

function resolveIndexForFilter(activeFilter,options){
  const opts=options||{};
  const allowFirstFallback=opts.allowFirstFallback!==false;
  const f=activeFilter||filter||"all";
  const pool=poolForFilter(f);
  const saved=(progress.positions||{})[f]||"";
  let found=-1;

  if(saved){
    found=pool.findIndex(function(w){return norm(w.word)===saved&&passFilterWith(f,w)});
    if(found<0){
      found=pool.findIndex(function(w){return norm(w.word)===saved});
    }
  }

  if(found<0&&progress.currentWord){
    const currentKey=norm(progress.currentWord);
    found=pool.findIndex(function(w){return norm(w.word)===currentKey&&passFilterWith(f,w)});
    if(found<0){
      found=pool.findIndex(function(w){return norm(w.word)===currentKey});
    }
  }

  if(found<0&&allowFirstFallback){
    const l=list(f);
    found=l.length?l[0].originalIndex:-1;
  }

  return found;
}

function applyIndexForFilter(activeFilter,options){
  const found=resolveIndexForFilter(activeFilter,options);
  if(found>=0) index=found;
}

function switchFilter(nextFilter){
  restoreFocusWord="";
  rememberPositionForCurrentFilter();
  filter=nextFilter||"all";
  progress.filter=filter;
  applyIndexForFilter(filter);
  render();
  persistNow();
  scheduleCloudSync();
}





function simpleHashText(text){
  const s=String(text||"");
  let h1=2166136261;
  let h2=16777619;
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i);
    h1^=c;
    h1=Math.imul(h1,16777619);
    h2=(Math.imul(h2,31)+c)>>>0;
  }
  return ((h1>>>0).toString(16).padStart(8,"0")+(h2>>>0).toString(16).padStart(8,"0"));
}

function computeVocabId(list){
  const arr=Array.isArray(list)?list:[];
  const sample=[];
  sample.push("count:"+arr.length);
  for(let i=0;i<arr.length;i++){
    const w=arr[i]||{};
    if(i<80||i>=arr.length-80||i%97===0){
      sample.push([
        i,
        norm(w.word||""),
        String(w.pos||"").trim(),
        String(w.meaning||w.definition||"").trim().slice(0,80)
      ].join("|"));
    }
  }
  return "vocab_"+arr.length+"_"+simpleHashText(sample.join("\n"));
}

function getVocabId(){
  if(!vocabId) vocabId=computeVocabId(words);
  return vocabId;
}

function safeLsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function safeLsSet(k,v){try{localStorage.setItem(k,v);return true}catch(e){console.warn("localStorage full",k,e);return false}}
function safeLsRemove(k){try{localStorage.removeItem(k)}catch(e){}}

function splitListText(v){
  return String(v||"").split(/[\n,，;；]+/).map(function(x){return x.trim()}).filter(Boolean);
}
function phraseItemsToText(items){
  if(!Array.isArray(items))return "";
  return items.map(function(item){
    if(typeof item==="string")return item;
    const phrase=item.phrase||item.word||"";
    const meaning=item.meaning||item.chinese||item.cn||"";
    return meaning?phrase+" = "+meaning:phrase;
  }).filter(Boolean).join("\n");
}
function formsToText(items){
  if(!Array.isArray(items))return "";
  return items.map(function(item){
    const word=item.word||"";
    const type=item.type||item.label||"";
    const note=item.note||item.meaning||item.chinese||item.cn||"";
    return [word,type,note].filter(Boolean).join(" | ");
  }).filter(Boolean).join("\n");
}
function parsePhraseItems(v){
  return String(v||"").split(/\n+/).map(function(line){return line.trim()}).filter(Boolean).map(function(line){
    const parts=line.split(/\s*=\s*/);
    return {phrase:(parts[0]||"").trim(),meaning:(parts[1]||"").trim(),chinese:(parts[1]||"").trim()};
  }).filter(function(x){return x.phrase});
}
function parseFormItems(v){
  return String(v||"").split(/\n+/).map(function(line){return line.trim()}).filter(Boolean).map(function(line){
    const parts=line.split(/\s*\|\s*/);
    return {word:(parts[0]||"").trim(),type:(parts[1]||"").trim(),note:(parts[2]||"").trim(),meaning:(parts[2]||"").trim(),chinese:(parts[2]||"").trim()};
  }).filter(function(x){return x.word});
}
function loadWordEdits(){
  try{
    const data=JSON.parse(safeLsGet("static_vocab_word_edits_v1")||"{}");
    return data&&typeof data==="object"?data:{};
  }catch(e){
    safeLsRemove("static_vocab_word_edits_v1");
    return {};
  }
}
function saveWordEdit(baseKey,word){
  const edits=loadWordEdits();
  const key=baseKey||norm(word.word);
  edits[key]=word;
  safeLsSet("static_vocab_word_edits_v1",JSON.stringify(edits));
}
function applyWordEdits(list){
  const edits=loadWordEdits();
  return list.map(function(w){
    const key=norm(w.word);
    const edited=edits[key];
    return edited?Object.assign({},w,edited,{editBaseKey:key}):w;
  });
}
function saveWordsToLocal(){
  const w=words[index];
  if(!w)return;
  saveWordEdit(w.editBaseKey||norm(w.word),w);
  // 旧版本保存过完整 10000 词，太大，清掉避免 quota。
  safeLsRemove("static_vocab_words_v1");
}
function loadDeletedWords(){
  try{
    const data=JSON.parse(safeLsGet("static_vocab_deleted_words_v1")||"{}");
    return data&&typeof data==="object"?data:{};
  }catch(e){
    safeLsRemove("static_vocab_deleted_words_v1");
    return {};
  }
}
function saveDeletedWord(baseKey){
  if(!baseKey)return;
  const deleted=loadDeletedWords();
  deleted[baseKey]=Date.now();
  safeLsSet("static_vocab_deleted_words_v1",JSON.stringify(deleted));
}
function applyDeletedWords(list){
  const deleted=loadDeletedWords();
  return list.filter(function(w){return !deleted[norm(w.word)]});
}
function deleteCurrentWord(){
  const w=currentRaw();
  if(!w){toast("没有当前单词");return}
  const baseKey=w.editBaseKey||norm(w.word);
  if(!baseKey){toast("当前单词无效，无法删除");return}
  const sameCount=words.filter(function(item){return norm(item.word)===baseKey}).length;
  if(!confirm("确定删除这个单词？\n\n"+w.word+"\n\n将从本机词库隐藏/删除 "+sameCount+" 条同名单词记录。电脑端正式删除后重新发布，会彻底移除。"))return;
  saveDeletedWord(baseKey);
  words=words.filter(function(item){return norm(item.word)!==baseKey});
  index=Math.min(index,Math.max(0,words.length-1));
  persistNow();
  render();
  toast("已删除："+w.word+"（"+sameCount+" 条记录）");
}
function openEditCurrentWord(){
  const w=currentRaw();
  if(!w){toast("没有当前单词");return}
  els.editWord.value=w.word||"";
  els.editPhonetic.value=w.phonetic||"";
  els.editPos.value=w.pos||"";
  els.editDifficulty.value=w.difficulty||"";
  els.editMeaning.value=w.meaning||"";
  els.editExample.value=w.example||"";
  els.editExampleCn.value=w.exampleCn||"";
  els.editCollocations.value=phraseItemsToText(w.collocations);
  els.editPhraseCollocations.value=phraseItemsToText(w.phraseCollocations);
  els.editForms.value=formsToText(w.forms);
  els.editWordFamily.value=formsToText(w.wordFamily);
  els.editIeltsUse.value=arr(w.ieltsUse).join("，");
  els.editTopics.value=arr(w.topics).join("，");
  els.editPanel.classList.remove("hidden");
}
function saveEditCurrentWord(){
  const old=words[index];
  if(!old)return;
  const baseKey=old.editBaseKey||norm(old.word);
  const next=Object.assign({},old,{
    word:String(els.editWord.value||"").trim()||old.word,
    phonetic:String(els.editPhonetic.value||"").trim(),
    pos:String(els.editPos.value||"").trim(),
    difficulty:String(els.editDifficulty.value||"").trim(),
    meaning:String(els.editMeaning.value||"").trim(),
    example:String(els.editExample.value||"").trim(),
    exampleCn:String(els.editExampleCn.value||"").trim(),
    collocations:parsePhraseItems(els.editCollocations.value),
    phraseCollocations:parsePhraseItems(els.editPhraseCollocations.value),
    forms:parseFormItems(els.editForms.value),
    wordFamily:parseFormItems(els.editWordFamily.value),
    ieltsUse:splitListText(els.editIeltsUse.value),
    topics:splitListText(els.editTopics.value),
    editBaseKey:baseKey,
    editedAt:Date.now()
  });
  words[index]=next;
  rememberPositionForCurrentFilter();
  saveWordsToLocal();
  persistNow();
  render();
  els.editPanel.classList.add("hidden");
  toast("已修改当前单词");
}


function getDeviceId(){
  try{
    let id=localStorage.getItem("static_vocab_device_id_v1");
    if(!id){
      id="device_"+Math.random().toString(36).slice(2)+"_"+Date.now();
      localStorage.setItem("static_vocab_device_id_v1",id);
    }
    return id;
  }catch(e){
    return "device_fallback_"+Math.random().toString(36).slice(2)+"_"+Date.now();
  }
}


function posAtomCn(atom){const t=String(atom||"").trim().toLowerCase();if(!t)return"";if(/^(proper\s*noun)$/.test(t))return"专有名词";if(/^(modal\s*verb|modal)$/.test(t))return"情态动词";if(/^(noun|n\.?)$/.test(t)||t.indexOf("noun")>=0)return"名词";if(/^(verb|v\.?)$/.test(t)||t.indexOf("verb")>=0)return"动词";if(/^(adjective|adj\.?)$/.test(t)||t.indexOf("adj")>=0)return"形容词";if(/^(adverb|adv\.?)$/.test(t)||t.indexOf("adv")>=0)return"副词";if(/phrase|短语/.test(t))return"短语";if(/preposition|^prep/.test(t))return"介词";if(/conjunction|^conj/.test(t))return"连词";if(/pronoun|^pron/.test(t))return"代词";if(/number|numeral/.test(t))return"数词";return""}
function posCn(pos=""){const raw=String(pos||"").trim();if(!raw)return"";const parts=raw.split(/\s*[\/,|&;·／、]\s*/);const out=[];const seen={};for(let i=0;i<parts.length;i++){const c=posAtomCn(parts[i]);if(c&&!seen[c]){seen[c]=1;out.push(c)}}return out.join("/")||posAtomCn(raw)}
function posDisplay(pos){if(!pos)return"词性";const c=posCn(pos);return c&&String(pos).indexOf(c)<0?pos+" "+c:pos}
function formTypeCn(type=""){const t=String(type).toLowerCase();if(t.includes("irregular plural"))return"不规则复数";if(t.includes("plural"))return"复数形式";if(t.includes("past tense / past participle"))return"过去式 / 过去分词";if(t.includes("past tense"))return"过去式";if(t.includes("past participle"))return"过去分词";if(t.includes("present participle"))return"-ing 形式";return type||"变形"}
function formHint(form){const cn=formTypeCn(form.type);if(cn==="复数形式")return"注意复数形式";if(cn==="不规则复数")return"注意不规则复数";if(cn==="过去式")return"注意过去式";if(cn==="过去分词")return"注意过去分词";if(cn==="过去式 / 过去分词")return"注意过去式 / 过去分词";if(cn==="-ing 形式")return"注意 -ing 形式";return form.note||""}

function toast(msg){els.toast.textContent=msg;els.toast.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(function(){els.toast.classList.remove("show")},1500)}

function cloudErrText(err){
  try{
    if(!err) return "unknown";
    if(typeof err==="string") return err;
    const parts=[];
    const keys=["code","errCode","errorCode","message","errMsg","msg","requestId","requestID"];
    keys.forEach(function(k){
      if(err[k]!==undefined&&err[k]!==null) parts.push(k+": "+String(err[k]));
    });
    if(err.error&&typeof err.error==="object"){
      ["code","message","errMsg"].forEach(function(k){
        if(err.error[k]!==undefined&&err.error[k]!==null) parts.push("error."+k+": "+String(err.error[k]));
      });
    }
    if(parts.length) return parts.join(" | ");
    const json=JSON.stringify(err);
    if(json&&json!=="{}") return json.slice(0,500);
    return Object.prototype.toString.call(err);
  }catch(e){
    return String(err);
  }
}

function setCloudError(prefix,err){
  const text=cloudErrText(err);
  if(text.indexOf("ACCESS_TOKEN_DISABLED")>=0){
    setSyncStatus(prefix+"：匿名登录未生效或 SDK 缓存过旧。请确认匿名登录已开启，然后清缓存刷新。",false);
  }else if(text.indexOf("INVALID_PARAM")>=0){
    setSyncStatus(prefix+"：参数错误，可能 envId / 地域 / 集合名不对。"+text,false);
  }else if(text.indexOf("unauthenticated")>=0||text.indexOf("credentials not found")>=0){
    setSyncStatus(prefix+"：匿名登录没有成功拿到凭证。手机请清缓存/无痕打开最新版，确认匿名登录已开启。原始错误："+text,false);
  }else if(text.indexOf("DATABASE")>=0||text.indexOf("permission")>=0||text.indexOf("PERMISSION")>=0){
    setSyncStatus(prefix+"：数据库权限或集合设置问题。"+text,false);
  }else{
    setSyncStatus(prefix+"："+text+"。手机如果失败，请清缓存或无痕打开最新版。",false);
  }
}


function currentRaw(){return activePool()[index]||null}

function persistNow(){
  try{
    const w=currentRaw();
    if(w){
      progress.currentWord=w.word||progress.currentWord||"";
      progress.currentWordUpdatedAt=Date.now();
      rememberPositionForCurrentFilter();
    }
    progress.filter=filter;
    progress.mobileMode=mobileMode;
    progress.updatedAt=Date.now();
    progress.deviceId=progress.deviceId||getDeviceId();
    safeLsSet(PROGRESS_KEY,JSON.stringify(progress));
  }catch(e){}
}

function persistSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(persistNow,120)}

function rememberWord(w){
  if(!w||!w.word)return;
  const now=Date.now();
  const key=norm(w.word);
  const old=(progress.statuses||{})[key]||{};
  progress.statuses=progress.statuses||{};
  progress.statuses[key]={
    status:w.status||"",
    favorite:!!w.favorite,
    updatedAt:now,
    deviceId:progress.deviceId||getDeviceId()
  };
  progress.updatedAt=now;
}

function loadProgress(){
  try{
    const saved=JSON.parse(localStorage.getItem(PROGRESS_KEY)||"null");
    if(saved&&typeof saved==="object"){
      progress={statuses:saved.statuses||{},currentWord:saved.currentWord||"",currentWordUpdatedAt:saved.currentWordUpdatedAt||0,filter:saved.filter||"all",mobileMode:!!saved.mobileMode,updatedAt:saved.updatedAt||0,deviceId:saved.deviceId||"",positions:saved.positions||{}};
    }
  }catch(e){}

  try{
    const old=JSON.parse(localStorage.getItem(OLD_WORDS_KEY)||"[]");
    if(Array.isArray(old)){
      old.forEach(function(x){
        if(x&&x.word&&!progress.statuses[norm(x.word)]) progress.statuses[norm(x.word)]={status:x.status||"",favorite:!!x.favorite};
      });
    }
  }catch(e){}

  try{
    const s=JSON.parse(localStorage.getItem(OLD_SESSION_KEY)||"{}");
    if((!progress.currentWord)&&Number.isInteger(s.index)&&words[s.index]) progress.currentWord=words[s.index].word;
    if((!progress.filter||progress.filter==="all")&&s.filter) progress.filter=s.filter;
    if(typeof s.mobileMode==="boolean") progress.mobileMode=s.mobileMode;
  }catch(e){}

  words=words.map(function(w){
    const x=progress.statuses[norm(w.word)];
    return x?Object.assign({},w,{status:x.status||"",favorite:!!x.favorite}):w;
  });

  filter=progress.filter||"all";
  mobileMode=!!progress.mobileMode;
  if(progress.currentWord) restoreFocusWord=progress.currentWord;
  applyIndexForFilter(filter,{allowFirstFallback:false});
}

function buildFilterOptions(){
  const ielts=uniq(words.flatMap(function(w){return arr(w.ieltsUse)}));
  const topics=uniq(words.flatMap(function(w){return arr(w.topics)}));
  const difficulty=uniq(words.map(function(w){return w.difficulty}));

  let html="";
  html+='<option value="all">全部待学</option>';
  html+='<option value="everything">全部单词</option>';
  html+='<option value="life-work">生活/工作高频</option>';
  html+='<option value="unfamiliar">不熟词库</option>';
  html+='<option value="familiar">熟悉词库</option>';
  html+='<option value="favorite">收藏</option>';
  html+='<optgroup label="爱听写独立入口"><option value="idictation:listening">爱听写听力</option><option value="idictation:reading">爱听写阅读</option></optgroup>';
  if(ielts.length) html+='<optgroup label="IELTS 用途">'+ielts.map(function(x){return '<option value="ielts:'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>'}).join("")+'</optgroup>';
  if(topics.length) html+='<optgroup label="主题分类">'+topics.map(function(x){return '<option value="topic:'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>'}).join("")+'</optgroup>';
  if(difficulty.length) html+='<optgroup label="难度分类">'+difficulty.map(function(x){return '<option value="difficulty:'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>'}).join("")+'</optgroup>';

  els.filterSelect.innerHTML=html;
  if(!Array.from(els.filterSelect.options).some(function(o){return o.value===filter})) filter="all";
  els.filterSelect.value=filter;
}

function passFilterWith(activeFilter,w){
  if(restoreFocusWord&&norm(w.word)===norm(restoreFocusWord)) return true;
  if(isIdictationFilter(activeFilter)) return !!w.__idictationFlash;
  if(activeFilter==="everything") return true;
  if(activeFilter==="familiar") return w.status==="熟悉";
  if(activeFilter==="unfamiliar") return w.status==="不熟";
  if(activeFilter==="favorite") return w.status!=="熟悉"&&!!w.favorite;
  if(activeFilter==="life-work") return w.status!=="熟悉"&&isLifeWorkWord(w);
  if(activeFilter.indexOf("ielts:")===0) return w.status!=="熟悉"&&arr(w.ieltsUse).includes(activeFilter.slice(6));
  if(activeFilter.indexOf("topic:")===0) return w.status!=="熟悉"&&arr(w.topics).includes(activeFilter.slice(6));
  if(activeFilter.indexOf("difficulty:")===0) return w.status!=="熟悉"&&String(w.difficulty||"")===activeFilter.slice(11);
  return w.status!=="熟悉";
}

function passFilter(w){return passFilterWith(filter,w)}

function current(){
  const l=list();
  if(!l.length)return null;
  if(!l.some(function(w){return w.originalIndex===index})&&!restoreFocusWord) applyIndexForFilter(filter);
  return activePool()[index]||null;
}

function syncResponsiveMode(){
  const narrow=!!(window.matchMedia&&window.matchMedia("(max-width: 900px)").matches);
  document.body.classList.toggle("mobile-mode",narrow&&mobileMode);
}

let topToolsViewport="";
let topToolsCollapsed=false;
function topToolsViewportKey(){
  return window.matchMedia&&window.matchMedia("(max-width: 900px)").matches?"mobile":"desktop";
}
function applyTopToolsState(){
  if(!els.top||!els.topToolsToggle)return;
  els.top.classList.toggle("is-tools-collapsed",topToolsCollapsed);
  els.topToolsToggle.setAttribute("aria-expanded",topToolsCollapsed?"false":"true");
}
function syncTopToolsMode(force){
  const viewport=topToolsViewportKey();
  if(!force&&viewport===topToolsViewport)return;
  topToolsViewport=viewport;
  const saved=localStorage.getItem(TOP_TOOLS_PREF_PREFIX+viewport);
  topToolsCollapsed=saved===null?viewport==="mobile":saved==="1";
  applyTopToolsState();
}

function applyMobileMode(){
  syncResponsiveMode();
  if(els.mobileModeBtn) els.mobileModeBtn.textContent=mobileMode?"普通模式":"手机模式";
  persistSoon();
}

function browserSpeak(text,label){
  const value=String(text||"").trim();
  if(!value||!("speechSynthesis" in window)){toast("没有可播放音频");return}
  try{
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(value);
    u.lang="en-US";
    u.rate=.88;
    u.pitch=1;
    u.onstart=function(){toast("浏览器发音："+(label||"音频"))};
    u.onerror=function(){toast("浏览器发音失败")};
    window.speechSynthesis.speak(u);
  }catch(e){toast("浏览器发音失败")}
}



function containsCjk(text){
  return /[㐀-鿿]/.test(String(text||""));
}

function getEnglishExampleText(w){
  const candidates=[
    w&&w.example,
    w&&w.exampleEn,
    w&&w.englishExample,
    w&&w.sentence,
    w&&w.sentenceEn
  ];

  for(let i=0;i<candidates.length;i++){
    const text=String(candidates[i]||"").trim();
    if(text&&text!=="等待例句"&&!containsCjk(text)) return text;
  }

  return "";
}

function playCurrentWordAudio(source){
  const w=current();
  if(!w||!w.word){
    toast("当前没有单词");
    return;
  }
  const text=w.word||"";
  toast("发音单词："+text);
  play(w.audio,text,text);
}

function playCurrentExampleAudio(){
  const w=current();
  if(!w){
    toast("当前没有英文例句");
    return;
  }

  const text=getEnglishExampleText(w);
  if(!text){
    toast("当前单词没有英文例句");
    return;
  }

  const audioPath=w.exampleAudio||w.example_audio||w.sentenceAudio||w.sentence_audio||"";
  toast("发音英文例句");

  // play(path,label,fallbackText)
  // 第三个参数才是真正给浏览器朗读的文字。
  // 这里必须传英文例句 text，不能传“例句”这个中文标签。
  play(audioPath,"英文例句",text);
}

function timeoutSignal(ms){
  if(!("AbortController" in window)) return {signal:null,cancel:function(){}};
  const controller=new AbortController();
  const timer=setTimeout(function(){try{controller.abort()}catch(e){}},ms);
  return {signal:controller.signal,cancel:function(){clearTimeout(timer)}};
}

async function cachedAudioUrl(path,timeoutMs){
  if(!path) throw new Error("no audio");
  if(audioUrlCache.has(path)) return audioUrlCache.get(path);
  let cache=null;
  let response=null;

  if("caches" in window){
    try{
      cache=await caches.open(AUDIO_CACHE_NAME);
      response=await cache.match(path);
    }catch(e){}
  }

  if(!response){
    const t=timeoutSignal(timeoutMs||1200);
    try{
      response=await fetch(path,{cache:"force-cache",signal:t.signal});
      t.cancel();
      if(!response.ok) throw new Error("audio fetch failed");
      if(cache){try{await cache.put(path,response.clone())}catch(e){}}
    }catch(e){
      t.cancel();
      throw e;
    }
  }

  const blob=await response.blob();
  const url=URL.createObjectURL(blob);
  audioUrlCache.set(path,url);
  return url;
}

async function play(path,label,fallbackText){
  const text=fallbackText||label||"";
  if(!path){browserSpeak(text,label);return}
  try{
    toast("正在加载 Edge TTS 音频");
    if(audio){audio.pause();audio.currentTime=0}
    if("speechSynthesis" in window) window.speechSynthesis.cancel();
    const url=await cachedAudioUrl(path,1200);
    audio=new Audio(url);
    await audio.play();
    toast("Edge TTS 音频："+(label||"音频"));
  }catch(e){
    browserSpeak(text,label);
  }
}

function prewarm(path){
  if(!path||!("caches" in window))return;
  const run=function(){cachedAudioUrl(path,2500).catch(function(){})};
  if("requestIdleCallback" in window) requestIdleCallback(run,{timeout:2500});
  else setTimeout(run,700);
}

function renderList(el,items){
  el.innerHTML="";
  arr(items).slice(0,3).forEach(function(x){
    const text=x.phrase||x.word||"";
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML='<button class="mini-sound">🔊</button><div><div class="en"></div><div class="zh"></div></div>';
    div.querySelector(".en").textContent=text;
    div.querySelector(".zh").textContent=x.chinese||x.meaning||"";
    div.querySelector("button").onclick=function(){play(x.audio,text,text)};
    el.appendChild(div);
  });
}

function renderCards(box,listEl,items,kind,w){
  listEl.innerHTML="";
  if(!items||!items.length){box.classList.add("hidden");return}
  box.classList.remove("hidden");
  items.slice(0,8).forEach(function(x){
    const word=x.word||"";
    const div=document.createElement("div");
    div.className="form-card";
    const type=kind==="form"?formTypeCn(x.type):posDisplay(x.pos||"词族");
    const desc=kind==="form"?word+" 是 "+(w.word||"")+(w.meaning?"（"+w.meaning+"）":"")+" 的"+formTypeCn(x.type):(x.meaning||"待补全释义");
    const hint=kind==="form"?formHint(x):"";
    div.innerHTML='<div class="card-head"><button class="mini-sound">🔊</button><b></b><em></em></div><div class="form-desc"></div><small></small>';
    div.querySelector("b").textContent=word;
    div.querySelector("em").textContent=type;
    div.querySelector(".form-desc").textContent=desc;
    div.querySelector("small").textContent=hint;
    div.querySelector("button").onclick=function(){play(x.audio,word,word)};
    listEl.appendChild(div);
  });
}


function renderEntryList(){
  if(!els.entryList)return;
  els.entryList.innerHTML="";
  ENTRY_GROUPS.forEach(function(group){
    const section=document.createElement("div");
    section.className="entry-section"+(group.highlight?" highlight":"");
    const title=document.createElement("div");
    title.className="entry-section-title";
    title.textContent=group.title;
    const grid=document.createElement("div");
    grid.className="entry-grid";

    group.items.forEach(function(item){
      const count=countForFilter(item.filter);
      const saved=(progress.positions||{})[item.filter]||"";
      const savedWord=saved?words.find(function(w){return norm(w.word)===saved}):null;
      const btn=document.createElement("button");
      btn.className="entry-btn"+(filter===item.filter?" active":"");
      btn.innerHTML='<span class="entry-title"></span><span class="entry-desc"></span><span class="entry-meta"></span>';
      btn.querySelector(".entry-title").textContent=item.title;
      btn.querySelector(".entry-desc").textContent=item.desc;
      btn.querySelector(".entry-meta").textContent=count+" 个"+(savedWord?" · "+savedWord.word:"");
      btn.onclick=function(){
        switchFilter(item.filter);
        if(els.entryPanel) els.entryPanel.classList.add("hidden");
      };
      grid.appendChild(btn);
    });

    section.appendChild(title);
    section.appendChild(grid);
    els.entryList.appendChild(section);
  });
}


function updateStatusCounts(){
  const familiarCount=words.filter(function(w){return w.status==="熟悉"}).length;
  const unfamiliarCount=words.filter(function(w){return w.status==="不熟"}).length;
  const knownBtn=document.getElementById("knownBtn");
  const unknownBtn=document.getElementById("unknownBtn");

  if(knownBtn){
    const span=knownBtn.querySelector("span");
    if(span) span.textContent=String(familiarCount);
    knownBtn.classList.toggle("has-count",familiarCount>0);
  }

  if(unknownBtn){
    const span=unknownBtn.querySelector("span");
    if(span) span.textContent=String(unfamiliarCount);
    unknownBtn.classList.toggle("has-count",unfamiliarCount>0);
  }
}

function render(){
  updateStatusCounts();
  renderEntryList();
  const l=list();
  const w=current();
  if(!w){
    els.word.textContent="完成";
    els.basic.textContent="当前范围没有待学习单词";
    els.loadInfo.textContent="可以切换分类或查看熟悉词库。";
    els.count.textContent="0 / 0";
    els.progressFill.style.width="0%";
    persistSoon();
    return;
  }

  els.word.textContent=w.word||"empty";
  els.basic.textContent=(w.phonetic||"等待音标")+" · "+posDisplay(w.pos)+" · "+(w.meaning||"等待释义");
  els.loadInfo.textContent=cloudbaseReady?"本地已保存，云端会自动同步。":"本地已保存；连接云同步后电脑手机可同步。";
  if(els.entryStatus) els.entryStatus.textContent="当前入口："+filterLabel(filter)+" · "+l.length+" 个词";
  els.example.textContent=w.example||"等待例句";
  els.exampleCn.textContent=w.exampleCn||"";
  els.favoriteBtn.textContent=w.favorite?"★":"☆";
  els.unknownBtn.classList.toggle("active-unknown",w.status==="不熟");
  els.unknownBtn.childNodes[0].nodeValue=w.status==="不熟"?"取消不熟 ":"不熟 ";
  els.unfamiliarAlert.classList.toggle("hidden",w.status!=="不熟");

  renderCards(els.formsBox,els.formsList,w.forms,"form",w);
  renderCards(els.familyBox,els.familyList,w.wordFamily,"family",w);
  renderList(els.collocations,w.collocations);
  renderList(els.phraseCollocations,w.phraseCollocations);

  const pos=Math.max(0,l.findIndex(function(x){return x.originalIndex===index}));
  els.count.textContent=(pos+1)+" / "+l.length;
  els.progressFill.style.width=(l.length?((pos+1)/l.length*100):0)+"%";
  prewarm(w.audio);
  persistSoon();
}

function step(n){
  restoreFocusWord="";
  const l=list();
  if(!l.length)return;
  const pos=Math.max(0,l.findIndex(function(x){return x.originalIndex===index}));
  index=l[(pos+n+l.length)%l.length].originalIndex;
  render();
  scheduleCloudSync();
}


function stopHoldStep(){
  holdStepDir=0;
  holdTouchActive=false;
  if(holdStepDelayTimer){
    clearTimeout(holdStepDelayTimer);
    holdStepDelayTimer=null;
  }
  if(holdStepTimer){
    clearInterval(holdStepTimer);
    holdStepTimer=null;
  }
}

function startHoldStep(dir){
  if(!dir)return;
  if(holdStepDir===dir&&holdStepTimer)return;
  stopHoldStep();
  holdStepDir=dir;
  step(dir);
  holdStepDelayTimer=setTimeout(function(){
    if(holdStepDir!==dir)return;
    holdStepTimer=setInterval(function(){
      if(holdStepDir!==dir){stopHoldStep();return}
      step(dir);
    },130);
  },380);
}

function mark(status){
  restoreFocusWord="";
  const beforeIndex=index;
  const w=current();
  if(!w)return;
  w.status=(status==="不熟"&&w.status==="不熟")?"":status;
  rememberWord(w);
  if(status==="熟悉"){
    // 修复：即使当前入口是“全部单词”，熟悉词仍然可见，也要强制跳过当前词。
    const l=list().filter(function(x){return x.originalIndex!==beforeIndex});
    const next=l.find(function(x){return x.originalIndex>beforeIndex})||l[0];
    if(next) index=next.originalIndex;
  }
  render();
  persistNow();
  scheduleCloudSync();
}


function setSyncStatus(text,on){
  if(els.syncStatus) els.syncStatus.textContent=text;
  if(els.syncBtn){
    els.syncBtn.classList.toggle("on",!!on);
    els.syncBtn.textContent=on?"已同步":"云同步";
  }
}

async function sha256Text(text){
  const value=String(text||"");
  if(window.crypto&&crypto.subtle){
    const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,"0")}).join("");
  }
  let h=0;
  for(let i=0;i<value.length;i++) h=((h<<5)-h+value.charCodeAt(i))|0;
  return "fallback_"+Math.abs(h);
}

function loadScriptOnce(url){
  return new Promise(function(resolve,reject){
    if(window.cloudbase||window.tcb) return resolve();
    const s=document.createElement("script");
    s.src=url+(url.indexOf("?")>=0?"&":"?")+"v="+APP_VERSION;
    s.async=true;
    s.onload=function(){resolve()};
    s.onerror=function(){
      try{s.remove()}catch(e){}
      reject(new Error("load failed: "+url));
    };
    document.head.appendChild(s);
  });
}

async function loadCloudBaseSdk(){
  if(window.cloudbase||window.tcb) return window.cloudbase||window.tcb;
  for(const url of CLOUDBASE_SDK_URLS){
    try{
      await loadScriptOnce(url);
      if(window.cloudbase||window.tcb) return window.cloudbase||window.tcb;
    }catch(e){}
  }
  throw new Error("CloudBase SDK 加载失败");
}

async function wait(ms){
  return new Promise(function(resolve){setTimeout(resolve,ms)});
}

async function getLoginStateSafe(auth){
  try{
    if(!auth||!auth.getLoginState) return null;
    return await auth.getLoginState();
  }catch(e){
    return null;
  }
}

async function cloudbaseLoginIfNeeded(app){
  const auth=app.auth({persistence:"local"});
  cloudbaseAuth=auth;

  async function hasLoginState(){
    const state=await getLoginStateSafe(auth);
    if(state&&state.credential) return true;
    if(state&&state.user) return true;
    if(state&&state.uid) return true;
    if(state&&state.loginType) return true;
    return false;
  }

  if(await hasLoginState()) return true;

  // 兼容不同 CloudBase Web SDK 的匿名登录方法。
  // 手机端有时加载到的 SDK 只有部分方法，所以这里逐个尝试，不再只依赖 signInWithAnonymous。
  const errors=[];
  const attempts=[
    {
      name:"auth.signInAnonymously",
      run:async function(){
        if(typeof auth.signInAnonymously==="function"){
          return await auth.signInAnonymously();
        }
        throw new Error("auth.signInAnonymously not found");
      }
    },
    {
      name:"auth.signInWithAnonymous",
      run:async function(){
        if(typeof auth.signInWithAnonymous==="function"){
          return await auth.signInWithAnonymous();
        }
        throw new Error("auth.signInWithAnonymous not found");
      }
    },
    {
      name:"auth.anonymousAuthProvider().signIn",
      run:async function(){
        if(typeof auth.anonymousAuthProvider==="function"){
          const provider=auth.anonymousAuthProvider();
          if(provider&&typeof provider.signIn==="function") return await provider.signIn();
        }
        throw new Error("auth.anonymousAuthProvider().signIn not found");
      }
    },
    {
      name:"auth.signInWithAuthProvider(auth.anonymousAuthProvider())",
      run:async function(){
        if(typeof auth.signInWithAuthProvider==="function"&&typeof auth.anonymousAuthProvider==="function"){
          const provider=auth.anonymousAuthProvider();
          return await auth.signInWithAuthProvider(provider);
        }
        throw new Error("auth.signInWithAuthProvider / anonymousAuthProvider not found");
      }
    },
    {
      name:"auth.signInWithAuthProvider(new AnonymousAuthProvider)",
      run:async function(){
        if(typeof auth.signInWithAuthProvider!=="function") throw new Error("auth.signInWithAuthProvider not found");
        const AuthProvider=(auth.AnonymousAuthProvider)||(app.AnonymousAuthProvider)||(window.cloudbase&&window.cloudbase.auth&&window.cloudbase.auth.AnonymousAuthProvider)||(window.tcb&&window.tcb.auth&&window.tcb.auth.AnonymousAuthProvider);
        if(typeof AuthProvider!=="function") throw new Error("AnonymousAuthProvider class not found");
        return await auth.signInWithAuthProvider(new AuthProvider());
      }
    }
  ];

  for(const item of attempts){
    try{
      await item.run();
      await wait(800);
      if(await hasLoginState()) return true;
      await wait(1200);
      if(await hasLoginState()) return true;

      // 有些 SDK 匿名登录成功但 getLoginState 返回空，尝试一次数据库读写时再判断。
      errors.push(item.name+": called but no loginState");
    }catch(e){
      errors.push(item.name+": "+(e&&e.message?e.message:String(e)));
    }
  }

  throw new Error("匿名登录失败。已尝试 "+attempts.map(function(x){return x.name}).join(" / ")+"。详细："+errors.join("；"));
}

async function initCloudBase(){
  if(cloudbaseReady&&cloudbaseDb)return true;
  try{
    const sdk=await loadCloudBaseSdk();
    const initFn=sdk.init?sdk.init.bind(sdk):null;
    if(!initFn) throw new Error("没有找到 CloudBase init");
    cloudbaseApp=initFn({env:window.VOCAB_CLOUDBASE_ENV_ID||"ielts-vocab-d1gymoilc5746f67a",region:window.VOCAB_CLOUDBASE_REGION||"ap-shanghai"});
    await cloudbaseLoginIfNeeded(cloudbaseApp);
    cloudbaseDb=cloudbaseApp.database();
    const finalState=await getLoginStateSafe(cloudbaseAuth);
    if(!finalState){
      throw new Error("匿名登录后仍没有登录态 credentials not found");
    }
    cloudbaseReady=true;
    return true;
  }catch(e){
    console.error("CloudBase init error",e);
    setCloudError("CloudBase 连接失败",e);
    return false;
  }
}

function progressForCloud(){
  persistNow();

  const deviceId=progress.deviceId||getDeviceId();
  const cleanedStatuses={};
  const src=progress.statuses||{};

  Object.keys(src).forEach(function(k){
    const item=src[k]||{};
    if(!k)return;

    cleanedStatuses[k]={
      status:item.status||"",
      favorite:!!item.favorite,
      // 旧本地状态没有单词级时间戳时，不强行写成“现在”，避免覆盖其他设备的新状态。
      updatedAt:typeof item.updatedAt==="number"?item.updatedAt:0,
      deviceId:item.deviceId||deviceId
    };
  });

  return {
    version:9,
    appVersion:APP_VERSION,
    envId:window.VOCAB_CLOUDBASE_ENV_ID||"ielts-vocab-d1gymoilc5746f67a",
    vocabId:getVocabId(),
    syncKey:cloudbaseDocId+"__"+getVocabId(),
    statuses:cleanedStatuses,
    currentWord:(currentRaw()?.word||progress.currentWord||""),
    currentWordUpdatedAt:progress.currentWordUpdatedAt||progress.updatedAt||Date.now(),
    filter:progress.filter||"all",
    positions:progress.positions||{},
    mobileMode:!!progress.mobileMode,
    updatedAt:Date.now(),
    deviceId:deviceId
  };
}


function mergeCloudRows(rows){
  const docs=(Array.isArray(rows)?rows:[])
    .filter(function(x){return x&&x.syncCodeHash===cloudbaseDocId&&((x.vocabId||"")===getVocabId())})
    .sort(function(a,b){return (a.updatedAt||a.createdAt||0)-(b.updatedAt||b.createdAt||0)});

  if(!docs.length)return null;

  const merged={
    version:9,
    appVersion:APP_VERSION,
    vocabId:getVocabId(),
    syncKey:cloudbaseDocId+"__"+getVocabId(),
    statuses:{},
    positions:{},
    currentWord:"",
    currentWordUpdatedAt:0,
    filter:"all",
    mobileMode:false,
    updatedAt:0,
    deviceId:"merged"
  };

  docs.forEach(function(row){
    const rowTime=Number(row.updatedAt||row.createdAt||0);
    const remoteStatuses=row.statuses||{};

    Object.keys(remoteStatuses).forEach(function(k){
      const raw=remoteStatuses[k];
      const item=(raw&&typeof raw==="object")?raw:{status:String(raw||""),favorite:false};
      const itemTime=typeof item.updatedAt==="number"?item.updatedAt:rowTime;
      const old=merged.statuses[k]||{};

      if(!old.updatedAt||itemTime>=(old.updatedAt||0)){
        merged.statuses[k]={
          status:item.status||"",
          favorite:!!item.favorite,
          updatedAt:itemTime||rowTime||0,
          deviceId:item.deviceId||row.deviceId||""
        };
      }
    });

    if(row.positions&&typeof row.positions==="object"){
      Object.keys(row.positions).forEach(function(k){
        if(row.positions[k]) merged.positions[k]=row.positions[k];
      });
    }

    const rowPositionTime=Number(row.currentWordUpdatedAt||row.updatedAt||row.createdAt||0);
    if(rowPositionTime>=merged.currentWordUpdatedAt){
      merged.currentWordUpdatedAt=rowPositionTime;
      if(row.currentWord) merged.currentWord=row.currentWord;
    }

    if(rowTime>=merged.updatedAt){
      merged.updatedAt=rowTime;
      if(row.filter) merged.filter=row.filter;
      if(typeof row.mobileMode==="boolean") merged.mobileMode=row.mobileMode;
      merged.deviceId=row.deviceId||merged.deviceId;
    }
  });

  return merged;
}

async function getCloudDoc(){
  if(!cloudbaseDb||!cloudbaseDocId) throw new Error("未连接同步码");

  const loginStateBeforeRead=await getLoginStateSafe(cloudbaseAuth);
  if(!loginStateBeforeRead) throw new Error("读取前没有登录态 credentials not found");

  const result=await cloudbaseDb
    .collection("vocab_progress")
    .where({syncCodeHash:cloudbaseDocId,vocabId:getVocabId()})
    .limit(1000)
    .get();

  const rows=(result&&Array.isArray(result.data)?result.data:[])
    .filter(function(x){return x&&x.syncCodeHash===cloudbaseDocId&&((x.vocabId||"")===getVocabId())});

  // 关键修复：同一个同步码下，读取全部设备记录并合并，不再只取最新一条。
  return mergeCloudRows(rows);
}

async function setCloudDoc(data){
  if(!cloudbaseDb||!cloudbaseDocId) throw new Error("未连接同步码");

  // 兼容 [READONLY]：
  // 每台设备只新增自己创建的进度记录，不去修改别的设备创建的记录。
  // 手机 / 电脑恢复时读取同一同步码下 updatedAt 最新的一条。
  const payload=Object.assign({
    syncCodeHash:cloudbaseDocId,
    vocabId:getVocabId(),
    syncKey:cloudbaseDocId+"__"+getVocabId(),
    deviceId:progress.deviceId||getDeviceId(),
    createdAt:Date.now()
  },data);

  const loginStateBeforeWrite=await getLoginStateSafe(cloudbaseAuth);
  if(!loginStateBeforeWrite) throw new Error("写入前没有登录态 credentials not found");
  await cloudbaseDb.collection("vocab_progress").add(payload);
}

function mergeCloudProgress(remote,forcePosition){
  if(!remote||typeof remote!=="object")return;

  const now=Date.now();
  const remoteUpdated=remote.updatedAt||0;
  const localUpdated=progress.updatedAt||0;
  const localStatuses=progress.statuses||{};
  const remoteStatuses=remote.statuses||{};

  Object.keys(remoteStatuses).forEach(function(k){
    const r=remoteStatuses[k]||{};
    const l=localStatuses[k]||{};
    const rTime=typeof r.updatedAt==="number"?r.updatedAt:remoteUpdated;
    const lTime=typeof l.updatedAt==="number"?l.updatedAt:0;

    if(rTime>=lTime){
      localStatuses[k]={
        status:r.status||"",
        favorite:!!r.favorite,
        updatedAt:rTime||remoteUpdated||now,
        deviceId:r.deviceId||"cloud"
      };
    }
  });

  progress.statuses=localStatuses;
  progress.positions=Object.assign({},remote.positions||{},progress.positions||{});

  const remotePositionTime=remote.currentWordUpdatedAt||remoteUpdated||0;
  const localPositionTime=progress.currentWordUpdatedAt||localUpdated||0;

  if((forcePosition||remotePositionTime>localPositionTime)&&remote.currentWord){
    progress.currentWord=remote.currentWord;
    progress.currentWordUpdatedAt=remotePositionTime||now;
    restoreFocusWord=remote.currentWord;
  }

  if(forcePosition||remoteUpdated>=localUpdated){
    if(remote.filter) progress.filter=remote.filter;
    if(typeof remote.mobileMode==="boolean") progress.mobileMode=remote.mobileMode;
    progress.updatedAt=Math.max(remoteUpdated||0,localUpdated||0,now);
  }else{
    progress.updatedAt=localUpdated||now;
  }

  progress.deviceId=progress.deviceId||getDeviceId();

  // 关键修复：
  // 这里不能调用 persistNow()，因为 persistNow 会读取 currentRaw()，
  // 又把本机当前屏幕正在显示的词覆盖回 progress.currentWord。
  // 云端恢复时应该直接保存合并后的 progress。
  try{
    safeLsSet(PROGRESS_KEY,JSON.stringify(progress));
  }catch(e){}

  applyProgressToWords();
}

function applyProgressToWords(){
  words=words.map(function(w){
    const x=progress.statuses[norm(w.word)];
    return Object.assign({},w,{status:x?.status||"",favorite:!!x?.favorite});
  });
  filter=progress.filter||filter||"all";
  mobileMode=!!progress.mobileMode;
  applyIndexForFilter(filter);
  buildFilterOptions();
  applyMobileMode();
  render();
}

async function connectCloudBase(){
  const code=(els.syncCodeInput.value||"").trim();
  if(code.length<6){toast("同步码至少 6 位");return false}
  localStorage.setItem(CLOUDBASE_SYNC_CODE_KEY,code);
  cloudbaseSyncCode=code;
  cloudbaseDocId="vocab_"+(await sha256Text("ielts-vocab:"+code)).slice(0,48);
  console.log("CloudBase env",window.VOCAB_CLOUDBASE_ENV_ID,window.VOCAB_CLOUDBASE_REGION); setSyncStatus("正在连接 CloudBase...",false);
  const ok=await initCloudBase();
  if(!ok)return false;
  setSyncStatus("已连接，可上传或恢复",true);
  startCloudAutoPull();
  return true;
}


function startCloudAutoPull(){
  if(!cloudbaseReady||!cloudbaseDocId)return;
  if(cloudPullTimer) clearInterval(cloudPullTimer);
  cloudPullTimer=setInterval(function(){
    if(!cloudbaseReady||!cloudbaseDocId)return;
    if(document.hidden)return;
    const now=Date.now();
    if(now-lastAutoCloudPullAt<25000)return;
    lastAutoCloudPullAt=now;
    cloudPull(true).catch(function(e){console.warn("auto cloud pull failed",e)});
  },30000);
}

function stopCloudAutoPull(){
  if(cloudPullTimer){
    clearInterval(cloudPullTimer);
    cloudPullTimer=null;
  }
}

async function cloudPull(silent){
  if(!cloudbaseDocId){
    const ok=await connectCloudBase();
    if(!ok)return;
  }
  try{
    const data=await getCloudDoc();
    if(data){
      mergeCloudProgress(data,!silent);
      setSyncStatus((silent?"已静默合并云端进度：":"已恢复云端当前进度：")+(progress.currentWord||"")+" ｜ "+new Date().toLocaleTimeString(),true);
      if(!silent) toast("已恢复云端当前进度");
    }else{
      setSyncStatus("当前词库云端暂无进度，可上传本机进度 ｜ 词库ID："+getVocabId(),true);
      if(!silent) toast("云端暂无进度");
    }
  }catch(e){
    console.error("CloudBase pull error",e); setCloudError("读取失败",e);
  }
}

async function cloudPush(){
  if(!cloudbaseDocId){
    const ok=await connectCloudBase();
    if(!ok)return;
  }
  try{
    await setCloudDoc(progressForCloud());
    setSyncStatus("已上传："+new Date().toLocaleTimeString(),true);
  }catch(e){
    console.error("CloudBase push error",e); setCloudError("上传失败",e);
  }
}

function scheduleCloudSync(){
  if(!cloudbaseReady||!cloudbaseDocId)return;
  clearTimeout(cloudSyncTimer);
  setSyncStatus("本地已更新，约 5 秒后自动上传...",true);
  cloudSyncTimer=setTimeout(cloudPush,5000);
}


if(els.editWordBtn){
  els.editWordBtn.onclick=openEditCurrentWord;
}
if(els.deleteWordBtn){
  els.deleteWordBtn.onclick=deleteCurrentWord;
}
if(els.editCloseBtn){
  els.editCloseBtn.onclick=function(){els.editPanel.classList.add("hidden")};
}
if(els.editCancelBtn){
  els.editCancelBtn.onclick=function(){els.editPanel.classList.add("hidden")};
}
if(els.editSaveBtn){
  els.editSaveBtn.onclick=saveEditCurrentWord;
}

if(els.entryBtn){
  els.entryBtn.onclick=function(){
    ensureIdictationPayload().finally(function(){
      renderEntryList();
      els.entryPanel.classList.remove("hidden");
    });
  };
}
if(els.entryCloseBtn){
  els.entryCloseBtn.onclick=function(){els.entryPanel.classList.add("hidden")};
}

els.syncBtn.onclick=function(){
  els.syncPanel.classList.remove("hidden");
  if(cloudbaseReady&&cloudbaseDocId){
    setSyncStatus("正在合并云端进度...",true);
    cloudPull(true).catch(function(e){console.warn("open panel cloud pull failed",e)});
  }
};
els.syncCloseBtn.onclick=function(){
  els.syncPanel.classList.add("hidden");
};
els.syncConnectBtn.onclick=function(){
  connectCloudBase().then(function(ok){
    if(ok){
      setSyncStatus("已连接，正在合并云端进度...",true);
      cloudPull(false).catch(function(e){console.warn("connect cloud pull failed",e)});
    }
  });
};
els.syncPullBtn.onclick=function(){
  cloudPull(false);
};
els.syncPushBtn.onclick=function(){
  cloudPush();
};
els.syncDisconnectBtn.onclick=function(){
  stopCloudAutoPull();
  cloudbaseReady=false;
  cloudbaseDocId="";
  cloudbaseSyncCode="";
  localStorage.removeItem(CLOUDBASE_SYNC_CODE_KEY);
  setSyncStatus("已断开",false);
  toast("已断开云同步");
};

document.getElementById("prevBtn").onclick=function(){step(-1)};
if(els.topToolsToggle) els.topToolsToggle.onclick=function(){
  topToolsCollapsed=!topToolsCollapsed;
  localStorage.setItem(TOP_TOOLS_PREF_PREFIX+topToolsViewportKey(),topToolsCollapsed?"1":"0");
  applyTopToolsState();
};
document.getElementById("shuffleBtn").onclick=function(){
  restoreFocusWord="";
  words=[...words].sort(function(){return Math.random()-.5});
  index=0;
  toast("已随机");
  render();
  scheduleCloudSync();
};
document.getElementById("knownBtn").onclick=function(){mark("熟悉")};
document.getElementById("unknownBtn").onclick=function(){mark("不熟")};
els.favoriteBtn.onclick=function(){
  const w=current();
  if(w){w.favorite=!w.favorite;rememberWord(w);render();persistNow();scheduleCloudSync()}
};
document.getElementById("wordSoundBtn").onclick=function(){const w=current();if(w)play(w.audio,w.word,w.word)};
els.word.onclick=function(){const w=current();if(w)play(w.audio,w.word,w.word)};
els.exampleSoundBtn.onclick=function(){const w=current();if(w)play(w.exampleAudio,w.example||"例句",w.example||w.word)};
els.filterSelect.onchange=function(e){
  switchFilter(e.target.value);
};
if(els.mobileModeBtn) els.mobileModeBtn.onclick=function(){
  mobileMode=!mobileMode;
  applyMobileMode();
  toast(mobileMode?"已进入手机模式":"已进入普通模式");
  scheduleCloudSync();
};
window.addEventListener("resize",function(){syncResponsiveMode();syncTopToolsMode(false)},{passive:true});

let sx=0,sy=0,st=0;
els.swipeArea.addEventListener("touchstart",function(e){
  const t=e.changedTouches[0];
  sx=t.clientX;
  sy=t.clientY;
  st=Date.now();
  suppressNextSwipe=false;

  const rect=els.swipeArea.getBoundingClientRect();
  const relX=t.clientX-rect.left;
  const dir=relX<rect.width/2?-1:1;

  if(holdStepDelayTimer) clearTimeout(holdStepDelayTimer);
  holdStepDelayTimer=setTimeout(function(){
    const w=current();
    if(!w)return;
    holdTouchActive=true;
    suppressNextSwipe=true;
    startHoldStep(dir);
    toast(dir>0?"长按连续下一个":"长按连续上一个");
  },520);
},{passive:true});

els.swipeArea.addEventListener("touchmove",function(e){
  const t=e.changedTouches[0];
  const dx=t.clientX-sx;
  const dy=t.clientY-sy;
  if(Math.abs(dx)>18||Math.abs(dy)>18){
    if(!holdTouchActive&&holdStepDelayTimer){
      clearTimeout(holdStepDelayTimer);
      holdStepDelayTimer=null;
    }
  }
},{passive:true});

els.swipeArea.addEventListener("touchend",function(e){
  const t=e.changedTouches[0];
  const dx=t.clientX-sx;
  const dy=t.clientY-sy;
  const dt=Date.now()-st;
  const wasHolding=holdTouchActive||suppressNextSwipe;
  stopHoldStep();

  if(wasHolding)return;

  if(dt<700&&Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.4){
    dx<0?step(1):step(-1);
  }
},{passive:true});

els.swipeArea.addEventListener("touchcancel",stopHoldStep,{passive:true});

window.addEventListener("keydown",function(e){
  const tag=e.target&&e.target.tagName?e.target.tagName.toLowerCase():"";
  const isTyping=tag==="input"||tag==="textarea"||tag==="select"||(e.target&&e.target.isContentEditable);
  if(isTyping||e.ctrlKey||e.metaKey||e.altKey)return;

  const key=e.key||"";
  const code=e.code||"";
  const isDelete=key==="Delete"||code==="Delete"||e.keyCode===46||e.which===46;
  const isZero=key==="0"||code==="Digit0"||code==="Numpad0";
  const isOne=key==="1"||code==="Digit1"||code==="Numpad1";
  const isTab=key==="Tab"||code==="Tab"||e.keyCode===9||e.which===9;
  const isSpace=key===" "||key==="Spacebar"||code==="Space"||e.keyCode===32||e.which===32;

  if(isTab&&!e.repeat){
    e.preventDefault();
    e.stopPropagation();
    playCurrentWordAudio("tab");
    return;
  }

  if(isSpace&&!e.repeat){
    e.preventDefault();
    e.stopPropagation();
    playCurrentExampleAudio();
    return;
  }

  if(isDelete&&!e.repeat){e.preventDefault();e.stopPropagation();deleteCurrentWord();return}
  if(isZero&&!e.repeat){e.preventDefault();e.stopPropagation();mark("熟悉");return}
  if(isOne&&!e.repeat){e.preventDefault();e.stopPropagation();mark("不熟");return}

  if(key==="ArrowLeft"||code==="ArrowLeft"){
    e.preventDefault();
    e.stopPropagation();
    startHoldStep(-1);
    return;
  }

  if(key==="ArrowRight"||code==="ArrowRight"){
    e.preventDefault();
    e.stopPropagation();
    startHoldStep(1);
    return;
  }
},true);

window.addEventListener("keyup",function(e){
  const key=e.key||"";
  const code=e.code||"";
  if(key==="ArrowLeft"||code==="ArrowLeft"||key==="ArrowRight"||code==="ArrowRight"){
    stopHoldStep();
  }
},true);

window.addEventListener("blur",stopHoldStep);

document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden"){persistNow();if(cloudbaseReady&&cloudbaseDocId)cloudPush()}});
window.addEventListener("pagehide",function(){persistNow();if(cloudbaseReady&&cloudbaseDocId)cloudPush()});
window.addEventListener("beforeunload",persistNow);

function registerSW(){
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js?v="+APP_VERSION).catch(function(){});
  }
}

async function boot(){
  const slowTimer=setTimeout(function(){
    els.basic.textContent="词库仍在加载，手机第一次打开会比较慢。";
    els.loadInfo.textContent="如果长时间停在 Loading，请刷新一次页面。";
  },5000);

  try{
    const savedCode=localStorage.getItem(CLOUDBASE_SYNC_CODE_KEY)||"";
    if(savedCode) els.syncCodeInput.value=savedCode;

    const [res,idictationRes]=await Promise.all([
      fetch("./data/words.json?v="+APP_VERSION,{cache:"force-cache"}),
      fetch("./data/idictation-frequency.json?v="+APP_VERSION,{cache:"force-cache"}).catch(function(){return null})
    ]);
    if(!res.ok) throw new Error("words json failed");
    const data=await res.json();
    words=Array.isArray(data.words)?data.words:data;
    if(idictationRes&&idictationRes.ok) idictationPayload=await idictationRes.json();
    else await ensureIdictationPayload();
    // 静态版不再保存完整 10000 词，只合并“修改过的单词”。
    safeLsRemove("static_vocab_words_v1");
    words=applyDeletedWords(applyWordEdits(words));
    vocabId=computeVocabId(words);
    loadProgress();
    buildFilterOptions();
    if(window.matchMedia&&window.matchMedia("(max-width: 900px)").matches&&!(progress.updatedAt>0)) mobileMode=true;
    applyMobileMode();
    syncTopToolsMode(true);
    render();
    registerSW();
    clearTimeout(slowTimer);
    if(savedCode){
      connectCloudBase().then(function(ok){ if(ok){ cloudPull(); startCloudAutoPull(); } }).catch(function(){});
    }else{
      setSyncStatus("未连接",false);
    }
  }catch(e){
    clearTimeout(slowTimer);
    els.word.textContent="加载失败";
    els.basic.textContent="没有成功读取 data/words.json";
    els.loadInfo.textContent="请确认 GitHub Pages 已上传 data/words.json，并在手机上刷新页面。";
  }
}

boot();
