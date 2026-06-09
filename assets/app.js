const APP_VERSION="20260609_cloudbase_readonly_v2";
const PROGRESS_KEY="static_vocab_progress_v8_cloudbase_readonly";
const OLD_WORDS_KEY="static_vocab_words_v1";
const OLD_SESSION_KEY="static_vocab_session_v1";
const AUDIO_CACHE_NAME="static_vocab_audio_"+APP_VERSION;
const CLOUDBASE_SYNC_CODE_KEY="static_vocab_cloudbase_sync_code_v1";
const CLOUDBASE_SDK_URLS=[
  "https://imgcache.qq.com/qcloud/cloudbase-js-sdk/1.8.1/cloudbase.full.js",
  "https://imgcache.qq.com/qcloud/tcbjs/1.10.0/tcb.js",
  "https://cdn.jsdelivr.net/npm/@cloudbase/js-sdk/dist/index.umd.js"
];

let words=[];
let filter="all";
let index=0;
let audio=null;
let mobileMode=false;
let saveTimer=null;
let audioUrlCache=new Map();
let progress={statuses:{},currentWord:"",filter:"all",mobileMode:false,updatedAt:0,deviceId:""};
let cloudbaseApp=null;
let cloudbaseDb=null;
let cloudbaseAuth=null;
let cloudbaseReady=false;
let cloudbaseSyncCode="";
let cloudbaseDocId="";
let cloudSyncTimer=null;

const els={
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
  syncDisconnectBtn:document.getElementById("syncDisconnectBtn")
};

function norm(v){return String(v||"").trim().toLowerCase().replace(/s+/g," ")}
function arr(v){return Array.isArray(v)?v:[]}
function uniq(values){return Array.from(new Set(values.map(x=>String(x||"").trim()).filter(Boolean)))}
function escapeHtml(v){return String(v||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}

function posCn(pos=""){const t=String(pos).toLowerCase();if(/noun|^n.?$/.test(t))return"名词";if(/verb|^v.?$/.test(t))return"动词";if(/adjective|^adj.?$/.test(t))return"形容词";if(/adverb|^adv.?$/.test(t))return"副词";if(/phrase|短语/.test(t))return"短语";if(/preposition|^prep.?$/.test(t))return"介词";if(/conjunction|^conj.?$/.test(t))return"连词";return""}
function posDisplay(pos){if(!pos)return"词性";const c=posCn(pos);return c&&String(pos).indexOf(c)<0?pos+" "+c:pos}
function formTypeCn(type=""){const t=String(type).toLowerCase();if(t.includes("irregular plural"))return"不规则复数";if(t.includes("plural"))return"复数形式";if(t.includes("past tense / past participle"))return"过去式 / 过去分词";if(t.includes("past tense"))return"过去式";if(t.includes("past participle"))return"过去分词";if(t.includes("present participle"))return"-ing 形式";return type||"变形"}
function formHint(form){const cn=formTypeCn(form.type);if(cn==="复数形式")return"注意复数形式";if(cn==="不规则复数")return"注意不规则复数";if(cn==="过去式")return"注意过去式";if(cn==="过去分词")return"注意过去分词";if(cn==="过去式 / 过去分词")return"注意过去式 / 过去分词";if(cn==="-ing 形式")return"注意 -ing 形式";return form.note||""}

function toast(msg){els.toast.textContent=msg;els.toast.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(function(){els.toast.classList.remove("show")},1500)}

function currentRaw(){return words[index]||null}

function persistNow(){
  try{
    const w=currentRaw();
    if(w) progress.currentWord=w.word||progress.currentWord||"";
    progress.filter=filter;
    progress.mobileMode=mobileMode;
    progress.updatedAt=Date.now();
    progress.deviceId=progress.deviceId||clientId();
    localStorage.setItem(PROGRESS_KEY,JSON.stringify(progress));
  }catch(e){}
}

function persistSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(persistNow,120)}

function rememberWord(w){
  if(!w||!w.word)return;
  progress.statuses[norm(w.word)]={status:w.status||"",favorite:!!w.favorite};
}

