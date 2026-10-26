import "./globals.css";

export const metadata = {
  title: "TasteBrief — a Qloo-grounded taste-gap agent",
  description:
    "Enter a target audience and a goal. The agent resolves entities, audiences, and tags on Qloo's taste graph, pulls insights and heatmaps, and writes a taste brief — shown side-by-side against what a bare LLM would say without Qloo.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

