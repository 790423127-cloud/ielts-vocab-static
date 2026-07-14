const CACHE_NAME="static_vocab_shell_20260714_d25_responsive_audio_v1";
const AUDIO_CACHE_NAME="static_vocab_audio_20260714_d25_responsive_audio_v1";
const SHELL=[
  "./",
  "./index.html",
  "./spelling.html",
  "./basic.html",
  "./meaning.html",
  "./reading-g.html",
  "./assets/style.css?v=20260714_d25_responsive_audio_v1",
  "./assets/app.js?v=20260714_d25_responsive_audio_v1",
  "./assets/spelling.css?v=20260714_d25_responsive_audio_v1",
  "./assets/spelling.js?v=20260714_d25_responsive_audio_v1",
  "./assets/basic.js?v=20260714_d25_responsive_audio_v1",
  "./assets/meaning-static.js?v=20260714_d25_responsive_audio_v1",
  "./assets/reading-g.js?v=20260714_d25_responsive_audio_v1",
  "./sync-config.js?v=20260714_d25_responsive_audio_v1",
  "./data/words.json",
  "./data/phrases.json",
  "./data/idictation-frequency.json",
  "./data/basic-words.json",
  "./data/reading-g-vocab.json",
  "./data/reading-g-paraphrases.json",
  "./data/reading-g-import-report.json",
  "./manifest.webmanifest?v=20260714_d25_responsive_audio_v1"
];

self.addEventListener("install",function(event){
  event.waitUntil(caches.open(CACHE_NAME).then(function(cache){return cache.addAll(SHELL)}).catch(function(){}));
  self.skipWaiting();
});

self.addEventListener("activate",function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(key){return key.indexOf("static_vocab_shell_")===0&&key!==CACHE_NAME}).map(function(key){return caches.delete(key)}));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch",function(event){
  const req=event.request;
  const url=new URL(req.url);

  if(req.method!=="GET") return;
  if(url.hostname.indexOf("qq.com")>=0||url.hostname.indexOf("cloudbase")>=0||url.hostname.indexOf("tencent")>=0||url.hostname.indexOf("static.cloudbase.net")>=0||url.hostname.indexOf("jsdelivr")>=0||url.hostname.indexOf("unpkg")>=0) return;

  if(url.pathname.indexOf("/audio/")>=0){
    event.respondWith(
      caches.open(AUDIO_CACHE_NAME).then(function(cache){
        return cache.match(req).then(function(cached){
          if(cached) return cached;
          return fetch(req).then(function(res){
            if(res&&res.ok) cache.put(req,res.clone()).catch(function(){});
            return res;
          });
        });
      })
    );
    return;
  }

  if(url.pathname.endsWith("/index.html")||url.pathname.endsWith("/")||url.pathname.indexOf("/assets/")>=0||url.pathname.indexOf("/data/words.json")>=0||url.pathname.indexOf("/data/phrases.json")>=0||url.pathname.indexOf("/data/idictation-frequency.json")>=0||url.pathname.indexOf("/data/basic-words.json")>=0||url.pathname.indexOf("/data/meaning-6000.json")>=0||url.pathname.indexOf("/data/reading-g-vocab.json")>=0||url.pathname.indexOf("/data/reading-g-paraphrases.json")>=0||url.pathname.indexOf("/data/reading-g-import-report.json")>=0||url.pathname.endsWith("/spelling.html")||url.pathname.endsWith("/basic.html")||url.pathname.endsWith("/meaning.html")||url.pathname.endsWith("/reading-g.html")||url.pathname.endsWith("/manifest.webmanifest")||url.pathname.endsWith("/sync-config.js")){
    event.respondWith(
      fetch(req).then(function(res){
        if(res&&res.ok) caches.open(CACHE_NAME).then(function(cache){cache.put(req,res.clone()).catch(function(){})});
        return res;
      }).catch(function(){
        return caches.match(req);
      })
    );
  }
});
