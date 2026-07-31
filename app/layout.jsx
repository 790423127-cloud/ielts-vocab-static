import { Suspense } from "react";
import "./globals.css";
import "./tidy-review-overrides.css";
import FontScaleProvider from "./components/FontScaleProvider";
import GlobalStudyHeader from "./components/GlobalStudyHeader";
import MobileWordCardSwipeController from "./components/MobileWordCardSwipeController";
import QuickDeleteCurrentWordButton from "./components/QuickDeleteCurrentWordButton";

export const metadata = {
  title: "IELTS Vocab",
  description: "IELTS vocabulary study app"
};

const browserCompatibilityBootstrapScript = `
(function () {
  try {
    if (typeof Array.prototype.toSpliced !== "function") {
      Object.defineProperty(Array.prototype, "toSpliced", {
        configurable: true,
        writable: true,
        value: function (start, deleteCount) {
          var copy = Array.prototype.slice.call(this);
          var items = Array.prototype.slice.call(arguments, 2);
          Array.prototype.splice.apply(copy, [start, deleteCount].concat(items));
          return copy;
        }
      });
    }

    var raw = localStorage.getItem("ielts-vocab-font-scale");
    var value = parseFloat(raw);
    if (isFinite(value)) {
      value = Math.min(1.6, Math.max(0.8, value));
      document.documentElement.dataset.fontScale = String(value);
      document.documentElement.style.setProperty("--font-scale", String(value));
    }

    document.documentElement.dataset.studyMeaningsHidden =
      localStorage.getItem("ielts_vocab_hide_meanings_v1") === "1" ? "true" : "false";
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: browserCompatibilityBootstrapScript }} />
      </head>
      <body suppressHydrationWarning>
        <FontScaleProvider />
        <MobileWordCardSwipeController />
        <Suspense fallback={null}>
          <GlobalStudyHeader />
        </Suspense>
        <QuickDeleteCurrentWordButton />
        {children}
      </body>
    </html>
  );
}
