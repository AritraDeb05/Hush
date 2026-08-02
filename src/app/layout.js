import { Space_Grotesk } from 'next/font/google';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-body',
});

export const metadata = {
  title: 'Hush - Temporary Group Chat',
  description: 'Quiet group chats. No history. Up to 8 people. One 6-digit code.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={spaceGrotesk.variable}>{children}</body>
    </html>
  );
}