function loadProgress(){
  try{
    const saved=JSON.parse(localStorage.getItem(PROGRESS_KEY)||"null");
    if(saved&&typeof saved==="object"){
      progress={statuses:saved.statuses||{},currentWord:saved.currentWord||"",filter:saved.filter||"all",mobileMode:!!saved.mobileMode,updatedAt:saved.updatedAt||0};
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

  if(progress.currentWord){
    const found=words.findIndex(function(w){return norm(w.word)===norm(progress.currentWord)});
    if(found>=0) index=found;
  }
}

function buildFilterOptions(){
  const ielts=uniq(words.flatMap(function(w){return arr(w.ieltsUse)}));
  const topics=uniq(words.flatMap(function(w){return arr(w.topics)}));
  const difficulty=uniq(words.map(function(w){return w.difficulty}));

  let html="";
  html+='<option value="all">全部待学</option>';
  html+='<option value="unfamiliar">不熟词库</option>';
  html+='<option value="familiar">熟悉词库</option>';
  html+='<option value="favorite">收藏</option>';
  if(ielts.length) html+='<optgroup label="IELTS 用途">'+ielts.map(function(x){return '<option value="ielts:'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>'}).join("")+'</optgroup>';
  if(topics.length) html+='<optgroup label="主题分类">'+topics.map(function(x){return '<option value="topic:'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>'}).join("")+'</optgroup>';
  if(difficulty.length) html+='<optgroup label="难度分类">'+difficulty.map(function(x){return '<option value="difficulty:'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>'}).join("")+'</optgroup>';

  els.filterSelect.innerHTML=html;
  if(!Array.from(els.filterSelect.options).some(function(o){return o.value===filter})) filter="all";
  els.filterSelect.value=filter;
}

function passFilter(w){
  if(filter==="familiar") return w.status==="熟悉";
  if(filter==="unfamiliar") return w.status==="不熟";
  if(filter==="favorite") return w.status!=="熟悉"&&!!w.favorite;
  if(filter.indexOf("ielts:")===0) return w.status!=="熟悉"&&arr(w.ieltsUse).includes(filter.slice(6));
  if(filter.indexOf("topic:")===0) return w.status!=="熟悉"&&arr(w.topics).includes(filter.slice(6));
  if(filter.indexOf("difficulty:")===0) return w.status!=="熟悉"&&String(w.difficulty||"")===filter.slice(11);
  return w.status!=="熟悉";
}

function list(){
  return words.map(function(w,i){return Object.assign({},w,{originalIndex:i})}).filter(passFilter);
}

function current(){
  const l=list();
  if(!l.length)return null;
  if(!l.some(function(w){return w.originalIndex===index})) index=l[0].originalIndex;
  return words[index];
}

function applyMobileMode(){
  document.body.classList.toggle("mobile-mode",mobileMode);
  els.mobileModeBtn.textContent=mobileMode?"普通模式":"手机模式";
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
    toast("正在加载本地音频");
    if(audio){audio.pause();audio.currentTime=0}
    if("speechSynthesis" in window) window.speechSynthesis.cancel();
    const url=await cachedAudioUrl(path,1200);
    audio=new Audio(url);
    await audio.play();
    toast("本地音频："+(label||"音频"));
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

function render(){
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
  const l=list();
  if(!l.length)return;
  const pos=Math.max(0,l.findIndex(function(x){return x.originalIndex===index}));
  index=l[(pos+n+l.length)%l.length].originalIndex;
  render();
  scheduleCloudSync();
}

function mark(status){
  const w=current();
  if(!w)return;
  w.status=(status==="不熟"&&w.status==="不熟")?"":status;
  rememberWord(w);
  if(status==="熟悉"){
    const l=list();
    const next=l.find(function(x){return x.originalIndex>index})||l[0];
    if(next) index=next.originalIndex;
  }
  render();
  persistNow();
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
    s.src=url;
    s.async=true;
    s.onload=function(){resolve()};
    s.onerror=function(){reject(new Error("load failed"))};
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

async function cloudbaseLoginIfNeeded(app){
  try{
    const auth=app.auth({persistence:"local"});
    cloudbaseAuth=auth;
    if(auth.getLoginState){
      const state=await auth.getLoginState();
      if(state) return true;
    }
    if(auth.anonymousAuthProvider){
      const provider=auth.anonymousAuthProvider();
      if(provider&&provider.signIn){await provider.signIn();return true}
    }
    if(auth.signInAnonymously){await auth.signInAnonymously();return true}
    if(auth.signInWithAnonymous){await auth.signInWithAnonymous();return true}
    return true;
  }catch(e){
    throw e;
  }
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
    cloudbaseReady=true;
    return true;
  }catch(e){
    setSyncStatus("CloudBase 连接失败："+(e.message||e),false);
    return false;
  }
}

function progressForCloud(){
  persistNow();
  return {
    version:7,
    appVersion:APP_VERSION,
    envId:window.VOCAB_CLOUDBASE_ENV_ID||"ielts-vocab-d1gymoilc5746f67a",
    statuses:progress.statuses||{},
    currentWord:progress.currentWord||"",
    filter:progress.filter||"all",
    mobileMode:!!progress.mobileMode,
    updatedAt:Date.now(),
    deviceId:progress.deviceId||clientId()
  };
}

async function getCloudDoc(){
  if(!cloudbaseDb||!cloudbaseDocId) throw new Error("未连接同步码");

  // 兼容 CloudBase 免费体验版默认权限：
  // 读取全部数据，修改本人数据 [READONLY]
  // 不再要求所有设备修改同一个文档，而是读取同一同步码下最新的一条记录。
  const result=await cloudbaseDb
    .collection("vocab_progress")
    .where({syncCodeHash:cloudbaseDocId})
    .get();

  const rows=(result&&Array.isArray(result.data)?result.data:[])
    .filter(function(x){return x&&x.syncCodeHash===cloudbaseDocId})
    .sort(function(a,b){return (b.updatedAt||0)-(a.updatedAt||0)});

  return rows[0]||null;
}

async function setCloudDoc(data){
  if(!cloudbaseDb||!cloudbaseDocId) throw new Error("未连接同步码");

  // 兼容 [READONLY]：
  // 每台设备只新增自己创建的进度记录，不去修改别的设备创建的记录。
  // 手机 / 电脑恢复时读取同一同步码下 updatedAt 最新的一条。
  const payload=Object.assign({
    syncCodeHash:cloudbaseDocId,
    deviceId:progress.deviceId||clientId(),
    createdAt:Date.now()
  },data);

  await cloudbaseDb.collection("vocab_progress").add(payload);
}

function mergeCloudProgress(remote){
  if(!remote||typeof remote!=="object")return;
  const remoteUpdated=remote.updatedAt||0;
  const localUpdated=progress.updatedAt||0;
  const localStatuses=progress.statuses||{};
  const remoteStatuses=remote.statuses||{};

  Object.keys(remoteStatuses).forEach(function(k){
    const r=remoteStatuses[k]||{};
    const l=localStatuses[k]||{};
    if((r.updatedAt||remoteUpdated||0)>=(l.updatedAt||0)){
      localStatuses[k]={status:r.status||"",favorite:!!r.favorite,updatedAt:r.updatedAt||remoteUpdated||Date.now()};
    }
  });

  progress.statuses=localStatuses;
  if(remoteUpdated>=localUpdated){
    if(remote.currentWord) progress.currentWord=remote.currentWord;
    if(remote.filter) progress.filter=remote.filter;
    if(typeof remote.mobileMode==="boolean") progress.mobileMode=remote.mobileMode;
    progress.updatedAt=remoteUpdated;
  }
  persistNow();
  applyProgressToWords();
}

function applyProgressToWords(){
  words=words.map(function(w){
    const x=progress.statuses[norm(w.word)];
    return Object.assign({},w,{status:x?.status||"",favorite:!!x?.favorite});
  });
  filter=progress.filter||filter||"all";
  mobileMode=!!progress.mobileMode;
  if(progress.currentWord){
    const found=words.findIndex(function(w){return norm(w.word)===norm(progress.currentWord)});
    if(found>=0) index=found;
  }
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
  setSyncStatus("正在连接 CloudBase...",false);
  const ok=await initCloudBase();
  if(!ok)return false;
  setSyncStatus("已连接，可上传或恢复",true);
  return true;
}

async function cloudPull(){
  if(!cloudbaseDocId){
    const ok=await connectCloudBase();
    if(!ok)return;
  }
  try{
    const data=await getCloudDoc();
    if(data){
      mergeCloudProgress(data);
      setSyncStatus("已从云端恢复："+new Date().toLocaleTimeString(),true);
      toast("已从云端恢复");
    }else{
      setSyncStatus("云端暂无进度，可上传本机进度",true);
      toast("云端暂无进度");
    }
  }catch(e){
    setSyncStatus("读取失败："+(e.message||e),true);
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
    setSyncStatus("上传失败："+(e.message||e),true);
  }
}

function scheduleCloudSync(){
  if(!cloudbaseReady||!cloudbaseDocId)return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer=setTimeout(cloudPush,60000);
}


els.syncBtn.onclick=function(){
  els.syncPanel.classList.remove("hidden");
};
els.syncCloseBtn.onclick=function(){
  els.syncPanel.classList.add("hidden");
};
els.syncConnectBtn.onclick=connectCloudBase;
els.syncPullBtn.onclick=cloudPull;
els.syncPushBtn.onclick=cloudPush;
els.syncDisconnectBtn.onclick=function(){
  cloudbaseReady=false;
  cloudbaseDocId="";
  cloudbaseSyncCode="";
  localStorage.removeItem(CLOUDBASE_SYNC_CODE_KEY);
  setSyncStatus("已断开",false);
  toast("已断开云同步");
};

document.getElementById("prevBtn").onclick=function(){step(-1)};
document.getElementById("shuffleBtn").onclick=function(){
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
  filter=e.target.value;
  const l=list();
  index=l.length?l[0].originalIndex:0;
  render();
  persistNow();
  scheduleCloudSync();
};
els.mobileModeBtn.onclick=function(){
  mobileMode=!mobileMode;
  applyMobileMode();
  toast(mobileMode?"已进入手机模式":"已进入普通模式");
  scheduleCloudSync();
};

let sx=0,sy=0,st=0;
els.swipeArea.addEventListener("touchstart",function(e){const t=e.changedTouches[0];sx=t.clientX;sy=t.clientY;st=Date.now()},{passive:true});
els.swipeArea.addEventListener("touchend",function(e){const t=e.changedTouches[0];const dx=t.clientX-sx;const dy=t.clientY-sy;const dt=Date.now()-st;if(dt<700&&Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.4){dx<0?step(1):step(-1)}},{passive:true});

window.addEventListener("keydown",function(e){
  const tag=e.target&&e.target.tagName?e.target.tagName.toLowerCase():"";
  if(tag==="input"||tag==="textarea"||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;
  if(e.key==="0"||e.code==="Numpad0"){e.preventDefault();mark("熟悉")}
  if(e.key==="1"||e.code==="Numpad1"){e.preventDefault();mark("不熟")}
  if(e.key==="ArrowLeft")step(-1);
  if(e.key==="ArrowRight")step(1);
});

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

    const res=await fetch("./data/words.json?v="+APP_VERSION,{cache:"force-cache"});
    if(!res.ok) throw new Error("words json failed");
    const data=await res.json();
    words=Array.isArray(data.words)?data.words:data;
    loadProgress();
    buildFilterOptions();
    if(window.matchMedia&&window.matchMedia("(max-width: 760px)").matches) mobileMode=true;
    applyMobileMode();
    render();
    registerSW();
    clearTimeout(slowTimer);
    if(savedCode){
      connectCloudBase().then(function(ok){ if(ok) cloudPull(); }).catch(function(){});
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
