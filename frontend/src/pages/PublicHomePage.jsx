// PublicHomePage.jsx — QUANTX Next-Level Cybersecurity UI
import React, { useState, useEffect } from 'react';
import './PublicHomePage.css';

const PublicHomePage = ({ appTheme, onToggleTheme, onNavigate }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection]   = useState('home');
  const [typedText, setTypedText]           = useState('');
  const [showScrollTop, setShowScrollTop]   = useState(false);

  const fullText = 'ML-KEM-768 • ML-DSA-65 • AES-256-GCM • Post-Quantum';

  /* Typing effect */
  useEffect(() => {
    let idx = 0;
    const iv = setInterval(() => {
      setTypedText(fullText.slice(0, idx + 1));
      idx++;
      if (idx === fullText.length) clearInterval(iv);
    }, 45);
    return () => clearInterval(iv);
  }, []);

  /* Scroll-to-top trigger */
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 500);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Active-section tracker */
  useEffect(() => {
    const sections = ['home','features','about','security','architecture','sdg','contact'];
    if (typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.id); }),
      { threshold: 0.35 }
    );
    sections.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const handleNavigation = (page, path) => {
    if (onNavigate && path) onNavigate(path);
    setMobileMenuOpen(false);
  };

  /* ── DATA ── */
  const navItems = ['home','features','about','security','architecture','sdg','contact'];

  const highlights = [
    {
      title: 'NIST PQC Standards',
      description: 'ML-KEM-768 for quantum-resistant key exchange and ML-DSA-65 for digital signatures — based on standardized post-quantum algorithms.',
      icon: '🔒',
      color: 'var(--ph-accent-a)',
    },
    {
      title: 'Quantum-Resistant Core',
      description: 'Compare a classical X25519/Ed25519 mode with an ML-KEM/ML-DSA mode in the same chat application.',
      icon: '⚛️',
      color: 'var(--ph-accent-b)',
    },
    {
      title: 'Browser-held Keys',
      description: 'Encryption identities stay in this browser. The Python backend stores public keys and relays encrypted direct messages.',
      icon: '📱',
      color: 'var(--ph-accent-c)',
    },
  ];

  const features = [
    { title: 'ML-KEM-768 KEM',     description: 'Module-Lattice Key Encapsulation for quantum-safe shared secret derivation. CCA-secure and NIST standardized.',                           icon: '🔑' },
    { title: 'ML-DSA-65',     description: 'Digital signatures from module lattices for message authentication and integrity, combined with contact safety-number verification.',                   icon: '✍️' },
    { title: 'AES-256-GCM Encryption', description: 'Random 256-bit keys encrypt direct messages and direct-chat attachments in both modes.',                           icon: '🔐' },
    { title: 'Migration Demonstration',        description: 'Switch the configured mode and compare message algorithms, key sizes, and local benchmark timings.',                          icon: '📊' },
    { title: 'Local Key Storage',     description: 'Browser-local identities preserve message history across reloads. Secret keys are never synchronized to the server.',             icon: '🔄' },
    { title: 'MITM Detection',         description: 'Changed contact identities block sending until you verify and trust the new safety number.',                     icon: '🛡️' },
  ];

  const securityAlgorithms = [
    { name: 'ML-KEM-768',    description: 'CCA-secure module-lattice-based KEM for quantum-safe key exchange and encapsulation/decapsulation.',          icon: '🔑', layer: 'Key Exchange Layer'    },
    { name: 'ML-DSA-65',description: 'Digital signatures from module lattices for authentication and message integrity verification.',                icon: '✍️', layer: 'Signature Layer'       },
    { name: 'AES-256-GCM',       description: 'Authenticated encryption with Galois/Counter Mode for confidentiality, integrity, and authenticity.',          icon: '🔒', layer: 'Encryption Layer'      },
    { name: 'PQC Infrastructure',description: 'FastAPI relay with authenticated public-key registration and ciphertext storage in PostgreSQL.',           icon: '⚙️', layer: 'Infrastructure Layer'  },
  ];

  const sdgGoals = [
    { goal: 'SDG 4',  title: 'Quality Education',               description: 'Educational platform for learning post-quantum cryptography and implementing secure communication protocols.', icon: '📚' },
    { goal: 'SDG 9',  title: 'Industry & Innovation',           description: 'Quantum-safe infrastructure for next-generation secure communications across industries and institutions.',    icon: '🏭' },
    { goal: 'SDG 16', title: 'Peace, Justice & Institutions',   description: 'Protecting sensitive governmental, diplomatic, and institutional communications from quantum adversaries.',    icon: '⚖️' },
  ];

  const stats = [
    { value: 'Standardized', label: 'PQC Standards',       icon: '✅' },
    { value: 'Kyber+Dilithium', label: 'Quantum-Resistant', icon: '⚛️' },
    { value: '256-bit',       label: 'AES Encryption',      icon: '🔐' },
    { value: 'Browser Client',  label: 'Cross-Platform',      icon: '📱' },
  ];

  const systemModules = [
    { name: 'User Interface Layer',   details: 'React Browser Client • Direct Chat', icon: '🖥️' },
    { name: 'Backend API Layer',      details: 'FastAPI + REST + Bearer Authentication',             icon: '🔌' },
    { name: 'ML-KEM-768 KEM',     details: 'Key Generation • Encapsulation • Decapsulation',     icon: '🔑' },
    { name: 'ML-DSA-65',     details: 'Signature Generation & Verification',                icon: '✍️' },
    { name: 'AES-256-GCM Layer',      details: 'Message Encryption • File Sharing • Integrity',      icon: '🔒' },
    { name: 'Migration Demonstration',        details: 'Classical • PQC • Local Benchmarks',            icon: '📊' },
  ];

  return (
    <div className={`ph-landing-shell ph-app-theme-${appTheme}`}>

      {/* ── BACKGROUND ── */}
      <div className="ph-bg-animation">
        <div className="ph-bg-grid"></div>
        <div className="ph-bg-gradient"></div>
        <div className="ph-bg-scan-lines"></div>
        <div className="ph-bg-particles">
          {[...Array(24)].map((_, i) => (
            <div
              key={i}
              className="ph-particle"
              style={{
                left:              `${(i * 4.17) % 100}%`,
                animationDelay:    `${i * 0.6}s`,
                animationDuration: `${12 + (i % 8) * 2}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* ── HEADER ── */}
      <header className="ph-landing-header">
        <nav className="ph-nav-container">

          {/* Brand */}
          <div className="ph-landing-brand" onClick={() => scrollToSection('home')}>
            <div className="ph-brand-mark">
              <span>Q</span>
            </div>
            <div className="ph-brand-info">
              <h1>QUANTX</h1>
              <p>Post-Quantum Secure Communication</p>
            </div>
          </div>

          {/* Desktop links */}
          <div className="ph-nav-links">
            {navItems.map(section => (
              <button
                key={section}
                className={`ph-nav-link ${activeSection === section ? 'ph-active' : ''}`}
                onClick={() => scrollToSection(section)}
              >
                {section === 'sdg' ? 'SDG' : section.charAt(0).toUpperCase() + section.slice(1)}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="ph-landing-actions">
            <button type="button" className="ph-theme-switch-btn" onClick={onToggleTheme}>
              <span>{appTheme === 'dark' ? '☀️' : '🌙'}</span>
              <span className="ph-btn-text">{appTheme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <button type="button" className="ph-ghost-btn"   onClick={() => handleNavigation('login',    'login')}>Sign In</button>
            <button type="button" className="ph-primary-btn" onClick={() => handleNavigation('register', 'register')}>Get Started</button>
            <button className="ph-mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </nav>

        {/* Mobile nav */}
        {mobileMenuOpen && (
          <div className="ph-mobile-nav">
            {navItems.map(section => (
              <button key={section} className="ph-mobile-nav-link" onClick={() => scrollToSection(section)}>
                {section === 'sdg' ? 'SDG Goals' : section.charAt(0).toUpperCase() + section.slice(1)}
              </button>
            ))}
            <button className="ph-primary-btn" style={{ marginTop: '0.5rem' }} onClick={() => handleNavigation('register', 'register')}>
              Get Started →
            </button>
          </div>
        )}
      </header>

      {/* ── MAIN ── */}
      <main className="ph-landing-main">

        {/* HERO */}
        <section id="home" className="ph-hero-section">
          <div className="ph-hero-content">

            <div className="ph-hero-badge">
              <span className="ph-badge-dot"></span>
              NIST PQC Standardization • ML-KEM-768 • ML-DSA-65
            </div>

            <h1 className="ph-hero-title">
              Secure Communication for the
              <span className="ph-gradient-text">Post-Quantum Era</span>
            </h1>

            <div className="ph-hero-typed">
              <span className="ph-typed-cursor">▌</span>
              <span className="ph-typed-text">{typedText}</span>
            </div>

            <p className="ph-hero-description">
              QuantX demonstrates migration from classical X25519 and Ed25519 to ML-KEM-768 and ML-DSA-65,
              while keeping AES-256-GCM and the same direct-chat experience.
              Direct messages and their attachments are encrypted in your browser.
              Group posts and calls are outside this encryption demonstration.
            </p>

            <div className="ph-hero-cta-group">
              <button className="ph-primary-btn ph-large" onClick={() => handleNavigation('register', 'register')}>
                Start Secure Messaging <span className="ph-btn-arrow">→</span>
              </button>
              <button className="ph-ghost-btn ph-large" onClick={() => scrollToSection('features')}>
                Explore Features <span className="ph-btn-arrow">▼</span>
              </button>
            </div>

            <div className="ph-hero-stats">
              {stats.map((stat, i) => (
                <div key={i} className="ph-stat-item">
                  <div className="ph-stat-icon">{stat.icon}</div>
                  <div className="ph-stat-value">{stat.value}</div>
                  <div className="ph-stat-label">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quantum visual */}
          <div className="ph-hero-visual">
            <div className="ph-quantum-container">
              <div className="ph-quantum-animation">
                <div className="ph-quantum-core"></div>
                <div className="ph-quantum-ring ph-ring-1"></div>
                <div className="ph-quantum-ring ph-ring-2"></div>
                <div className="ph-quantum-ring ph-ring-3"></div>
                <div className="ph-quantum-ring ph-ring-4"></div>
                <div className="ph-photon ph-photon-1">🔑</div>
                <div className="ph-photon ph-photon-2">✍️</div>
                <div className="ph-photon ph-photon-3">🔒</div>
                <div className="ph-photon ph-photon-4">⚛️</div>
              </div>
              <div className="ph-qkd-badge">Kyber • Dilithium • AES-256-GCM</div>
            </div>
          </div>
        </section>

        {/* HIGHLIGHTS */}
        <section className="ph-highlights-section">
          <div className="ph-section-header">
            <span className="ph-section-label">WHY QUANTX</span>
            <h2>Built for the Quantum Age</h2>
            <p>Compare classical and post-quantum algorithms in one direct-chat application.</p>
          </div>
          <div className="ph-highlight-grid">
            {highlights.map((item) => (
              <article key={item.title} className="ph-highlight-card" style={{ '--card-color': item.color }}>
                <span className="ph-card-icon">{item.icon}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div className="ph-card-hover-effect"></div>
              </article>
            ))}
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="ph-features-section">
          <div className="ph-section-header">
            <span className="ph-section-label">CAPABILITIES</span>
            <h2>Post-Quantum Cryptographic Features</h2>
            <p>A comprehensive secure-communication ecosystem built on NIST PQC standards.</p>
          </div>
          <div className="ph-features-grid">
            {features.map((f, i) => (
              <div key={i} className="ph-feature-card">
                <span className="ph-feature-icon">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
                <div className="ph-feature-glow"></div>
              </div>
            ))}
          </div>
        </section>

        {/* ABOUT */}
        <section id="about" className="ph-about-section">
          <div className="ph-about-content">
            <div className="ph-about-text">
              <span className="ph-section-label" style={{ marginBottom: '1rem', display: 'inline-block' }}>ABOUT</span>
              <h2>About QuantX</h2>
              <p className="ph-about-lead">
                An educational chat application demonstrating migration to standardized post-quantum algorithms.
              </p>
              <p>
                Developed by <strong>M. Marjan Ghazi</strong>, <strong>M. Mudassir</strong>, and <strong>Faiq Riaz</strong> at
                National University of Modern Languages, Islamabad, supervised by <strong>Faisal Hussain</strong>.
                QuantX bridges theoretical post-quantum cryptography with practical daily communication,
                implementing ML-KEM-768, ML-DSA-65, and AES-256-GCM for the PQC mode, alongside
                a classical X25519 and Ed25519 baseline.
              </p>
              <div className="ph-about-features">
                {[
                  'ML-KEM-768 Key Encapsulation',
                  'ML-DSA-65 Signatures',
                  'AES-256-GCM Authenticated Encryption',
                  'Contact Identity Verification',
                  'React Browser Client',
                  'Classical and PQC Comparison',
                ].map((item, i) => (
                  <div key={i} className="ph-about-item">
                    <span className="ph-about-check">✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="ph-about-image">
              <div className="ph-about-graphic">
                <div className="ph-graphic-core">⚛️</div>
                <div className="ph-graphic-ring"></div>
                <div className="ph-graphic-ring2"></div>
                <div className="ph-graphic-particle ph-p1">🔐</div>
                <div className="ph-graphic-particle ph-p2">🛡️</div>
                <div className="ph-graphic-particle ph-p3">🔑</div>
              </div>
            </div>
          </div>
        </section>

        {/* SECURITY */}
        <section id="security" className="ph-security-section">
          <div className="ph-section-header">
            <span className="ph-section-label">CRYPTOGRAPHY</span>
            <h2>NIST Post-Quantum Security Architecture</h2>
            <p>Multi-layer lattice-based protection against quantum and classical threats.</p>
          </div>
          <div className="ph-security-grid">
            {securityAlgorithms.map((algo, i) => (
              <div key={i} className="ph-security-card">
                <span className="ph-security-icon">{algo.icon}</span>
                <h3>{algo.name}</h3>
                <p>{algo.description}</p>
                <div className="ph-security-badge">{algo.layer}</div>
              </div>
            ))}
          </div>
          <div className="ph-security-note">
            🔬 NIST PQC Standardization Project • ML-KEM-768 (2023) • ML-DSA-65 (2023) • FIPS-197 AES
          </div>
        </section>

        {/* ARCHITECTURE */}
        <section id="architecture" className="ph-architecture-section">
          <div className="ph-section-header">
            <span className="ph-section-label">SYSTEM DESIGN</span>
            <h2>System Architecture</h2>
            <p>A modular browser implementation for comparing classical and post-quantum direct messaging.</p>
          </div>

          <div className="ph-architecture-diagram">
            {[
              { icon: '📱', label: 'User Interface Layer',          detail: 'React Browser App • Direct Chat Interface' },
              { icon: '🔌', label: 'Backend API Layer',             detail: 'REST APIs • Bearer Auth • Public Identity Registry • Ciphertext Storage' },
              { icon: '🔑', label: 'ML-KEM-768 KEM',           detail: 'Key Generation • Public/Secret Keys • Encapsulation/Decapsulation • Shared Secret' },
              { icon: '✍️', label: 'ML-DSA-65 Signatures', detail: 'Bundle Signing • Message Signing • Contact Verification' },
              { icon: '🔒', label: 'AES-256-GCM Encryption Layer', detail: 'Message Encryption/Decryption • File Sharing • Integrity Validation' },
              { icon: '📊', label: 'Migration Demonstration',               detail: 'Mode Selection • Message Labels • Local Benchmark Script' },
            ].map((layer, i, arr) => (
              <React.Fragment key={i}>
                <div className="ph-arch-layer">
                  <span>{layer.icon} {layer.label}</span>
                  <small>{layer.detail}</small>
                </div>
                {i < arr.length - 1 && <div className="ph-arch-arrow">▼</div>}
              </React.Fragment>
            ))}
          </div>

          <div className="ph-arch-modules">
            <h3>Core Modules</h3>
            <div className="ph-modules-grid">
              {systemModules.map((m, i) => (
                <div key={i} className="ph-module-card">
                  <span className="ph-module-icon">{m.icon}</span>
                  <div className="ph-module-info">
                    <h4>{m.name}</h4>
                    <p>{m.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SDG */}
        <section id="sdg" className="ph-sdg-section">
          <div className="ph-section-header">
            <span className="ph-section-label">GLOBAL IMPACT</span>
            <h2>Sustainable Development Goals</h2>
            <p>Aligning with UN SDGs for meaningful global impact.</p>
          </div>
          <div className="ph-sdg-grid">
            {sdgGoals.map((sdg, i) => (
              <div key={i} className="ph-sdg-card">
                <span className="ph-sdg-icon">{sdg.icon}</span>
                <h3>{sdg.goal}</h3>
                <h4>{sdg.title}</h4>
                <p>{sdg.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* RESEARCH */}
        <section className="ph-research-section">
          <div className="ph-section-header">
            <span className="ph-section-label">FOUNDATIONS</span>
            <h2>Research & Development</h2>
            <p>Built on established cryptographic standards and cutting-edge PQC research.</p>
          </div>
          <div className="ph-research-grid">
            {[
              { icon: '📄', title: 'Bennett & Brassard (1984)',   body: 'Quantum cryptography: Public key distribution and coin tossing — foundational quantum key distribution protocol.' },
              { icon: '🏛️', title: 'NIST PQC Standardization',   body: 'ML-KEM and ML-DSA were standardized by NIST in FIPS 203 and FIPS 204 in August 2024.' },
              { icon: '🔬', title: 'Bos, Ducas, Kiltz et al.',   body: 'ML-KEM-768: A CCA-Secure Module-Lattice-Based Key Encapsulation Mechanism (2018).' },
              { icon: '⚡', title: 'Mosca & Stebila (2016)',      body: 'Post-Quantum Key Exchange for the Internet and the Open Quantum Safe Project.' },
            ].map((r, i) => (
              <div key={i} className="ph-research-card">
                <span className="ph-research-icon">{r.icon}</span>
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="ph-cta-section">
          <div className="ph-cta-content">
            <h2>Ready for Post-Quantum Secure Communication?</h2>
            <p>
              Join the future of secure messaging with ML-KEM-768, ML-DSA-65, and AES-256-GCM —
              Explore the transition from classical to post-quantum direct messaging.
            </p>
            <div className="ph-cta-buttons">
              <button className="ph-primary-btn ph-large" onClick={() => handleNavigation('register', 'register')}>
                Start Secured Messaging →
              </button>
              <button className="ph-ghost-btn ph-light ph-large" onClick={() => scrollToSection('contact')}>
                Contact Research Team
              </button>
            </div>
          </div>
        </section>

        {/* CONTACT */}
        <section id="contact" className="ph-contact-section">
          <div className="ph-section-header">
            <span className="ph-section-label">CONTACT</span>
            <h2>Get in Touch</h2>
            <p>Have questions about QuantX or post-quantum cryptography? Reach out to our research team.</p>
          </div>
          <div className="ph-contact-content">
            <div className="ph-contact-info">
              <div className="ph-contact-details">
                <div className="ph-contact-item"><span className="ph-contact-icon">📧</span><span>quantx@numl.edu.pk</span></div>
                <div className="ph-contact-item"><span className="ph-contact-icon">🏛️</span><span>National University of Modern Languages, Islamabad</span></div>
                <div className="ph-contact-item"><span className="ph-contact-icon">👨‍🔬</span><span>Supervisor: Faisal Hussain</span></div>
              </div>
              <div className="ph-project-authors">
                <h4>Research Team</h4>
                <p>M. Marjan Ghazi (BSCS-MC-253) • M. Mudassir (BSCS-MC-240) • Faiq Riaz (BSCS-MC-231)</p>
                <p className="ph-dept">Department of Computer Science, NUML Islamabad</p>
              </div>
            </div>

            <form className="ph-contact-form" onSubmit={(e) => e.preventDefault()}>
              <input  type="text"  placeholder="Your name"                className="ph-form-input"    />
              <input  type="email" placeholder="Email address"            className="ph-form-input"    />
              <input  type="text"  placeholder="Organization/Institution" className="ph-form-input"    />
              <textarea            placeholder="Message / Research Inquiry" rows="5" className="ph-form-textarea"></textarea>
              <button type="submit" className="ph-primary-btn ph-large">Send Message →</button>
            </form>
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="ph-landing-footer">
        <div className="ph-footer-content">
          <div className="ph-footer-section">
            <div className="ph-footer-brand">
              <div className="ph-brand-mark ph-small">Q</div>
              <h3>QUANTX</h3>
            </div>
            <p>
              Post-Quantum Secure Communication integrating ML-KEM-768, ML-DSA-65,
              and AES-256-GCM in an educational migration demonstration.
            </p>
            <div className="ph-social-links">
              <a href="https://github.com/paulmillr/noble-post-quantum" className="ph-social-link">Crypto library</a>
              <a href="https://csrc.nist.gov/pubs/fips/203/final" className="ph-social-link">ML-KEM standard</a>
              <a href="https://csrc.nist.gov/pubs/fips/204/final" className="ph-social-link">ML-DSA standard</a>
            </div>
          </div>

          <div className="ph-footer-section">
            <h4>Product</h4>
            {['features','security','architecture','sdg'].map(s => (
              <button key={s} className="ph-footer-link" onClick={() => scrollToSection(s)}>
                {s === 'sdg' ? 'SDG Goals' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <div className="ph-footer-section">
            <h4>Research</h4>
            {['ML-KEM-768','ML-DSA-65','NIST PQC Standards','Publications'].map((item, i) => (
              <button key={i} className="ph-footer-link">{item}</button>
            ))}
          </div>

          <div className="ph-footer-section">
            <h4>Legal</h4>
            {['Privacy Policy','Security Whitepaper','NIST Compliance'].map((item, i) => (
              <button key={i} className="ph-footer-link">{item}</button>
            ))}
          </div>
        </div>

        <div className="ph-footer-bottom">
          <p>© 2025 QuantX • Department of Computer Science, National University of Modern Languages, Islamabad</p>
          <p className="ph-footer-status">⚛ ML-KEM-768 • ML-DSA-65 • AES-256-GCM • Quantum-Secure 🔒</p>
        </div>
      </footer>

      {/* Scroll to top */}
      {showScrollTop && (
        <button className="ph-scroll-top" onClick={scrollToTop} aria-label="Scroll to top">↑</button>
      )}
    </div>
  );
};

export default PublicHomePage;