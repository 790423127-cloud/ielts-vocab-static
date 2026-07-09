import "./globals.css";

export const metadata = {
  title: "IELTS Vocab",
  description: "IELTS vocabulary study app"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
