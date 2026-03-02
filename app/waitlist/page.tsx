'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Logo } from '@/components/Logo';

function WaitlistForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'duplicate' | 'error'>('idle');

  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam));
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setStatus('loading');
    try {
      const q = query(collection(db, 'waitlist'), where('email', '==', email));
      const existing = await getDocs(q);
      if (!existing.empty) {
        setStatus('duplicate');
        return;
      }
      await addDoc(collection(db, 'waitlist'), {
        email,
        createdAt: new Date().toISOString(),
      });
      setStatus('success');
      setEmail('');
    } catch {
      setStatus('error');
    }
  }

  return (
    <>
      {status === 'success' ? (
        <div className="p-4 rounded-xl bg-[#f3ff97]/10 border border-[#f3ff97]/30 text-[#f3ff97] text-sm">
          You&apos;re on the list! We&apos;ll email you when we launch.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setStatus('idle'); }}
            className="w-full px-4 py-3 rounded-lg bg-[#141414] border border-[#2a2a2a] text-white placeholder-[#555] text-sm focus:outline-none focus:border-[#f3ff97]/50 transition-colors"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full px-4 py-3 rounded-lg bg-[#f3ff97] text-black font-semibold text-sm hover:bg-[#e5f080] transition-colors disabled:opacity-50"
          >
            {status === 'loading' ? 'Joining...' : 'Notify me at launch'}
          </button>
          {status === 'duplicate' && (
            <p className="text-xs text-[#a0a0a0]">This email is already registered.</p>
          )}
          {status === 'error' && (
            <p className="text-xs text-red-400">Something went wrong. Please try again.</p>
          )}
        </form>
      )}
    </>
  );
}

export default function WaitlistPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <Logo color="white" size={52} className="mx-auto mb-6" />

        <div className="inline-block px-3 py-1 mb-6 rounded-full border border-[#2a2a2a] text-xs text-[#f3ff97]">
          Private Beta
        </div>

        <h1 className="text-3xl font-bold mb-4">Currently in private beta</h1>
        <p className="text-[#a0a0a0] text-sm leading-relaxed mb-8">
          C3 is invite-only right now.
          <br />
          Join the waitlist and we&apos;ll let you know when we open up.
        </p>

        <Suspense fallback={
          <div className="w-full px-4 py-3 rounded-lg bg-[#141414] border border-[#2a2a2a] text-[#555] text-sm">
            Loading...
          </div>
        }>
          <WaitlistForm />
        </Suspense>

        <p className="mt-8 text-xs text-[#555]">
          Already have an account?{' '}
          <a href="/" className="text-[#a0a0a0] hover:text-white transition-colors">
            Go back home
          </a>
        </p>
      </div>
    </div>
  );
}
