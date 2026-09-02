/**
 * Verified static homepage runtime.
 *
 * This is the source of truth packaged into assets/app.js. Responsive, filter
 * and touch behavior is baked here so the exporter never rewrites executable
 * JavaScript by matching source strings.
 */
const STATIC_HOME_APP_TEMPLATE = String.raw`const APP_VERSION="__STATIC_SITE_VERSION__";
const IDICTATION_ENTRY_COUNTS={listening:__STATIC_LISTENING_COUNT__,reading:__STATIC_READING_COUNT__};
const PROGRESS_KEY="static_vocab_progress_v15_entry_edgetts_cache_fallback";
const OLD_WORDS_KEY="static_vocab_words_v1";
const OLD_SESSION_KEY="static_vocab_session_v1";
const READING_MAIN_SUPPLEMENT_KEY="static_personal_reading_main_v1";
const AUDIO_CACHE_NAME="static_vocab_audio_"+APP_VERSION;
const CLOUDBASE_SYNC_CODE_KEY="static_vocab_cloudbase_sync_code_v1";
const TOP_TOOLS_PREF_PREFIX="static_vocab_top_tools_collapsed_v1_";
const WORD_ORDER_KEY="ielts_vocab_word_order_modes_v1";
const WORD_ORDER_CURSOR_KEY="ielts_vocab_word_order_cursors_v1";
const ORDERING_MODULE_ROOT="./study-ordering-v64/";
const MEANING_VISIBILITY_KEY="ielts_vocab_hide_meanings_v1";
const CLOUDBASE_SDK_URLS=[
  // CloudBase JS SDK 2.x：旧版 1.x 会触发 ACCESS_TOKEN_DISABLED。
  "https://static.cloudbase.net/cloudbase-js-sdk/2.12.1/cloudbase.full.js"
];
const CLOUD_PROGRESS_PAGE_SIZE=500;
const CLOUD_PROGRESS_MAX_ROWS=5000;

let words=[];
let idictationPayload=null;
let filter="all";
let index=0;
let mainDeleteConfirmedInSession=false;
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
let studyListCache=new Map();
let sharedWordStudyOrdering=null;
let sharedWordDifficulty=null;

function invalidateStudyListCache(){
  studyListCache.clear();
}

const els={
  top:document.querySelector(".top"),
  topActions:document.getElementById("topActions"),
  topToolsToggle:document.getElementById("topToolsToggle"),
  word:document.getElementById("word"),
  basic:document.getElementById("basic"),
  meaningDetailText:document.getElementById("meaningDetailText"),
  loadInfo:document.getElementById("loadInfo"),
  example:document.getElementById("example"),
  exampleCn:document.getElementById("exampleCn"),
  exampleSoundBtn:document.getElementById("exampleSoundBtn"),
  formsBox:document.getElementById("formsBox"),
  formsList:document.getElementById("formsList"),
  familyBox:document.getElementById("familyBox"),
  familyList:document.getElementById("familyList"),
  synonymsBox:document.getElementById("synonymsBox"),
  synonyms:document.getElementById("synonyms"),
  phraseCollocationsBox:document.getElementById("phraseCollocationsBox"),
  phraseCollocations:document.getElementById("phraseCollocations"),
  count:document.getElementById("count"),
  progressFill:document.getElementById("progressFill"),
  progressSeek:document.getElementById("progressSeek"),
  progressPreview:document.getElementById("progressPreview"),
  progressJumpForm:document.getElementById("progressJumpForm"),
  progressJumpInput:document.getElementById("progressJumpInput"),
  progressJumpTotal:document.getElementById("progressJumpTotal"),
  progressJumpCancel:document.getElementById("progressJumpCancel"),
  favoriteBtn:document.getElementById("favoriteBtn"),
  unknownBtn:document.getElementById("unknownBtn"),
  unfamiliarAlert:document.getElementById("unfamiliarAlert"),
  toast:document.getElementById("toast"),
  filterSelect:document.getElementById("filterSelect"),
  orderSelect:document.getElementById("orderSelect"),
  difficultyOrderSelect:document.getElementById("difficultyOrderSelect"),
  meaningVisibilityBtn:document.getElementById("meaningVisibilityBtn"),
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
const FIXED_WORD_ORDER_MODES=["family","association"];
const WORD_ORDER_SNAPSHOT_VERSION=5;
const WORD_DIFFICULTY_MODES=["default","easy-to-hard","hard-to-easy","easier-only","standard-only","harder-only"];
function normalizeWordOrderMode(mode){return ["current","random","family","association"].includes(mode)?mode:"current"}
function normalizeDifficultyMode(mode){return WORD_DIFFICULTY_MODES.includes(mode)?mode:"default"}
function wordOrderSnapshotKey(mode,difficultyMode){return normalizeWordOrderMode(mode)+"|"+normalizeDifficultyMode(difficultyMode)}
function isFixedWordOrderMode(mode,difficultyMode){return FIXED_WORD_ORDER_MODES.includes(mode)||normalizeDifficultyMode(difficultyMode)!=="default"}
function intrinsicDifficulty(word){
  const key=norm(word&&word.word);
  const letters=key.replace(/[^a-z]/g,"");
  if(!letters)return 50;
  const syllables=Math.max(1,(letters.replace(/e$/,"").match(/[aeiouy]+/g)||[]).length);
  const tokenCount=key.split(/[\s-]+/).filter(Boolean).length;
  const rare=(letters.match(/[jqxz]/g)||[]).length;
  const clusters=letters.match(/[bcdfghjklmnpqrstvwxyz]{3,}/g)||[];
  const clusterLoad=clusters.reduce(function(sum,cluster){return sum+Math.max(1,cluster.length-2)},0);
  const opaque=(letters.match(/(?:ough|augh|eigh|queue|sch|tch|dge|ph|rh|ps|mn|gn|kn|wr|eau)/g)||[]).length;
  let score=6+Math.max(0,Math.min(42,(letters.length-2)*4));
  score+=Math.max(0,Math.min(20,(syllables-1)*5));
  score+=Math.max(0,Math.min(14,(tokenCount-1)*7));
  if(key.includes("-"))score+=3;
  score+=Math.max(0,Math.min(6,rare*1.5));
  score+=Math.max(0,Math.min(8,clusterLoad*2));
  score+=Math.max(0,Math.min(9,opaque*3));
  if(/(?:tion|sion|ation|isation|ization|ology|ologist|graphy|metry|phobia|cracy|ence|ance|ment|ness|ity|ative|ively|ically|ability|ibility)$/i.test(letters))score+=4;
  if(letters.length>=9&&/^(?:anti|counter|dis|inter|micro|mis|multi|non|over|post|pre|re|sub|super|trans|un)/i.test(letters))score+=3;
  return Math.max(0,Math.min(100,Math.round(score)));
}
function difficultyScore(word){
  const explicit=Number(word&&word.studyDifficultyScore);
  if(Number.isFinite(explicit))return Math.max(0,Math.min(100,Math.round(explicit)));
  return intrinsicDifficulty(word);
}
function difficultySortKey(word){return intrinsicDifficulty(word)*1000+Math.min(999,difficultyScore(word))}
function difficultyProfile(source){
  if(!sharedWordDifficulty)return {available:false};
  return sharedWordDifficulty.createWordInternalDifficultyProfile(source);
}
function difficultyTier(word,profile){
  return sharedWordDifficulty&&profile
    ?sharedWordDifficulty.wordInternalDifficultyTier(word,profile)
    :"standard";
}
function requestedDifficultyTier(mode){
  if(mode==="easier-only")return "easier";
  if(mode==="standard-only")return "standard";
  if(mode==="harder-only")return "harder";
  return "";
}
function difficultyDirection(mode){return mode==="easy-to-hard"?1:mode==="hard-to-easy"?-1:0}
function filterDifficultyTier(source,profile,tier){
  if(!tier||!profile.available)return source;
  const exact=source.filter(function(word){return difficultyTier(word,profile)===tier});
  if(exact.length)return exact;
  const scored=source.map(function(word,order){return {word:word,order:order,score:difficultyScore(word)}}).sort(function(a,b){return a.score-b.score||a.order-b.order});
  if(!scored.length)return source;
  if(tier==="easier"){
    const limit=scored[Math.max(0,Math.floor((scored.length-1)*.35))].score;
    return scored.filter(function(item){return item.score<=limit}).map(function(item){return item.word});
  }
  if(tier==="harder"){
    const limit=scored[Math.min(scored.length-1,Math.ceil((scored.length-1)*.65))].score;
    return scored.filter(function(item){return item.score>=limit}).map(function(item){return item.word});
  }
  const low=scored[Math.max(0,Math.floor((scored.length-1)*.25))].score;
  const high=scored[Math.min(scored.length-1,Math.ceil((scored.length-1)*.75))].score;
  const middle=scored.filter(function(item){return item.score>=low&&item.score<=high}).map(function(item){return item.word});
  return middle.length?middle:source;
}

function readWordOrderPreferences(){
  try{
    const parsed=JSON.parse(localStorage.getItem(WORD_ORDER_KEY)||"{}");
    return parsed&&typeof parsed==="object"?parsed:{};
  }catch(e){return {}}
}

function readWordOrderCursors(){
  try{
    const parsed=JSON.parse(localStorage.getItem(WORD_ORDER_CURSOR_KEY)||"{}");
    return parsed&&typeof parsed==="object"?parsed:{};
  }catch(e){return {}}
}

function wordOrderPreference(activeFilter){
  const activeKey=activeFilter||filter;
  const saved=readWordOrderPreferences()[activeKey]||{};
  const legacyDifficulty=saved.mode==="easy-to-hard"?"easy-to-hard":saved.mode==="hard-to-easy"?"hard-to-easy":"default";
  const mode=normalizeWordOrderMode(saved.mode);
  const difficultyMode=normalizeDifficultyMode(saved.difficultyMode||legacyDifficulty);
  const storedSnapshots=saved.snapshots&&typeof saved.snapshots==="object"?saved.snapshots:{};
  const cursorEntry=readWordOrderCursors()[activeKey]||{};
  const snapshots={};
  Object.keys(storedSnapshots).forEach(function(snapshotMode){
    snapshots[snapshotMode]={
      ...storedSnapshots[snapshotMode],
      cursorKey:cursorEntry[snapshotMode]||storedSnapshots[snapshotMode].cursorKey||""
    };
  });
  return {mode:mode,difficultyMode:difficultyMode,seed:Number(saved.seed)||0,snapshots:snapshots};
}

function saveWordOrderPreference(activeFilter,mode,difficultyMode,options){
  const opts=options||{};
  const prefs=readWordOrderPreferences();
  const previous=prefs[activeFilter]||{};
  prefs[activeFilter]={
    ...previous,
    mode:normalizeWordOrderMode(mode),
    difficultyMode:normalizeDifficultyMode(difficultyMode),
    seed:mode==="random"?(Number(opts.seed)||Date.now()):(Number(previous.seed)||0)
  };
  try{localStorage.setItem(WORD_ORDER_KEY,JSON.stringify(prefs))}catch(e){}
}

function saveWordOrderSnapshot(activeFilter,snapshotKey,snapshot){
  if(!snapshotKey)return;
  const prefs=readWordOrderPreferences();
  const previous=prefs[activeFilter]||{};
  prefs[activeFilter]={
    ...previous,
    snapshots:{...(previous.snapshots||{}),[snapshotKey]:snapshot}
  };
  try{localStorage.setItem(WORD_ORDER_KEY,JSON.stringify(prefs))}catch(e){}
  saveWordOrderCursor(activeFilter,snapshotKey,snapshot&&snapshot.cursorKey);
}

function saveWordOrderCursor(activeFilter,snapshotKey,cursorKey){
  if(!cursorKey||!snapshotKey)return;
  const cursors=readWordOrderCursors();
  const previous=cursors[activeFilter]||{};
  if(previous[snapshotKey]===cursorKey)return;
  cursors[activeFilter]={...previous,[snapshotKey]:cursorKey};
  try{localStorage.setItem(WORD_ORDER_CURSOR_KEY,JSON.stringify(cursors))}catch(e){}
}

function wordOrderEntryKey(word){
  const stableId=word&&(word.wordId??word.id??word.inputId);
  if(String(stableId||"").trim())return "id:"+String(stableId).trim();
  return "word:"+norm(word&&word.word);
}

let wordOrderSignatureCache={pool:null,length:-1,value:""};
function wordOrderSourceSignature(sourceCount){
  const resolvedCount=Number.isInteger(sourceCount)
    ?Math.max(0,Math.min(sourceCount,words.length))
    :words.length;
  if(resolvedCount===words.length&&wordOrderSignatureCache.pool===words&&wordOrderSignatureCache.length===words.length){
    return wordOrderSignatureCache.value;
  }
  const ordered=[...(words||[]).slice(0,resolvedCount)].sort(function(a,b){return a.originalIndex-b.originalIndex});
  let hash=2166136261;
  ordered.forEach(function(word){
    const value=String(word.originalIndex)+":"+wordOrderEntryKey(word)+"|";
    for(let i=0;i<value.length;i+=1){
      hash^=value.charCodeAt(i);
      hash=Math.imul(hash,16777619);
    }
  });
  const value=ordered.length+":"+(hash>>>0).toString(36);
  if(resolvedCount===words.length){
    wordOrderSignatureCache={pool:words,length:words.length,value:value};
  }
  return value;
}

function createWordOrderSnapshot(ordered,cursorIndex){
  const indices=[];
  const keys=[];
  const seen=new Set();
  ordered.forEach(function(word){
    const key=wordOrderEntryKey(word);
    if(key&&!seen.has(key)){seen.add(key);indices.push(word.originalIndex);keys.push(key)}
  });
  const cursor=ordered.find(function(word){return word.originalIndex===cursorIndex});
  const first=ordered.find(function(word){return word.originalIndex===indices[0]});
  const cursorKey=cursor?wordOrderEntryKey(cursor):(first?wordOrderEntryKey(first):"");
  return {
    version:WORD_ORDER_SNAPSHOT_VERSION,
    indices:indices,
    keys:keys,
    sourceCount:words.length,
    sourceSignature:wordOrderSourceSignature(),
    cursorKey:seen.has(cursorKey)?cursorKey:(first?wordOrderEntryKey(first):"")
  };
}

function reconcileWordOrderSnapshot(snapshot,source,fallback){
  const byKey=new Map();
  const byIndex=new Map();
  source.forEach(function(word){const key=wordOrderEntryKey(word);if(key&&!byKey.has(key))byKey.set(key,word)});
  source.forEach(function(word){if(Number.isInteger(word.originalIndex))byIndex.set(word.originalIndex,word)});
  const items=[];
  const seenIndices=new Set();
  function appendWord(word){
    if(!word||!Number.isInteger(word.originalIndex)||seenIndices.has(word.originalIndex))return;
    seenIndices.add(word.originalIndex);
    items.push(word);
  }
  const compactMatches=Number(snapshot&&snapshot.version)===WORD_ORDER_SNAPSHOT_VERSION
    &&Array.isArray(snapshot&&snapshot.indices)
    &&(
      snapshot.sourceSignature===wordOrderSourceSignature()
      ||(
        Number.isInteger(Number(snapshot.sourceCount))
        &&Number(snapshot.sourceCount)>=0
        &&Number(snapshot.sourceCount)<=words.length
        &&snapshot.sourceSignature===wordOrderSourceSignature(Number(snapshot.sourceCount))
      )
    );
  if(compactMatches){
    const stableKeys=arr(snapshot&&snapshot.keys);
    if(stableKeys.length)stableKeys.forEach(function(key){appendWord(byKey.get(key))});
    else snapshot.indices.forEach(function(sourceIndex){appendWord(byIndex.get(sourceIndex))});
  }
  (fallback||source).forEach(appendWord);
  source.forEach(appendWord);
  const requested=String(snapshot&&snapshot.cursorKey||"");
  const requestedWord=byKey.get(requested);
  const cursorWord=requestedWord&&seenIndices.has(requestedWord.originalIndex)?requestedWord:items[0];
  const cursorIndex=cursorWord?cursorWord.originalIndex:null;
  return {
    items:items,
    cursorIndex:cursorIndex,
    snapshot:createWordOrderSnapshot(items,cursorIndex)
  };
}

function remapWordOrderSnapshotsAfterDeletion(snapshots,previousWords){
  const nextByKey=new Map();
  words.forEach(function(word,sourceIndex){
    const key=wordOrderEntryKey(word);
    if(key&&!nextByKey.has(key))nextByKey.set(key,sourceIndex);
  });
  const result={};
  Object.keys(snapshots||{}).forEach(function(snapshotKey){
    const snapshot=snapshots[snapshotKey]||{};
    const orderedKeys=Number(snapshot.version)===WORD_ORDER_SNAPSHOT_VERSION&&Array.isArray(snapshot.indices)
      ?snapshot.indices.map(function(sourceIndex){
        const word=previousWords[sourceIndex];
        return word?wordOrderEntryKey(word):"";
      })
      :arr(snapshot.keys);
    const seen=new Set();
    const ordered=[];
    orderedKeys.forEach(function(key){
      const sourceIndex=nextByKey.get(key);
      if(!Number.isInteger(sourceIndex)||seen.has(sourceIndex))return;
      seen.add(sourceIndex);
      ordered.push(Object.assign({},words[sourceIndex],{originalIndex:sourceIndex}));
    });
    const requestedCursorIndex=nextByKey.get(String(snapshot.cursorKey||""));
    const cursorIndex=seen.has(requestedCursorIndex)
      ?requestedCursorIndex
      :(ordered[0]&&ordered[0].originalIndex);
    result[snapshotKey]=createWordOrderSnapshot(ordered,cursorIndex);
  });
  return result;
}

function relationWord(value){
  if(typeof value==="string")return value;
  return value&&(value.word||value.replacement||value.term||value.text)||"";
}

function phraseText(value){
  if(typeof value==="string")return value;
  return value&&(value.phrase||value.text||value.collocation||value.word)||"";
}

function relationKeys(value){
  return arr(value).map(relationWord).map(norm).filter(Boolean);
}

function phraseTokens(value){
  const stop={a:1,an:1,and:1,as:1,at:1,be:1,by:1,for:1,from:1,in:1,into:1,of:1,on:1,or:1,the:1,to:1,with:1};
  return norm(phraseText(value)).split(/[^a-z0-9']+/i).map(norm).filter(function(token){return token.length>2&&!stop[token]});
}

function deterministicHash(value){
  let hash=2166136261;
  const text=String(value||"");
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return hash>>>0;
}

function connectedGroups(entries,linksForWord){
  const parent=entries.map(function(_,i){return i});
  const byKey=new Map();
  function find(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i}
  function join(a,b){const ar=find(a),br=find(b);if(ar!==br)parent[br]=ar}
  entries.forEach(function(entry,i){
    uniq([norm(entry.word)].concat(linksForWord(entry)).filter(Boolean)).forEach(function(key){
      const target=byKey.get(key);
      if(Number.isInteger(target))join(i,target);
      else byKey.set(key,i);
    });
  });
  const groups=new Map();
  entries.forEach(function(entry,i){const root=find(i);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(entry)});
  return Array.from(groups.values());
}

function familyConnectedGroups(entries){
  const parent=entries.map(function(_,i){return i});
  const byWord=new Map();
  const byExplicitRoot=new Map();
  function find(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i}
  function join(a,b){const ar=find(a),br=find(b);if(ar!==br)parent[br]=ar}
  entries.forEach(function(entry,i){
    const key=norm(entry.word);
    if(key)byWord.set(key,i);
    const root=[entry.familyRoot,entry.rootWord,entry.baseWord,entry.lemma].map(norm).find(Boolean);
    if(root){if(!byExplicitRoot.has(root))byExplicitRoot.set(root,[]);byExplicitRoot.get(root).push(i)}
  });
  entries.forEach(function(entry,i){
    familyLinks(entry).forEach(function(key){const target=byWord.get(key);if(Number.isInteger(target))join(i,target)});
  });
  byExplicitRoot.forEach(function(positions,root){
    positions.slice(1).forEach(function(position){join(positions[0],position)});
    const target=byWord.get(root);if(Number.isInteger(target))join(positions[0],target);
  });
  const groups=new Map();
  entries.forEach(function(entry,i){const root=find(i);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(entry)});
  return Array.from(groups.values());
}

function familyLinks(word){
  return relationKeys(word.wordFamily)
    .concat(relationKeys(word.forms),relationKeys(word.mergedAliases),relationKeys(word.mergedEntries))
    .concat([word.familyRoot,word.rootWord,word.baseWord,word.lemma].map(norm).filter(Boolean));
}

const IRREGULAR_SURFACE_FORMS={be:["am","is","are","was","were","been","being"],go:["goes","went","gone","going"],do:["does","did","done","doing"],have:["has","had","having"],write:["writes","wrote","written","writing"],seek:["seeks","sought","seeking"],child:["children"],person:["people"],man:["men"],woman:["women"],analysis:["analyses"],basis:["bases"],crisis:["crises"],datum:["data"],phenomenon:["phenomena"]};
function isSurfaceInflection(baseValue,formValue){
  const base=norm(baseValue),form=norm(formValue);
  if(!base||!form||base===form)return false;
  if((IRREGULAR_SURFACE_FORMS[base]||[]).includes(form))return true;
  const forms=new Set([base+"s",base+"es",base+"ed",base+"ing"]);
  if(base.endsWith("e")){forms.add(base+"d");forms.add(base.slice(0,-1)+"ing")}
  if(/[^aeiou]y$/.test(base)){forms.add(base.slice(0,-1)+"ies");forms.add(base.slice(0,-1)+"ied")}
  if(/(?:s|x|z|ch|sh|o)$/.test(base))forms.add(base+"es");
  if(/[aeiou][bcdfghjklmnpqrstvwxyz]$/.test(base)){forms.add(base+base.slice(-1)+"ed");forms.add(base+base.slice(-1)+"ing")}
  return forms.has(form);
}

function explicitAssociationLinks(word){
  return relationKeys(word.synonyms).concat(relationKeys(word.relatedWords),relationKeys(word.associations));
}

const ASSOCIATION_TOKEN_STOP={a:1,an:1,and:1,as:1,at:1,be:1,by:1,for:1,from:1,in:1,into:1,of:1,on:1,or:1,the:1,to:1,with:1,about:1,after:1,before:1,during:1,ability:1,area:1,change:1,common:1,different:1,example:1,form:1,general:1,important:1,include:1,kind:1,level:1,main:1,make:1,made:1,means:1,part:1,place:1,process:1,provide:1,result:1,set:1,state:1,type:1,way:1,related:1,service:1,services:1,someone:1,something:1,system:1,systems:1,thing:1,things:1,people:1,person:1,use:1,used:1,using:1,work:1,working:1};

function englishTokens(value){
  return norm(value).split(/[^a-z0-9']+/i).map(norm).filter(function(token){return token.length>2&&!ASSOCIATION_TOKEN_STOP[token]});
}

function associationTokens(word){
  let tokens=englishTokens(word.word).concat(englishTokens(word.definition),englishTokens(word.meaningEn));
  arr(word.collocations).concat(arr(word.phraseCollocations)).forEach(function(item){
    tokens=tokens.concat(phraseTokens(item).filter(function(token){return !ASSOCIATION_TOKEN_STOP[token]}));
  });
  return uniq(tokens);
}

const SCENE_RULES=[
  ["求职招聘",/求职|招聘|职业|雇佣|工资|薪水|面试|简历|job (?:vacancy|position)|career|employ|recruit|vacancy|salary|interview|resume|occupation/i,/求职|招聘|employment/i],
  ["办公管理",/办公室|公司|部门|经理|管理|会议|合同|截止日期|office|company|department|manager|management|meeting|contract|deadline|staff/i,/办公|商业|管理|business/i],
  ["银行支付",/银行|存款|贷款|现金|付款|支付|账户|押金|费用|预算|价格|bank|deposit|loan|cash|payment|account|fee|budget|price|dollar|card/i,/支付|消费|经济|finance|shopping/i],
  ["邮寄通信",/邮寄|邮件|信件|包裹|邮资|通信|快递|mail|airmail|postage|parcel|letter|delivery|courier/i,/邮寄|通信|公共服务|communication/i],
  ["机场航班",/机场|航班|登机|行李|护照|海关|航空|airport|flight|boarding|luggage|passport|customs|airline|departure|arrival gate/i,/航空|机场|旅行|交通|travel/i],
  ["铁路交通",/铁路|火车|车站|站台|公交|地铁|交通|railway|train|station|platform|bus|subway|transport/i,/交通|铁路/i],
  ["旅行住宿",/旅行|旅游|酒店|宾馆|预订|住宿|景点|travel|tour|hotel|hostel|booking|reservation|accommodation|tourist/i,/旅行|住宿|travel/i],
  ["住房租赁",/住房|房屋|租房|房租|公寓|家具|家务|房东|房客|housing|house|rent|apartment|furniture|household|landlord|tenant/i,/住房|家庭|生活|housing/i],
  ["购物售后",/购物|商店|商品|退款|折扣|收据|顾客|shopping|shop|store|refund|discount|receipt|customer|purchase/i,/购物|消费|shopping/i],
  ["餐饮食物",/餐饮|食物|食品|餐厅|烹饪|饮料|菜单|food|restaurant|cook|meal|drink|menu|recipe/i,/餐饮|食物|消费|food/i],
  ["医疗就诊",/医疗|医院|疾病|症状|诊断|治疗|药物|手术|hospital|disease|illness|symptom|diagnosis|treatment|medicine|surgery|clinical/i,/健康|医疗|health/i],
  ["健康生活",/健康|锻炼|运动|营养|休息|康复|health|exercise|fitness|nutrition|rest|recover|wellbeing/i,/健康|健身|health/i],
  ["校园课程",/学校|校园|课程|课堂|老师|学生|讲座|school|campus|course|class|teacher|student|lecture|tuition/i,/学校|教育|education/i],
  ["考试学习",/学习|考试|测验|作业|入学|奖学金|study|learn|exam|test|assignment|admission|scholarship|qualification/i,/教育|考试|education/i],
  ["环境污染",/环境|污染|垃圾|回收|生态|碳|塑料|environment|pollution|waste|recycle|ecology|carbon|plastic/i,/环境|environment/i],
  ["能源气候",/气候|能源|温度|天气|排放|全球变暖|climate|energy|temperature|weather|emission|global warming/i,/环境|科技|environment/i],
  ["科技网络",/科技|技术|软件|网络|媒体|互联网|设备|technology|software|network|media|internet|device|digital|computer|online/i,/科技|technology/i],
  ["科研数据",/研究|实验|数据|证据|分析|调查|样本|research|experiment|data|evidence|analysis|survey|sample|laboratory/i,/科学|研究|science/i],
  ["政府法律",/政府|法律|犯罪|警察|安全|法庭|政策|选举|government|law|crime|police|security|court|policy|election|politician/i,/政府|法律|社会|government|law/i],
  ["社区服务",/社区|公共服务|市政|设施|图书馆|居民|community|public service|municipal|facility|library|resident/i,/社区|公共服务|community/i],
  ["家庭人际",/家庭|朋友|关系|婚姻|父母|孩子|社交|family|friend|relationship|marriage|parent|child|social/i,/家庭|人际|family/i],
  ["文化活动",/文化|历史|艺术|音乐|电影|活动|典礼|culture|history|art|music|film|event|ceremony|festival/i,/文化|历史|社会|culture/i],
  ["农业自然",/农业|农场|植物|动物|森林|海洋|土壤|agriculture|farm|plant|animal|forest|marine|soil|wildlife/i,/环境|农业|自然|environment/i]
];

function sceneForWord(word){
  const content=[word.word,word.meaning,word.category].concat(arr(word.collocations).map(phraseText),arr(word.phraseCollocations).map(phraseText)).filter(Boolean).join(" ");
  const topics=arr(word.topics).join(" ");
  let best="",bestScore=0;
  SCENE_RULES.forEach(function(rule){
    const score=(rule[1].test(content)?4:0)+(rule[2].test(topics)?4:0);
    if(score>bestScore){best=rule[0];bestScore=score}
  });
  return best;
}

function orderSceneWords(source,preferredScene){
  if(source.length<2)return source;
  const profiles=source.map(function(word,position){return {word:word,position:position,key:norm(word.word),scene:sceneForWord(word)||preferredScene||"",links:explicitAssociationLinks(word),tokens:associationTokens(word)}});
  const positionByKey=new Map(profiles.map(function(profile){return [profile.key,profile.position]}));
  const tokenPositions=new Map();
  profiles.forEach(function(profile){profile.tokens.forEach(function(token){if(!tokenPositions.has(token))tokenPositions.set(token,[]);tokenPositions.get(token).push(profile.position)})});
  const remaining=new Set(profiles.map(function(profile){return profile.position}));
  const ordered=[];
  let currentPosition=Math.min.apply(null,Array.from(remaining));
  while(remaining.size){
    if(!remaining.has(currentPosition)){
      const activeScene=ordered.length?sceneForWord(ordered[ordered.length-1]):preferredScene;
      const sameScene=Array.from(remaining).filter(function(position){return !activeScene||profiles[position].scene===activeScene}).sort(function(a,b){return profiles[a].word.originalIndex-profiles[b].word.originalIndex});
      currentPosition=sameScene[0]??Math.min.apply(null,Array.from(remaining));
    }
    const current=profiles[currentPosition];
    ordered.push(current.word);
    remaining.delete(currentPosition);
    if(!remaining.size)break;
    const scores=new Map();
    current.links.forEach(function(key){const candidate=positionByKey.get(key);if(remaining.has(candidate))scores.set(candidate,1000)});
    current.tokens.forEach(function(token){
      const positions=tokenPositions.get(token)||[];
      if(positions.length>80)return;
      const weight=Math.max(12,72-positions.length);
      positions.forEach(function(candidate){
        if(!remaining.has(candidate))return;
        const profile=profiles[candidate];
        const bonus=profile.key===token||current.key===token?90:0;
        const sceneBonus=current.scene&&profile.scene===current.scene?24:0;
        scores.set(candidate,(scores.get(candidate)||0)+weight+bonus+sceneBonus);
      });
    });
    const strongest=Array.from(scores.entries()).filter(function(item){return item[1]>=96}).sort(function(a,b){return b[1]-a[1]||profiles[a[0]].word.originalIndex-profiles[b[0]].word.originalIndex})[0];
    if(strongest){currentPosition=strongest[0];continue}
    const sameScene=Array.from(remaining).filter(function(position){return current.scene&&profiles[position].scene===current.scene}).sort(function(a,b){return profiles[a].word.originalIndex-profiles[b].word.originalIndex});
    currentPosition=sameScene[0]??Math.min.apply(null,Array.from(remaining));
  }
  return ordered;
}

function generateStudyList(source,pref){
  const ordered=source.slice();
  if(ordered.length<2)return ordered;
  if(!sharedWordStudyOrdering)throw new Error("共享单词排序模块尚未加载");
  const idictation=isIdictationFilter(filter);
  const pool=idictation?ordered:words;
  const byIndex=new Map(ordered.map(function(word){return [word.originalIndex,word]}));
  const orderedIndices=sharedWordStudyOrdering.orderStudyWordIndices(
    ordered.map(function(word){return word.originalIndex}),
    pool,
    {
      mode:pref.mode,
      difficultyMode:pref.difficultyMode,
      difficultyEnabled:!idictation,
      seed:pref.seed,
      idictation:idictation
    }
  );
  return orderedIndices.map(function(sourceIndex){return byIndex.get(sourceIndex)}).filter(Boolean);
}

function orderStudyList(source,activeFilter){
  const pref=wordOrderPreference(activeFilter);
  const fresh=generateStudyList(source,pref);
  const snapshotKey=wordOrderSnapshotKey(pref.mode,pref.difficultyMode);
  if(!isFixedWordOrderMode(pref.mode,pref.difficultyMode)||!pref.snapshots[snapshotKey])return fresh;
  const previous=pref.snapshots[snapshotKey];
  const resolved=reconcileWordOrderSnapshot(previous,fresh,fresh);
  const previousIndices=arr(previous&&previous.indices);
  const nextIndices=arr(resolved.snapshot&&resolved.snapshot.indices);
  const changed=Number(previous&&previous.version)!==WORD_ORDER_SNAPSHOT_VERSION
    ||previous.sourceCount!==resolved.snapshot.sourceCount
    ||previous.sourceSignature!==resolved.snapshot.sourceSignature
    ||previous.cursorKey!==resolved.snapshot.cursorKey
    ||previousIndices.length!==nextIndices.length
    ||previousIndices.some(function(value,index){return value!==nextIndices[index]});
  if(changed)saveWordOrderSnapshot(activeFilter,snapshotKey,resolved.snapshot);
  return resolved.items;
}

function syncWordOrderControls(){
  const pref=wordOrderPreference(filter);
  if(els.orderSelect){
    els.orderSelect.value=pref.mode;
    const currentOption=els.orderSelect.querySelector('option[value="current"]');
    if(currentOption)currentOption.textContent=isFixedWordOrderMode(pref.mode,pref.difficultyMode)?"切回现有顺序":"现有顺序";
  }
  if(els.difficultyOrderSelect){
    const excluded=isIdictationFilter(filter);
    const available=difficultyProfile(sourceList(filter)).available;
    els.difficultyOrderSelect.hidden=excluded;
    els.difficultyOrderSelect.disabled=excluded||pref.mode==="random"||!available;
    els.difficultyOrderSelect.value=excluded?"default":pref.difficultyMode;
  }
}

function meaningsHidden(){
  return document.documentElement.dataset.studyMeaningsHidden==="true";
}

function updateMeaningVisibilityButton(){
  if(!els.meaningVisibilityBtn)return;
  const hidden=meaningsHidden();
  els.meaningVisibilityBtn.textContent=hidden?"显示释义":"隐藏释义";
  els.meaningVisibilityBtn.removeAttribute("aria-pressed");
  els.meaningVisibilityBtn.dataset.state=hidden?"hidden":"visible";
}

function setMeaningsHidden(hidden){
  document.documentElement.dataset.studyMeaningsHidden=hidden?"true":"false";
  try{localStorage.setItem(MEANING_VISIBILITY_KEY,hidden?"1":"0")}catch(e){}
  updateMeaningVisibilityButton();
}


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

function previewWordForFilter(activeFilter,saved,count){
  if(!saved||count<=0)return "";
  if(isIdictationFilter(activeFilter)){
    const source=getIdictationSource(activeFilter.slice(11));
    const entry=source&&source.entries?source.entries.find(function(w){
      if(norm(w.word)===saved||norm(w.expectedAnswer)===saved)return true;
      return arr(w.acceptedAnswers).map(norm).indexOf(saved)>=0;
    }):null;
    return entry?(entry.word||entry.expectedAnswer||""):"";
  }
  const pool=poolForFilter(activeFilter);
  const matched=pool.find(function(w,i){
    return norm(w.word)===saved&&passFilterWith(activeFilter,w,i);
  });
  return matched?matched.word:"";
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
  {title:"今日学习",items:[
    {title:"待学词浏览",desc:"从全部可刷词中排除已认识词和专项参考词。",filter:"all"},
    {title:"不熟词",desc:"所有标记不熟的词，优先复习。",filter:"unfamiliar"},
    {title:"收藏词",desc:"写作、口语、书信可直接用的重点词。",filter:"favorite"}
  ]},
  {title:"保留专项词库",highlight:true,items:[
    {title:"爱听写听力",desc:"按听力答案词和出现频率整理的独立刷词入口。",filter:"idictation:listening"},
    {title:"爱听写阅读",desc:"按阅读高频答案词和出现频率整理的独立刷词入口。",filter:"idictation:reading"}
  ]},
  {title:"按使用场景",items:[
    {title:"G类书信",desc:"投诉、申请、预约、感谢、道歉、解释。",filter:"ielts:G类书信"},
    {title:"Listening",desc:"听力生活场景词，优先听音频反应。",filter:"ielts:Listening"},
    {title:"Speaking",desc:"口语可用表达，适合造句。",filter:"ielts:Speaking"},
    {title:"Reading",desc:"阅读识别为主，不要求全会写。",filter:"ielts:Reading"},
    {title:"Task 2",desc:"社会、教育、环境、科技观点词。",filter:"ielts:Task 2"},
    {title:"生活/工作高频",desc:"住房、交通、健康、消费、工作。",filter:"life-work"}
  ]},
  {title:"主词库学习层级",items:[
    {title:"基础必会",desc:"进入后仍可按本入口的相对难度细分。",filter:"difficulty:基础高频"},
    {title:"核心高频",desc:"进入后可先学相对较易或相对较难部分。",filter:"difficulty:中级核心"},
    {title:"高级认识",desc:"低频但有价值的扩展词，以识别为主。",filter:"difficulty:高级加分"},
    {title:"专业参考",desc:"专业词、专名和低频词，只需结合语境识别。",filter:"difficulty:低频认识即可"},
    {title:"全部可刷词",desc:"全部独立学习卡，包含熟悉词。",filter:"everything"}
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

function sourceList(activeFilter){
  const f=activeFilter||filter;
  const pool=poolForFilter(f);
  return pool.map(function(w,i){return Object.assign({},w,{originalIndex:i})}).filter(function(w){return passFilterWith(f,w)});
}

function list(activeFilter){
  const f=activeFilter||filter;
  const pref=wordOrderPreference(f);
  const cacheKey=[f,restoreFocusWord,pref.mode,pref.difficultyMode,pref.seed].join("\u0001");
  if(studyListCache.has(cacheKey))return studyListCache.get(cacheKey);
  const ordered=orderStudyList(sourceList(f),f);
  studyListCache.set(cacheKey,ordered);
  return ordered;
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
}

  if(found<0&&progress.currentWord){
    const currentKey=norm(progress.currentWord);
    found=pool.findIndex(function(w){return norm(w.word)===currentKey&&passFilterWith(f,w)});
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
  invalidateStudyListCache();
  rememberPositionForCurrentFilter();
  filter=nextFilter||"all";
  progress.filter=filter;
  syncWordOrderControls();
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
function isReferenceWord(word){
  if(!word||word.studyMode!=="reference")return false;
  const hasBase=Boolean(norm(word.baseWord)||String(word.baseWordId||"").trim()||norm(word.redirectToWord));
  return hasBase||word.entryType==="word-reference"||word.entryType==="inflected-form";
}
function brushableWords(list){
  return (Array.isArray(list)?list:[]).filter(function(word){return !isReferenceWord(word)});
}
function mergeReadingMainSupplements(baseWords){
  let supplements=[];
  try{
    const payload=JSON.parse(safeLsGet(READING_MAIN_SUPPLEMENT_KEY)||"null");
    supplements=Array.isArray(payload)?payload:(Array.isArray(payload&&payload.words)?payload.words:[]);
  }catch(e){supplements=[]}
  if(!supplements.length)return baseWords;
  const known=new Set(baseWords.map(function(entry){return norm(entry&&entry.word)}));
  const merged=baseWords.slice();
  supplements.forEach(function(entry){
    const wordKey=norm(entry&&entry.word);
    if(!wordKey||known.has(wordKey))return;
    known.add(wordKey);
    merged.push(entry);
  });
  return merged;
}

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
  if(!mainDeleteConfirmedInSession){
    if(!confirm("确定删除这个单词？\n\n"+w.word+"\n\n将从本机词库隐藏/删除 "+sameCount+" 条同名单词记录。电脑端正式删除后重新发布，会彻底移除。本次打开页面后续删除不再重复确认。"))return;
    mainDeleteConfirmedInSession=true;
  }
  const oldIndex=index;
  const previousWords=words;
  const pref=wordOrderPreference(filter);
  const oldOrderedQueue=list();
  const oldQueuePosition=oldOrderedQueue.findIndex(function(item){return item.originalIndex===oldIndex});
  const oldToNewIndex=new Map();
  const nextWords=[];
  words.forEach(function(item,sourceIndex){
    if(norm(item.word)===baseKey)return;
    oldToNewIndex.set(sourceIndex,nextWords.length);
    nextWords.push(item);
  });
  saveDeletedWord(baseKey);
  words=nextWords;
  invalidateStudyListCache();
  const remappedSnapshots=remapWordOrderSnapshotsAfterDeletion(pref.snapshots,previousWords);
  Object.keys(remappedSnapshots).forEach(function(snapshotKey){
    saveWordOrderSnapshot(filter,snapshotKey,remappedSnapshots[snapshotKey]);
  });
  if(isFixedWordOrderMode(pref.mode,pref.difficultyMode)){
    let survivorsBeforeCurrent=0;
    const preservedQueue=[];
    oldOrderedQueue.forEach(function(item,queuePosition){
      const nextIndex=oldToNewIndex.get(item.originalIndex);
      if(!Number.isInteger(nextIndex))return;
      if(queuePosition<oldQueuePosition)survivorsBeforeCurrent+=1;
      preservedQueue.push(Object.assign({},words[nextIndex],{originalIndex:nextIndex}));
    });
    const nextQueuePosition=Math.min(survivorsBeforeCurrent,preservedQueue.length-1);
    index=preservedQueue.length
      ?preservedQueue[Math.max(0,nextQueuePosition)].originalIndex
      :Math.min(oldIndex,Math.max(0,words.length-1));
    const snapshotKey=wordOrderSnapshotKey(pref.mode,pref.difficultyMode);
    saveWordOrderSnapshot(filter,snapshotKey,createWordOrderSnapshot(preservedQueue,index));
  }else{
    index=Math.min(oldIndex,Math.max(0,words.length-1));
  }
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
  invalidateStudyListCache();
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
function posKey(pos){return String(pos||"").trim().toLowerCase().split(/\s*[\/,|&;·／、]\s*/).map(function(atom){return atom.replace(/\.$/,"")}).filter(Boolean).sort().join("|")}
function inlineStudyMeaning(item){
  const primary=String(item&&item.meaning||"等待释义").trim()||"等待释义";
  const primaryKey=posKey(item&&item.pos);
  const supplemental=Array.isArray(item&&item.supplementalMeanings)?item.supplementalMeanings:[];
  return [primary].concat(supplemental.map(function(sense){
    const meaning=String(sense&&sense.meaning||"").trim();
    const sensePos=String(sense&&sense.pos||"").trim();
    const posLabel=sensePos&&posKey(sensePos)!==primaryKey?posDisplay(sensePos)+" ":"";
    return meaning?posLabel+meaning:"";
  }).filter(Boolean)).join("；");
}
function mainMeaningDetail(item,meaning){
  const word=String(item&&item.word||"").trim();
  const primary=String(meaning||item&&item.meaningZh||item&&item.meaning||"").trim();
  const rawDetail=String(item&&(item.meaningDetailZh||item.meaningDetailedZh)||"").trim();
  const compact=function(value){return String(value||"").trim().toLowerCase().replace(/[“”"'‘’；;，,。.!！?？、：:\s]/g,"")};
  const primaryKeys=primary.split(/[；;，,、/]+/).map(compact).filter(Boolean);
  const wholePrimaryKey=compact(primary);
  const semantic=[];
  const collocations=[];
  const hasPlaceholder=/无中文释义|暂无释义|待补充|待完善|待审核|需要复核|专有名词，需结合原文识别/.test(rawDetail);
  if(rawDetail&&!hasPlaceholder){
    rawDetail.split(/[。！？!?；;]+/).forEach(function(part){
      const clause=String(part||"").trim().replace(/^[，,：:\s]+|[，,：:\s]+$/g,"");
      const clauseKey=compact(clause);
      if(!clauseKey||clauseKey===wholePrimaryKey||primaryKeys.indexOf(clauseKey)>=0)return;
      const lower=clause.toLowerCase();
      const wordLower=word.toLowerCase();
      const headwordPrefix=word&&(lower.indexOf(wordLower+":")===0||lower.indexOf(wordLower+"：")===0);
      const remainder=headwordPrefix?clause.slice(word.length+1).trim():"";
      if(headwordPrefix&&(compact(remainder)===wholePrimaryKey||primaryKeys.indexOf(compact(remainder))>=0))return;
      if(/^(?:“?[a-z][a-z' -]*”?)(?:常见含义为|在雅思(?:听力|阅读)?中的常用含义是|的核心意思是|表示|在当前词条中)/i.test(clause))return;
      if(/^(?:本词条|该词|“?[a-z][a-z' -]*”?)?(?:按|作).*(?:词|使用)$/i.test(clause))return;
      if(/^(?:常见|固定|短语)?搭配(?:有|包括|如|例如)?[“"']?.+$/.test(clause)){collocations.push(clause);return;}
      if(/(?:(?:复数(?:形式)?|第三人称单数(?:形式)?|过去式|过去分词|现在分词|动名词|比较级|最高级)(?:形式)?$|^(?:plural|third[- ]person singular|past tense|past participle|present participle|gerund|comparative|superlative)(?:\s+form)?\s*(?:为|是|[:：]|is\b).+$)/i.test(clause))return;
      if(/^例句提示[：:]?/.test(clause))return;
      if(/^在当前例句中[，,:：]?/.test(clause)){
        const exampleRemainder=clause.replace(/^在当前例句中[，,:：]?/,"").trim();
        const exampleCn=String(item&&(item.exampleCn||item.exampleChinese||item.example_chinese)||"").trim();
        if(exampleCn&&(compact(exampleRemainder)===compact(exampleCn)||compact(exampleRemainder).indexOf(compact(exampleCn))>=0||compact(exampleCn).indexOf(compact(exampleRemainder))>=0))return;
      }
      semantic.push(clause);
    });
  }
  const semanticVerified=semantic.join("；");
  if((semanticVerified.match(/[\u3400-\u9fff]/g)||[]).length>=8){
    const verified=semantic.concat(collocations).join("；");
    return/[。！？!?]$/.test(verified)?verified:verified+"。";
  }
  return primary?"现有资料只确认了主释义，语义范围和实际用法仍待补充。":"该词的主释义和详细说明均待补充。";
}
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
      const pref=wordOrderPreference(filter);
      const snapshotKey=wordOrderSnapshotKey(pref.mode,pref.difficultyMode);
      const snapshot=pref.snapshots[snapshotKey];
      if(isFixedWordOrderMode(pref.mode,pref.difficultyMode)&&snapshot){
        const cursorKey=wordOrderEntryKey(w);
        const containsWord=Number(snapshot.version)===WORD_ORDER_SNAPSHOT_VERSION
          ?arr(snapshot.indices).includes(index)
          :arr(snapshot.keys).includes(cursorKey);
        if(containsWord&&snapshot.cursorKey!==cursorKey){
          saveWordOrderCursor(filter,snapshotKey,cursorKey);
        }
      }
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
  invalidateStudyListCache();

  filter=progress.filter||"all";
  mobileMode=!!progress.mobileMode;
  restoreFocusWord="";
  applyIndexForFilter(filter,{allowFirstFallback:false});
}

function buildFilterOptions(){
  const primary=[
    {value:"all",label:"全部待学"},
    {value:"everything",label:"全部单词"},
    {value:"unfamiliar",label:"不熟词库"},
    {value:"familiar",label:"熟悉词库"},
    {value:"favorite",label:"收藏"},
    {value:"life-work",label:"生活/工作高频"}
  ];
  const groups=[
    {label:"保留专项词库",items:[
      {value:"idictation:listening",label:"爱听写听力"},
      {value:"idictation:reading",label:"爱听写阅读"}
    ]},
    {label:"按使用场景",items:[
      {value:"ielts:G类书信",label:"G类书信"},
      {value:"ielts:Listening",label:"Listening"},
      {value:"ielts:Speaking",label:"Speaking"},
      {value:"ielts:Reading",label:"Reading"},
      {value:"ielts:Task 2",label:"Task 2"}
    ]},
    {label:"主词库学习层级",items:[
      {value:"difficulty:基础高频",label:"基础必会"},
      {value:"difficulty:中级核心",label:"核心高频"},
      {value:"difficulty:高级加分",label:"高级认识"},
      {value:"difficulty:阅读扩展",label:"阅读扩展"},
      {value:"difficulty:低频认识即可",label:"专业参考"}
    ]},
    {label:"主题",items:[
      "教育","工作","住房","交通","健康","环境","科技","政府","社会","消费","旅行","社区","法律","家庭","公共服务"
    ].map(function(label){return {value:"topic:"+label,label:label}})}
  ];
  let html=primary.map(function(item){return '<option value="'+escapeHtml(item.value)+'">'+escapeHtml(item.label)+'</option>'}).join("");
  groups.forEach(function(group){
    const available=group.items.filter(function(item){return countForFilter(item.value)>0});
    if(!available.length)return;
    html+='<optgroup label="'+escapeHtml(group.label)+'">'+available.map(function(item){return '<option value="'+escapeHtml(item.value)+'">'+escapeHtml(item.label)+' · '+countForFilter(item.value)+'</option>'}).join("")+'</optgroup>';
  });
  els.filterSelect.innerHTML=html;
  if(!Array.from(els.filterSelect.options).some(function(option){return option.value===filter}))filter="all";
  els.filterSelect.value=filter;
}

function passFilterWith(activeFilter,w){
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
  const compactDesktop=!!(window.matchMedia&&window.matchMedia("(min-width: 901px) and (max-height: 900px)").matches);
  if(compactDesktop)return"compact-desktop";
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
  topToolsCollapsed=saved===null?(viewport==="mobile"||viewport==="compact-desktop"):saved==="1";
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
    if(audio){
      audio.onended=null;
      audio.onerror=null;
      try{audio.pause()}catch(e){}
      try{audio.currentTime=0}catch(e){}
    }
    if("speechSynthesis" in window) window.speechSynthesis.cancel();
    const url=await cachedAudioUrl(path,1200);
    audio=new Audio(url);
    audio.preload="auto";
    audio.playsInline=true;
    audio.volume=1;
    await audio.play();
    toast("Edge TTS 音频："+(label||"音频"));
  }catch(e){
    if(audio){
      try{audio.pause()}catch(ignore){}
      audio=null;
    }
    browserSpeak(text,label);
  }
}

function prewarm(path){
  if(!path||!("caches" in window))return;
  const run=function(){cachedAudioUrl(path,2500).catch(function(){})};
  if("requestIdleCallback" in window) requestIdleCallback(run,{timeout:2500});
  else setTimeout(run,700);
}

function renderList(box,el,items){
  el.innerHTML="";
  const rows=arr(items).map(function(x){
    const text=typeof x==="string"?x:(x.phrase||x.word||x.replacement||"");
    const meaning=typeof x==="string"?"":(x.chinese||x.meaning||x.meaningZh||x.meaning_zh||"");
    return {raw:x,text:String(text||"").trim(),meaning:String(meaning||"").trim()};
  }).filter(function(row,index,all){
    return row.text&&all.findIndex(function(candidate){return norm(candidate.text)===norm(row.text)})===index;
  }).slice(0,3);
  box.classList.toggle("hidden",rows.length===0);
  rows.forEach(function(row){
    const x=row.raw;
    const text=row.text;
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML='<button class="mini-sound">🔊</button><div><div class="en"></div><div class="zh"></div></div>';
    div.querySelector(".en").textContent=text;
    div.querySelector(".zh").textContent=row.meaning||"释义待补全";
    div.querySelector("button").onclick=function(){play(x&&x.audio,text,text)};
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
      const previewWord=previewWordForFilter(item.filter,saved,count);
      const btn=document.createElement("button");
      btn.className="entry-btn"+(filter===item.filter?" active":"");
      btn.innerHTML='<span class="entry-title"></span><span class="entry-desc"></span><span class="entry-meta"></span>';
      btn.querySelector(".entry-title").textContent=item.title;
      btn.querySelector(".entry-desc").textContent=item.desc;
      btn.querySelector(".entry-meta").textContent=count+" 个"+(previewWord?" · "+previewWord:"");
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
  invalidateStudyListCache();
  updateStatusCounts();
  renderEntryList();
  syncWordOrderControls();
  updateMeaningVisibilityButton();
  const l=list();
  const w=current();
  if(!w){
    els.word.classList.remove("word--wide","word--long");
    els.word.textContent="完成";
    els.basic.textContent="当前范围没有待学习单词";
    if(els.meaningDetailText)els.meaningDetailText.textContent="";
    els.loadInfo.textContent="可以切换分类或查看熟悉词库。";
    els.count.textContent="0 / 0";
    els.progressFill.style.width="0%";
    if(els.progressSeek){
      els.progressSeek.max="1";
      els.progressSeek.value="1";
      els.progressSeek.disabled=true;
    }
    if(els.progressJumpForm)els.progressJumpForm.classList.add("hidden");
    persistSoon();
    return;
  }

  const renderedHeadword=String(w.word||"empty");
  els.word.classList.toggle("word--wide",renderedHeadword.trim().length>9);
  els.word.classList.toggle("word--long",renderedHeadword.trim().length>18);
  els.word.textContent=renderedHeadword;
  els.basic.textContent=(w.phonetic||"等待音标")+" · "+posDisplay(w.pos)+" · "+inlineStudyMeaning(w);
  if(els.meaningDetailText)els.meaningDetailText.textContent=mainMeaningDetail(w,w.meaning);
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
  renderList(
    els.synonymsBox,
    els.synonyms,
    arr(w.synonymDetails).length?w.synonymDetails:w.synonyms
  );
  renderList(els.phraseCollocationsBox,els.phraseCollocations,w.phraseCollocations);

  const pos=Math.max(0,l.findIndex(function(x){return x.originalIndex===index}));
  els.count.textContent=(pos+1)+" / "+l.length;
  els.progressFill.style.width=(l.length?((pos+1)/l.length*100):0)+"%";
  els.count.setAttribute("aria-label","精确跳转位置，当前第 "+(pos+1)+" / "+l.length+" 个词");
  if(els.progressSeek){
    els.progressSeek.max=String(Math.max(1,l.length));
    els.progressSeek.value=String(pos+1);
    els.progressSeek.disabled=l.length<2;
    els.progressSeek.setAttribute("aria-valuetext","第 "+(pos+1)+" / "+l.length+" 个词："+(w.word||""));
  }
  if(els.progressJumpInput){
    els.progressJumpInput.max=String(Math.max(1,l.length));
    els.progressJumpInput.value=String(pos+1);
  }
  if(els.progressJumpTotal)els.progressJumpTotal.textContent="/ "+l.length;
  prewarm(w.audio);
  persistSoon();
}

function clampProgressPosition(value,total){
  const max=Math.max(0,Math.floor(Number(total)||0));
  if(!max)return 0;
  const parsed=Math.round(Number(value));
  if(!Number.isFinite(parsed))return 1;
  return Math.min(max,Math.max(1,parsed));
}

function previewProgressPosition(value){
  const l=list();
  const position=clampProgressPosition(value,l.length);
  const target=l[position-1];
  if(!target)return;
  els.count.textContent=position+" / "+l.length;
  els.progressFill.style.width=(position/l.length*100)+"%";
  if(els.progressPreview){
    els.progressPreview.textContent=target.word||Math.round(position/l.length*100)+"%";
    els.progressPreview.classList.remove("hidden");
  }
  els.progressSeek.setAttribute("aria-valuetext","第 "+position+" / "+l.length+" 个词："+(target.word||""));
}

function seekProgressPosition(value){
  const l=list();
  const position=clampProgressPosition(value,l.length);
  const target=l[position-1];
  if(!target)return;
  restoreFocusWord="";
  index=target.originalIndex;
  if(els.progressPreview)els.progressPreview.classList.add("hidden");
  render();
  persistNow();
  scheduleCloudSync();
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
  const beforeList=list().slice();
  const beforePosition=beforeList.findIndex(function(x){return x.originalIndex===beforeIndex});
  const w=current();
  if(!w)return;
  w.status=(status==="不熟"&&w.status==="不熟")?"":status;
  invalidateStudyListCache();
  rememberWord(w);
  const nextList=list();
  if(nextList.length){
    for(let offset=1;offset<=beforeList.length;offset+=1){
      const candidate=beforeList[(Math.max(0,beforePosition)+offset)%beforeList.length];
      const next=nextList.find(function(x){return x.originalIndex===candidate.originalIndex});
      if(next){index=next.originalIndex;break}
    }
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

  const rows=[];
  let offset=0;
  while(offset<CLOUD_PROGRESS_MAX_ROWS){
    const result=await cloudbaseDb
      .collection("vocab_progress")
      .where({syncCodeHash:cloudbaseDocId,vocabId:getVocabId()})
      .skip(offset)
      .limit(CLOUD_PROGRESS_PAGE_SIZE)
      .get();
    const page=(result&&Array.isArray(result.data)?result.data:[])
      .filter(function(x){return x&&x.syncCodeHash===cloudbaseDocId&&((x.vocabId||"")===getVocabId())});
    rows.push.apply(rows,page);
    if(page.length<CLOUD_PROGRESS_PAGE_SIZE)break;
    offset+=page.length;
  }
  if(rows.length>=CLOUD_PROGRESS_MAX_ROWS){
    console.warn("CloudBase progress rows reached safety limit",CLOUD_PROGRESS_MAX_ROWS);
  }

  // 兼容旧版累计产生的多条记录：分页读取后再按单词时间戳合并。
  return mergeCloudRows(rows);
}

async function setCloudDoc(data){
  if(!cloudbaseDb||!cloudbaseDocId) throw new Error("未连接同步码");

  // READONLY 允许所有用户读取、仅创建者写入。
  // 每台设备使用自己的稳定文档 ID：第一次创建，之后覆盖本设备记录，
  // 避免每次操作都新增文档并最终超过 CloudBase 单次 1000 条读取上限。
  const deviceId=progress.deviceId||getDeviceId();
  const deviceDocId="progress_"+(await sha256Text(cloudbaseDocId+"|"+getVocabId()+"|"+deviceId)).slice(0,48);
  const payload=Object.assign({
    syncCodeHash:cloudbaseDocId,
    vocabId:getVocabId(),
    syncKey:cloudbaseDocId+"__"+getVocabId(),
    deviceId:deviceId,
    createdAt:Date.now()
  },data);

  const loginStateBeforeWrite=await getLoginStateSafe(cloudbaseAuth);
  if(!loginStateBeforeWrite) throw new Error("写入前没有登录态 credentials not found");
  await cloudbaseDb.collection("vocab_progress").doc(deviceDocId).set(payload);
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
    restoreFocusWord="";
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
  invalidateStudyListCache();
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
function changeWordOrderCombination(nextMode,nextDifficultyMode,label){
  restoreFocusWord="";
  // 先同步保存当前组合的游标，避免用户快速切换时尚未执行延迟保存，
  // 再切回来却落到该组合的第一个词。
  persistNow();
  const currentWord=currentRaw();
  const source=sourceList(filter);
  const previous=wordOrderPreference(filter);
  nextMode=normalizeWordOrderMode(nextMode);
  nextDifficultyMode=isIdictationFilter(filter)?"default":normalizeDifficultyMode(nextDifficultyMode);
  if(nextMode==="random"){
    const seed=Date.now();
    saveWordOrderPreference(filter,nextMode,previous.difficultyMode,{seed:seed});
    const next=generateStudyList(source,{mode:nextMode,difficultyMode:"default",seed:seed,snapshots:{}});
    if(next.length)index=next[0].originalIndex;
  }else if(isFixedWordOrderMode(nextMode,nextDifficultyMode)){
    const snapshotKey=wordOrderSnapshotKey(nextMode,nextDifficultyMode);
    const fresh=generateStudyList(source,{mode:nextMode,difficultyMode:nextDifficultyMode,seed:0,snapshots:previous.snapshots});
    const existing=previous.snapshots[snapshotKey];
    const resolved=existing
      ?reconcileWordOrderSnapshot(existing,fresh,fresh)
      :{items:fresh,cursorIndex:fresh[0]?.originalIndex,snapshot:createWordOrderSnapshot(fresh,fresh[0]?.originalIndex)};
    saveWordOrderSnapshot(filter,snapshotKey,resolved.snapshot);
    saveWordOrderPreference(filter,nextMode,nextDifficultyMode);
    if(Number.isInteger(resolved.cursorIndex))index=resolved.cursorIndex;
  }else{
    saveWordOrderPreference(filter,nextMode,nextDifficultyMode);
    if(currentWord){
      const matched=source.find(function(item){return norm(item.word)===norm(currentWord.word)});
      if(matched)index=matched.originalIndex;
    }
  }
  render();
  toast("已切换为"+label);
}
function completeToolbarSelectAction(control){
  if(!control)return;
  control.blur();
  requestAnimationFrame(function(){
    if(document.activeElement===control)control.blur();
  });
}
if(els.orderSelect) els.orderSelect.onchange=function(e){
  const pref=wordOrderPreference(filter);
  changeWordOrderCombination(e.target.value,pref.difficultyMode,e.target.options[e.target.selectedIndex].text);
  completeToolbarSelectAction(e.target);
};
if(els.difficultyOrderSelect) els.difficultyOrderSelect.onchange=function(e){
  const pref=wordOrderPreference(filter);
  changeWordOrderCombination(pref.mode,e.target.value,e.target.options[e.target.selectedIndex].text);
  completeToolbarSelectAction(e.target);
};
if(els.progressSeek){
  els.progressSeek.oninput=function(e){previewProgressPosition(e.target.value)};
  els.progressSeek.onchange=function(e){seekProgressPosition(e.target.value)};
  els.progressSeek.onpointercancel=function(){
    if(els.progressPreview)els.progressPreview.classList.add("hidden");
    render();
  };
}
if(els.count)els.count.onclick=function(){
  const l=list();
  if(l.length<2||!els.progressJumpForm)return;
  const open=els.progressJumpForm.classList.contains("hidden");
  els.progressJumpForm.classList.toggle("hidden",!open);
  if(open){
    els.progressJumpInput.focus();
    els.progressJumpInput.select();
  }
};
if(els.progressJumpForm)els.progressJumpForm.onsubmit=function(e){
  e.preventDefault();
  seekProgressPosition(els.progressJumpInput.value);
  els.progressJumpInput.blur();
  els.progressJumpForm.classList.add("hidden");
};
if(els.progressJumpCancel)els.progressJumpCancel.onclick=function(){
  els.progressJumpInput.blur();
  els.progressJumpForm.classList.add("hidden");
};
if(els.progressJumpInput)els.progressJumpInput.onkeydown=function(e){
  if(e.key==="Escape"){
    e.preventDefault();
    els.progressJumpInput.blur();
    els.progressJumpForm.classList.add("hidden");
  }
};
if(els.meaningVisibilityBtn) els.meaningVisibilityBtn.onclick=function(){
  setMeaningsHidden(!meaningsHidden());
};
document.getElementById("knownBtn").onclick=function(){mark("熟悉")};
document.getElementById("unknownBtn").onclick=function(){mark("不熟")};
els.favoriteBtn.onclick=function(){
  const w=current();
  if(w){w.favorite=!w.favorite;invalidateStudyListCache();rememberWord(w);render();persistNow();scheduleCloudSync()}
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

/* D2.9 static 538 touch-first swipe */
const staticStudyCard=document.getElementById("staticStudyCard")||els.swipeArea;
if(staticStudyCard&&window.StaticCardSwipe){
  window.StaticCardSwipe.bind(staticStudyCard,function(direction){
    direction==="next"?step(1):step(-1);
  });
}
window.__STATIC_VOCAB_BUILD__={version:APP_VERSION,swipeEngine:"touch-pointer-v5"};

window.addEventListener("keydown",function(e){
  const tag=e.target&&e.target.tagName?e.target.tagName.toLowerCase():"";
  const isTyping=tag==="input"||tag==="textarea"||tag==="select"||(e.target&&e.target.isContentEditable);
  const key=e.key||"";
  const code=e.code||"";
  if(isTyping||e.ctrlKey||e.metaKey||e.altKey)return;
  const isDelete=key==="Delete"||code==="Delete"||e.keyCode===46||e.which===46;
  const isOne=key==="1"||code==="Digit1"||code==="Numpad1";
  const isThree=key==="3"||code==="Digit3"||code==="Numpad3";
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
  if(isOne&&!e.repeat){e.preventDefault();e.stopPropagation();mark("熟悉");return}
  if(isThree&&!e.repeat){e.preventDefault();e.stopPropagation();mark("不熟");return}

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
    navigator.serviceWorker.register("./sw.js?v="+APP_VERSION,{updateViaCache:"none"}).then(function(registration){return registration.update()}).catch(function(){});
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

    const [orderingModule,difficultyModule,res,idictationRes]=await Promise.all([
      import(ORDERING_MODULE_ROOT+"word-study-ordering.mjs"),
      import(ORDERING_MODULE_ROOT+"word-internal-difficulty.mjs"),
      fetch("./data/words.json?v="+APP_VERSION,{cache:"force-cache"}),
      fetch("./data/idictation-frequency.json?v="+APP_VERSION,{cache:"force-cache"}).catch(function(){return null})
    ]);
    sharedWordStudyOrdering=orderingModule;
    sharedWordDifficulty=difficultyModule;
    if(!res.ok) throw new Error("words json failed");
    const data=await res.json();
    const physicalWords=applyDeletedWords(applyWordEdits(mergeReadingMainSupplements(Array.isArray(data.words)?data.words:data)));
    if(idictationRes&&idictationRes.ok) idictationPayload=await idictationRes.json();
    else await ensureIdictationPayload();
    safeLsRemove("static_vocab_words_v1");
    // 静态版不再保存完整 10000 词，只合并“修改过的单词”。
    safeLsRemove("static_vocab_words_v1");
    // Keep the physical-store ID stable for existing cross-device progress, while
    // matching the local app's study-card count by hiding pure inflection references.
    vocabId=computeVocabId(physicalWords);
    words=brushableWords(physicalWords);
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
    console.error("静态首页加载失败",e);
    clearTimeout(slowTimer);
    els.word.textContent="加载失败";
    els.basic.textContent="没有成功读取 data/words.json";
    els.loadInfo.textContent="请确认 GitHub Pages 已上传 data/words.json，并在手机上刷新页面。";
  }
}

boot();
`;

export function buildStaticHomeAppJs({ version, listeningCount, readingCount }) {
  return STATIC_HOME_APP_TEMPLATE
    .replace("__STATIC_SITE_VERSION__", String(version || ""))
    .replace("__STATIC_LISTENING_COUNT__", String(Number(listeningCount) || 0))
    .replace("__STATIC_READING_COUNT__", String(Number(readingCount) || 0));
}
