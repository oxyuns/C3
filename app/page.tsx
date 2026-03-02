'use client';

import { useEffect, useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth, googleProvider, isAllowedEmail } from '@/lib/firebase';
import { useAuth } from '@/components/Providers';
import { Logo } from '@/components/Logo';

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const { user, loading, isAuthorized } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && isAuthorized) {
      router.push('/app');
    }
  }, [user, loading, isAuthorized, router]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function handleGetStarted() {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (!isAllowedEmail(result.user.email)) {
        const email = result.user.email ?? '';
        router.push(`/waitlist?email=${encodeURIComponent(email)}`);
      }
    } catch {
      // User closed popup or cancelled — do nothing
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-[#2a2a2a]' : 'bg-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo color="white" size={28} />
            <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-[2px] rounded bg-[#f3ff97]/15 text-[#f3ff97]">
              beta
            </span>
          </div>
          <button
            onClick={handleGetStarted}
            className="text-sm px-4 py-2 rounded-lg bg-[#f3ff97] text-black font-medium hover:bg-[#e5f080] transition-colors"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <Logo color="white" size={72} className="mx-auto mb-8" />
          <div className="inline-block px-3 py-1 mb-6 rounded-full border border-[#2a2a2a] text-xs text-[#a0a0a0]">
            AI-Powered Contract Design
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight tracking-tight mb-6">
            Design DAML contracts
            <br />
            <span className="text-[#f3ff97]">with intelligence.</span>
          </h1>
          <p className="text-lg text-[#a0a0a0] max-w-xl mx-auto mb-10 leading-relaxed">
            AI-driven contract design with production-ready code, multi-view diagrams, and financial domain expertise — built for Canton.
          </p>
          <button
            onClick={handleGetStarted}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-[#f3ff97] text-black font-semibold text-base hover:bg-[#e5f080] transition-colors"
          >
            Get Started
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 flex flex-col items-center gap-2 text-[#666666]">
          <span className="text-xs">Scroll to explore</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-bounce"
          >
            <path d="M12 5v14" />
            <path d="m19 12-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">End-to-end contract design</h2>
            <p className="text-[#a0a0a0] text-base max-w-lg mx-auto">
              From conversation to production-ready code — everything you need to build Canton smart contracts.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                title: 'AI-Powered Design',
                desc: 'Describe your contract requirements in plain language. The AI architects complete DAML solutions — templates, choices, party structures, and signatories — through iterative conversation.',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                ),
              },
              {
                title: 'Production-Ready Codebase',
                desc: 'Get complete DAML project files — templates, choices, test scenarios, and daml.yaml config. Export as a ZIP and deploy directly to your Canton network.',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                    <line x1="14" y1="4" x2="10" y2="20" />
                  </svg>
                ),
              },
              {
                title: 'Multi-View Diagrams',
                desc: 'Auto-generated visualizations that evolve with your design. Flowcharts for architecture, sequence diagrams for workflows, ER diagrams for data models, and state diagrams for contract lifecycles.',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <path d="M14 17h7" />
                    <path d="M17.5 14v7" />
                  </svg>
                ),
              },
              {
                title: 'Financial Domain Intelligence',
                desc: 'Optimized for financial contracts with built-in knowledge of global regulatory frameworks, financial instruments, and industry standards. From derivatives and securities lending to settlement and collateral management.',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 20h20" />
                    <path d="M5 20V8l7-5 7 5v12" />
                    <path d="M9 20v-4h6v4" />
                    <path d="M9 12h6" />
                    <path d="M12 9v3" />
                  </svg>
                ),
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-xl bg-[#141414] border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-[#f3ff97] mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-[#a0a0a0] leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 border-t border-[#2a2a2a]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to build?</h2>
          <p className="text-[#a0a0a0] mb-8">
            Start designing your Canton smart contracts with AI assistance.
          </p>
          <button
            onClick={handleGetStarted}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-[#f3ff97] text-black font-semibold hover:bg-[#e5f080] transition-colors"
          >
            Get Started
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      </section>
    </div>
  );
}
