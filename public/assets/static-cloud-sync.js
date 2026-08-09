(function () {
  "use strict";

  var SYNC_CODE_KEY = "static_vocab_cloudbase_sync_code_v1";
  var DEVICE_KEY = "static_vocab_device_id_v1";
  var META_KEY = "static_vocab_module_sync_meta_v1";
  var SDK_URL = "https://static.cloudbase.net/cloudbase-js-sdk/2.12.1/cloudbase.full.js";
  var PAGE_SIZE = 500;
  var MAX_ROWS = 5000;
  var modules = new Map();
  var cloudDb = null;
  var cloudAuth = null;
  var syncHash = "";
  var activeCode = "";
  var connectTask = null;
  var scanTimer = null;
  var pushTimer = null;
  var syncButton = null;

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function parseJson(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function stableJson(value) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return "";
    }
  }

  function isObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function hashFallback(value) {
    var hash = 2166136261;
    String(value || "").split("").forEach(function (character) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    });
    return (hash >>> 0).toString(36);
  }

  async function sha256(value) {
    if (globalThis.crypto && globalThis.crypto.subtle) {
      var data = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
      return Array.from(new Uint8Array(data)).map(function (item) {
        return item.toString(16).padStart(2, "0");
      }).join("");
    }
    return hashFallback(value);
  }

  function getMeta() {
    var stored = parseJson(localStorage.getItem(META_KEY) || "", null);
    return stored && typeof stored === "object" ? stored : { modules: {} };
  }

  function saveMeta(meta) {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }

  function moduleMeta(moduleId) {
    var meta = getMeta();
    var current = meta.modules && meta.modules[moduleId];
    return current && typeof current === "object" ? current : { updatedAt: 0 };
  }

  function saveModuleMeta(moduleId, value) {
    var meta = getMeta();
    meta.modules = meta.modules && typeof meta.modules === "object" ? meta.modules : {};
    meta.modules[moduleId] = value;
    saveMeta(meta);
  }

  function getDeviceId() {
    var id = clean(localStorage.getItem(DEVICE_KEY));
    if (!id) {
      id = "device_" + Math.random().toString(36).slice(2) + "_" + Date.now();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function moduleVocabId(moduleId) {
    return "static-module:" + moduleId;
  }

  function capture(module) {
    var values = {};
    module.keys.forEach(function (key) {
      var raw = localStorage.getItem(key);
      if (raw === null) return;
      values[key] = parseJson(raw, raw);
    });
    return values;
  }

  function writeSnapshot(module, snapshot) {
    module.keys.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, key)) return;
      var value = snapshot[key];
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    });
  }

  function mergeValue(first, second, firstTime, secondTime) {
    if (!isObject(first) || !isObject(second)) {
      return secondTime >= firstTime ? second : first;
    }

    var merged = {};
    Object.keys(first).forEach(function (key) {
      merged[key] = first[key];
    });
    Object.keys(second).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(merged, key)) {
        merged[key] = second[key];
        return;
      }
      merged[key] = mergeValue(merged[key], second[key], firstTime, secondTime);
    });
    return merged;
  }

  function mergeSnapshot(first, second, firstTime, secondTime) {
    var merged = {};
    Object.keys(first || {}).forEach(function (key) {
      merged[key] = first[key];
    });
    Object.keys(second || {}).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(merged, key)) {
        merged[key] = second[key];
        return;
      }
      merged[key] = mergeValue(merged[key], second[key], firstTime, secondTime);
    });
    return merged;
  }

  function setStatus(message, synced) {
    if (!syncButton) return;
    syncButton.textContent = synced ? "已同步" : "云同步";
    syncButton.title = message;
    syncButton.classList.toggle("is-synced", Boolean(synced));
  }

  function installButton() {
    if (syncButton || !document.body) return;
    var target = document.querySelector("[data-static-primary-nav]") || document.body;
    syncButton = document.createElement("button");
    syncButton.type = "button";
    syncButton.className = "static-cloud-sync-button";
    syncButton.textContent = "云同步";
    syncButton.title = "连接后同步本页学习进度";
    syncButton.addEventListener("click", function () {
      var stored = clean(localStorage.getItem(SYNC_CODE_KEY));
      var code = window.prompt("请输入云同步码（至少 6 位）", stored);
      if (code === null) return;
      code = clean(code);
      if (code.length < 6) {
        setStatus("同步码至少 6 位", false);
        return;
      }
      localStorage.setItem(SYNC_CODE_KEY, code);
      connect(code).catch(function () {});
    });
    target.appendChild(syncButton);
    var style = document.createElement("style");
    style.textContent = ".static-cloud-sync-button{border:0;border-radius:999px;background:#e7f7f2;color:#237567;font:inherit;font-weight:800;padding:7px 10px;cursor:pointer;white-space:nowrap}.static-cloud-sync-button.is-synced{background:#237567;color:#fff}";
    document.head.appendChild(style);
  }

  function loadSdk() {
    return new Promise(function (resolve, reject) {
      if (window.cloudbase || window.tcb) {
        resolve(window.cloudbase || window.tcb);
        return;
      }
      var script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.onload = function () {
        resolve(window.cloudbase || window.tcb);
      };
      script.onerror = function () {
        script.remove();
        reject(new Error("CloudBase SDK 加载失败"));
      };
      document.head.appendChild(script);
    });
  }

  async function hasLoginState() {
    try {
      var state = await cloudAuth.getLoginState();
      return Boolean(state && (state.credential || state.user || state.uid || state.loginType));
    } catch (error) {
      return false;
    }
  }

  async function ensureLogin(app) {
    cloudAuth = app.auth({ persistence: "local" });
    if (await hasLoginState()) return;
    if (typeof cloudAuth.signInAnonymously === "function") {
      await cloudAuth.signInAnonymously();
    } else if (typeof cloudAuth.signInWithAnonymous === "function") {
      await cloudAuth.signInWithAnonymous();
    } else {
      throw new Error("当前 CloudBase SDK 不支持匿名登录");
    }
    if (!(await hasLoginState())) {
      throw new Error("匿名登录未建立有效凭证");
    }
  }

  async function readRows(module) {
    var rows = [];
    var offset = 0;
    var vocabId = moduleVocabId(module.id);
    while (offset < MAX_ROWS) {
      var result = await cloudDb.collection("vocab_progress")
        .where({ syncCodeHash: syncHash, vocabId: vocabId })
        .skip(offset)
        .limit(PAGE_SIZE)
        .get();
      var page = result && Array.isArray(result.data) ? result.data : [];
      rows = rows.concat(page.filter(function (row) {
        return row && row.syncCodeHash === syncHash && row.vocabId === vocabId && row.moduleId === module.id;
      }));
      if (page.length < PAGE_SIZE) break;
      offset += page.length;
    }
    return rows.sort(function (first, second) {
      return Number(first.updatedAt || 0) - Number(second.updatedAt || 0);
    });
  }

  async function pushModule(module, force) {
    var snapshot = capture(module);
    var signature = stableJson(snapshot);
    if (!force && !module.pending && signature === module.signature) return;
    var now = Date.now();
    var deviceId = getDeviceId();
    var documentId = "module_progress_" + (await sha256(syncHash + "|" + module.id + "|" + deviceId)).slice(0, 48);
    await cloudDb.collection("vocab_progress").doc(documentId).set({
      syncCodeHash: syncHash,
      vocabId: moduleVocabId(module.id),
      moduleId: module.id,
      deviceId: deviceId,
      schemaVersion: 1,
      updatedAt: now,
      moduleState: snapshot
    });
    module.signature = signature;
    module.pending = false;
    saveModuleMeta(module.id, { updatedAt: now });
  }

  async function pullModule(module) {
    var rows = await readRows(module);
    if (!rows.length) return false;
    var remote = {};
    var remoteTime = 0;
    rows.forEach(function (row) {
      var updatedAt = Number(row.updatedAt || 0);
      remote = mergeSnapshot(remote, row.moduleState && typeof row.moduleState === "object" ? row.moduleState : {}, remoteTime, updatedAt);
      remoteTime = Math.max(remoteTime, updatedAt);
    });

    var local = capture(module);
    var localInfo = moduleMeta(module.id);
    var merged = mergeSnapshot(remote, local, remoteTime, Number(localInfo.updatedAt || 0));
    var previous = stableJson(local);
    var next = stableJson(merged);
    module.signature = next;
    module.pending = false;
    saveModuleMeta(module.id, { updatedAt: Math.max(remoteTime, Number(localInfo.updatedAt || 0)) });
    if (previous === next) return false;
    writeSnapshot(module, merged);
    return true;
  }

  async function syncAll() {
    var reloadNeeded = false;
    var mergedCount = 0;
    for (var iterator = modules.values(), step = iterator.next(); !step.done; step = iterator.next()) {
      var module = step.value;
      var merged = await pullModule(module);
      await pushModule(module, true);
      if (merged) {
        mergedCount += 1;
        if (typeof module.onMerged === "function") {
          try {
            module.onMerged();
          } catch (error) {
            reloadNeeded = true;
          }
        } else {
          reloadNeeded = true;
        }
      }
    }
    setStatus(
      reloadNeeded
        ? "已合并云端记录，正在刷新页面"
        : mergedCount
          ? "已合并云端记录"
          : "已同步",
      true
    );
    if (reloadNeeded) window.setTimeout(function () { window.location.reload(); }, 0);
  }

  async function connect(value) {
    var code = clean(value || localStorage.getItem(SYNC_CODE_KEY));
    if (code.length < 6) {
      setStatus("请先输入同步码", false);
      return false;
    }
    if (connectTask) return connectTask;
    connectTask = (async function () {
      try {
        setStatus("正在连接云同步", false);
        if (activeCode !== code || !cloudDb) {
          var sdk = await loadSdk();
          if (!sdk || typeof sdk.init !== "function") throw new Error("CloudBase SDK 初始化失败");
          var app = sdk.init({
            env: window.VOCAB_CLOUDBASE_ENV_ID || "ielts-vocab-d1gymoilc5746f67a",
            region: window.VOCAB_CLOUDBASE_REGION || "ap-shanghai"
          });
          await ensureLogin(app);
          cloudDb = app.database();
          activeCode = code;
          syncHash = "vocab_" + (await sha256("ielts-vocab:" + code)).slice(0, 48);
        }
        await syncAll();
        return true;
      } catch (error) {
        setStatus("同步失败：" + (error && error.message ? error.message : error), false);
        return false;
      } finally {
        connectTask = null;
      }
    })();
    return connectTask;
  }

  function schedulePush() {
    if (!cloudDb || !syncHash) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      var pending = Array.from(modules.values()).filter(function (module) { return module.pending; });
      Promise.all(pending.map(function (module) { return pushModule(module, false); }))
        .then(function () { setStatus("已同步", true); })
        .catch(function (error) { setStatus("同步失败：" + (error && error.message ? error.message : error), false); });
    }, 1800);
  }

  function scanChanges() {
    modules.forEach(function (module) {
      var signature = stableJson(capture(module));
      if (signature === module.signature) return;
      module.signature = signature;
      module.pending = true;
      saveModuleMeta(module.id, { updatedAt: Date.now() });
    });
    schedulePush();
  }

  function startScanner() {
    if (scanTimer) return;
    scanTimer = setInterval(scanChanges, 2500);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        scanChanges();
        if (cloudDb && syncHash) syncAll().catch(function () {});
      }
    });
  }

  function register(moduleId, keys, options) {
    if (!moduleId || !Array.isArray(keys) || !keys.length || modules.has(moduleId)) return;
    var module = {
      id: moduleId,
      keys: keys.slice(),
      signature: "",
      pending: false,
      onMerged: options && typeof options.onMerged === "function"
        ? options.onMerged
        : null
    };
    module.signature = stableJson(capture(module));
    modules.set(moduleId, module);
    installButton();
    startScanner();
    var code = clean(localStorage.getItem(SYNC_CODE_KEY));
    if (code.length >= 6) {
      setTimeout(function () {
        connect(code).catch(function () {});
      }, 0);
    }
  }

  window.StaticCloudSync = {
    register: register,
    syncNow: function () { return connect(localStorage.getItem(SYNC_CODE_KEY)); }
  };
}());
