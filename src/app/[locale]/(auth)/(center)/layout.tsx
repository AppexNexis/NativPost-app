import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import AuthVisualPanel from './AuthVisualPanel';

export default async function AuthLayout(props: { children: React.ReactNode }) {
  const { userId } = await auth();

  if (userId) {
    redirect('/dashboard');
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100svh',
      background: '#ffffff',
    }}
    >
      {/* Left — editorial brand panel */}
      <AuthVisualPanel />

      {/* Right — Clerk form, vertically centered */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        minHeight: '100svh',
        background: '#ffffff',
      }}
      >
        <div style={{ width: '100%', maxWidth: '400px' }}>
          {props.children}
        </div>
      </div>
    </div>
  );
}
