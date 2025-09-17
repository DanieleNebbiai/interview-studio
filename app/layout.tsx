import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Interview Studio",
  description: "Professional video recording with separate participant tracks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Prevent browser extensions from modifying DOM before React hydrates
              if (typeof window !== 'undefined') {
                // Store original setAttribute method
                const originalSetAttribute = Element.prototype.setAttribute;
                
                // Override setAttribute during initial load
                Element.prototype.setAttribute = function(name, value) {
                  // Allow React's own attributes but block common extension attributes
                  if (name === 'cz-shortcut-listen' || name === 'data-gramm' || name === 'spellcheck') {
                    return;
                  }
                  return originalSetAttribute.call(this, name, value);
                };
                
                // Restore after a short delay
                setTimeout(() => {
                  Element.prototype.setAttribute = originalSetAttribute;
                }, 100);
              }
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-stone-950 `}
        suppressHydrationWarning={true}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
