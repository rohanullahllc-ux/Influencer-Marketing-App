export const metadata = {
  title: "RDV Outreach OS",
  description: "Rohan Digital Ventures — Influencer Marketing Campaign & Outreach Operating System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
