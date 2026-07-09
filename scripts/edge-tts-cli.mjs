import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";

async function readStdin() {
  let input = "";

  for await (const chunk of process.stdin) {
    input += chunk.toString();
  }

  return JSON.parse(input || "{}");
}

async function main() {
  const payload = await readStdin();

  const text = String(payload.text || "").trim();
  const filepath = String(payload.filepath || "").trim();
  const voice = payload.voice || "en-US-AriaNeural";
  const rate = payload.rate || "-8%";

  if (!text) {
    throw new Error("Missing text");
  }

  if (!filepath) {
    throw new Error("Missing filepath");
  }

  const dir = path.dirname(filepath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const mod = await import("node-edge-tts");
  const EdgeTTS = mod.EdgeTTS || mod.default?.EdgeTTS || mod.default;

  if (!EdgeTTS) {
    throw new Error("node-edge-tts is installed, but EdgeTTS export was not found");
  }

  const tts = new EdgeTTS({
    voice,
    lang: "en-US",
    outputFormat: "audio-24khz-96kbitrate-mono-mp3",
    rate,
    pitch: "default",
    volume: "default",
    timeout: 20000
  });

  await tts.ttsPromise(text, filepath);

  console.log(filepath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
