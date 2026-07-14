import https from "https";

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "Cache-Control": "no-cache" } }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") })
        );
      })
      .on("error", reject);
  });
}

const base =
  "https://ielts-vocab-d1gymoilc5746f67a-1441466606.tcloudbaseapp.com/beidanci";

const html = await get(base + "/reading-g.html");
const scriptTag = (html.text.match(/reading-g\.js\?v=[^"']+/) || [])[0] || "";
const js = await get(base + "/assets/" + (scriptTag || "reading-g.js?v=20260712_d20_keyboard_nav_v1"));
const bare = await get(base + "/assets/reading-g.js");

console.log(
  JSON.stringify(
    {
      htmlStatus: html.status,
      scriptTag,
      jsStatus: js.status,
      hasArrowRight: js.text.includes("ArrowRight"),
      hasArrowLeft: js.text.includes("ArrowLeft"),
      hasKeydown: js.text.includes("keydown"),
      bareHasArrow: bare.text.includes("ArrowRight")
    },
    null,
    2
  )
);
