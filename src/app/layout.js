import { Space_Grotesk } from 'next/font/google';
import './globals.css';

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
      <body
        className={spaceGrotesk.variable}
        style={{
          margin: 0,
          minHeight: '100vh',
          background:
            'radial-gradient(circle at 15% 10%, rgba(96, 165, 250, 0.22), transparent 30%), radial-gradient(circle at 85% 0%, rgba(59, 130, 246, 0.16), transparent 24%), linear-gradient(180deg, #07111f 0%, #121826 54%, #1f2937 100%)',
          color: '#f8fafc',
        }}
      >
        {children}
      </body>
    </html>
  );
}
