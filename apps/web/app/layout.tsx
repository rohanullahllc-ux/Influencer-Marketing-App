import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "RDV Outreach OS",
  description: "Rohan Digital Ventures — Influencer Marketing Campaign & Outreach Operating System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
