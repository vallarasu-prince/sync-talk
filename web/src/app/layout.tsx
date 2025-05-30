"use client";

import "./globals.css";
import { useRouter } from "next/navigation";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();

  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">
        <header className="w-full sticky top-0 z-50 backdrop-blur-md bg-white/70 border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div
              className="text-2xl font-bold text-blue-600 cursor-pointer"
              onClick={() => router.push("/")}
            >
              ⚡SyncTalk
            </div>
            {/* <nav className="hidden md:flex gap-6 text-sm font-medium">
              <button
                onClick={() => router.push("/careers")}
                className="hover:text-blue-600 transition-colors"
              >
                Careers
              </button>
              <button
                onClick={() => router.push("/about")}
                className="hover:text-blue-600 transition-colors"
              >
                About
              </button>
            </nav> */}
          </div>
        </header>
        {children}
        <footer className="mt-8 text-center text-sm text-gray-500">
          Made with 💙 using WebRTC, Socket.io & React. <br />© 2025 SyncTalk
        </footer>
      </body>
    </html>
  );
}
