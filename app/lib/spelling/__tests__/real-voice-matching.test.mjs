import test from "node:test";
import assert from "node:assert/strict";

import {
  extractCommonsSpokenText,
  isEnglishCommonsTitle,
  isLinguaLibreEngWavTitle,
  isValidCachedRealAudioEntry,
  matchesCommonsAudioTarget,
  resolveRealVoiceAudioSource,
  scoreRealVoiceCandidate
} from "../../vocab-audio-source.mjs";

test("isLinguaLibreEngWavTitle only accepts English Lingua Libre wav files", () => {
  assert.equal(isLinguaLibreEngWavTitle("File:LL-Q1860 (eng)-Vealhurl-symptom.wav"), true);
  assert.equal(isLinguaLibreEngWavTitle("File:en-us-land.ogg"), false);
  assert.equal(isLinguaLibreEngWavTitle("File:LL-Q1860 (eng)-Vealhurl-symptom.ogg"), false);
  assert.equal(isLinguaLibreEngWavTitle("File:De-Symptom.wav"), false);
});

test("matchesCommonsAudioTarget rejects multi-word commons titles for single-word targets", () => {
  assert.equal(
    matchesCommonsAudioTarget(
      "land",
      "File:LL-Q1860 (eng)-Vealhurl-dry land.wav",
      "word"
    ),
    false
  );
});

test("matchesCommonsAudioTarget rejects unrelated pronunciation files", () => {
  assert.equal(
    matchesCommonsAudioTarget(
      "your",
      "File:Monty pronunciation audio.wav",
      "word"
    ),
    false
  );
  assert.equal(
    matchesCommonsAudioTarget(
      "symptom",
      "File:LL-Q1860 (eng)-Vealhurl-epiphenomenon.wav",
      "word"
    ),
    false
  );
  assert.equal(
    matchesCommonsAudioTarget(
      "fairness",
      "File:En-us-fair-weather friend.flac",
      "word"
    ),
    false
  );
  assert.equal(
    matchesCommonsAudioTarget(
      "land",
      "File:en-us-land.ogg",
      "word"
    ),
    false
  );
});

test("matchesCommonsAudioTarget accepts exact English Lingua Libre wav files", () => {
  assert.equal(
    matchesCommonsAudioTarget(
      "symptom",
      "File:LL-Q1860 (eng)-Vealhurl-symptom.wav",
      "word"
    ),
    true
  );
  assert.equal(
    matchesCommonsAudioTarget(
      "land",
      "File:LL-Q1860 (eng)-Wodencafe-land.wav",
      "word"
    ),
    true
  );
});

test("extractCommonsSpokenText parses Lingua Libre wav titles", () => {
  assert.equal(
    extractCommonsSpokenText("File:LL-Q1860 (eng)-Vealhurl-symptom.wav"),
    "symptom"
  );
});

test("isEnglishCommonsTitle is aligned with Lingua Libre wav only", () => {
  assert.equal(isEnglishCommonsTitle("File:LL-Q1860 (eng)-Vealhurl-symptom.wav"), true);
  assert.equal(isEnglishCommonsTitle("File:En-us-fairness.ogg"), false);
});

test("isValidCachedRealAudioEntry rejects dictionary and non-Lingua-Libre cache rows", () => {
  assert.equal(
    isValidCachedRealAudioEntry(
      {
        realAudio: true,
        hasAudio: true,
        filename: "real-dict.mp3",
        source: "real-dictionary",
        text: "land"
      },
      "land",
      "word"
    ),
    false
  );
  assert.equal(
    isValidCachedRealAudioEntry(
      {
        realAudio: true,
        hasAudio: true,
        filename: "real-bad.mp3",
        source: "real-commons",
        title: "File:en-us-land.ogg",
        text: "land"
      },
      "land",
      "word"
    ),
    false
  );
  assert.equal(
    isValidCachedRealAudioEntry(
      {
        realAudio: true,
        hasAudio: true,
        filename: "real-good.wav",
        source: "real-commons",
        title: "File:LL-Q1860 (eng)-Wodencafe-land.wav",
        text: "land"
      },
      "land",
      "word"
    ),
    true
  );
});

test("scoreRealVoiceCandidate ignores dictionary mp3 and non-wav commons", () => {
  assert.equal(
    scoreRealVoiceCandidate({
      source: "real-dictionary",
      audioUrl: "https://api.dictionaryapi.dev/media/pronunciations/en/land-us.mp3"
    }, "land"),
    -1
  );
  assert.ok(
    scoreRealVoiceCandidate({
      source: "real-commons",
      title: "File:LL-Q1860 (eng)-Wodencafe-land.wav",
      audioUrl: "https://audio.example/land.wav"
    }, "land") > 0
  );
});

test("resolveRealVoiceAudioSource returns only Lingua Libre wav and ignores dictionary mp3", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);

    if (target.includes("dictionaryapi.dev")) {
      throw new Error("dictionary source should not be requested");
    }

    if (target.includes("wiktionary.org")) {
      return Response.json({
        query: {
          pages: {
            1: {
              revisions: [{
                "*": "{{audio|LL-Q1860 (eng)-Wodencafe-land.wav|Audio (US)}}"
              }]
            }
          }
        }
      });
    }

    if (target.includes("commons.wikimedia.org") && target.includes("titles=File")) {
      return Response.json({
        query: {
          pages: {
            1: {
              title: "File:LL-Q1860 (eng)-Wodencafe-land.wav",
              imageinfo: [{
                url: "https://audio.example/land.wav",
                mime: "audio/wav"
              }]
            }
          }
        }
      });
    }

    if (target.includes("commons.wikimedia.org")) {
      return Response.json({ query: { pages: {} } });
    }

    return new Response(null, { status: 404 });
  };

  try {
    const source = await resolveRealVoiceAudioSource("land", { kind: "word" });
    assert.equal(source?.source, "real-commons");
    assert.match(source?.title || "", /LL-Q1860 \(eng\)/i);
    assert.equal(source?.audioUrl, "https://audio.example/land.wav");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolveRealVoiceAudioSource no longer returns unrelated commons audio for symptom", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);

    if (target.includes("wiktionary.org")) {
      return Response.json({
        query: {
          pages: {
            1: {
              revisions: [{
                "*": "{{audio|LL-Q1860 (eng)-Vealhurl-symptom.wav|a=Southern England}}"
              }]
            }
          }
        }
      });
    }

    if (target.includes("commons.wikimedia.org") && target.includes("titles=File")) {
      return Response.json({
        query: {
          pages: {
            1: {
              title: "File:LL-Q1860 (eng)-Vealhurl-symptom.wav",
              imageinfo: [{
                url: "https://audio.example/symptom.wav",
                mime: "audio/wav"
              }]
            }
          }
        }
      });
    }

    if (target.includes("commons.wikimedia.org")) {
      return Response.json({
        query: {
          pages: {
            1: {
              title: "File:LL-Q1860 (eng)-Vealhurl-epiphenomenon.wav",
              imageinfo: [{
                url: "https://audio.example/epiphenomenon.wav",
                mime: "audio/wav"
              }]
            }
          }
        }
      });
    }

    return new Response(null, { status: 404 });
  };

  try {
    const source = await resolveRealVoiceAudioSource("symptom", { kind: "word" });
    assert.equal(source?.source, "real-commons");
    assert.match(source?.title || "", /symptom/i);
    assert.equal(source?.audioUrl, "https://audio.example/symptom.wav");
  } finally {
    globalThis.fetch = originalFetch;
  }
});