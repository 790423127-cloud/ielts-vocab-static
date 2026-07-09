import "./globals.css";
import FontScaleControl from "./components/FontScaleControl";
import FontScaleProvider from "./components/FontScaleProvider";

export const metadata = {
  title: "IELTS Vocab",
  description: "IELTS vocabulary study app"
};

const fontScaleBootstrapScript = `
(function () {
  try {
    var raw = localStorage.getItem("ielts-vocab-font-scale");
    var value = parseFloat(raw);
    if (!isFinite(value)) return;
    value = Math.min(1.6, Math.max(0.8, value));
    document.documentElement.dataset.fontScale = String(value);
    document.documentElement.style.setProperty("--font-scale", String(value));
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: fontScaleBootstrapScript }} />
      </head>
      <body suppressHydrationWarning>
        <FontScaleProvider />
        <div className="font-scale-dock" aria-hidden="false">
          <FontScaleControl />
        </div>
        {children}
      </body>
    </html>
  );
}
