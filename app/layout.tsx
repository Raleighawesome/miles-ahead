import type { Metadata } from "next";
import "./globals.css";
import PasswordProtection from "../components/PasswordProtection";

export const metadata: Metadata = {
  title: "Miles Ahead",
  description: "Stay miles ahead of your lease allowance with smart vehicle mileage tracking",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Theme initialization script ensures correct theme on first paint without flicker.
          It reads localStorage.theme or system preference and toggles the `dark` class on <html>.
          Placing this in <head> avoids hydration/ordering warnings.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const userPref = localStorage.getItem('theme');
                const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const shouldUseDark = userPref ? (userPref === 'dark') : systemPrefersDark;
                document.documentElement.classList.toggle('dark', shouldUseDark);
              } catch (_e) { /* noop */ }
            `,
          }}
        />
      </head>
      <body className="font-sans">
        <PasswordProtection>
          {children}
        </PasswordProtection>
      </body>
    </html>
  );
}
