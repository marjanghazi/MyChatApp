// AuthPage.jsx — QUANTX Authentication · Next-Level Cyber UI
import React from 'react';
import './AuthPage.css';

function AuthPage({
  appTheme,
  authMode,
  authForm,
  authLoading,
  authError,
  onToggleTheme,
  onModeChange,
  onFormChange,
  onSubmit,
  onBackToHome,
}) {
  const panelFeatures = [
    { icon: '🔑', label: 'CRYSTALS-Kyber Key Encapsulation' },
    { icon: '✍️', label: 'CRYSTALS-Dilithium Signatures' },
    { icon: '🔒', label: 'AES-256-GCM Authenticated Encryption' },
  ];

  const particles = Array.from({ length: 14 }, (_, i) => ({
    width:    `${2 + (i % 3)}px`,
    height:   `${2 + (i % 3)}px`,
    left:     `${(i * 7.14) % 100}%`,
    delay:    `${i * 0.55}s`,
    duration: `${8 + (i % 6) * 1.5}s`,
    opacity:  0.4 + (i % 4) * 0.1,
  }));

  return (
    <div className={`auth-shell app-theme-${appTheme}`}>

      {/* ── LEFT: Decorative visual panel ── */}
      <div className="auth-visual-panel">

        {/* Floating particles */}
        <div className="auth-panel-particles">
          {particles.map((p, i) => (
            <div
              key={i}
              className="auth-panel-particle"
              style={{
                width:             p.width,
                height:            p.height,
                left:              p.left,
                bottom:            '-10px',
                animationDelay:    p.delay,
                animationDuration: p.duration,
                opacity:           p.opacity,
              }}
            />
          ))}
        </div>

        <div className="auth-panel-content">
          {/* Logo */}
          <div className="auth-panel-logo">QUANTX</div>
          <div className="auth-panel-tagline">Post-Quantum Secure Communication</div>

          {/* Quantum orb */}
          <div className="auth-orb">
            <div className="auth-orb-ring"></div>
            <div className="auth-orb-ring"></div>
            <div className="auth-orb-ring"></div>
            <div className="auth-orb-core">⚛️</div>
          </div>

          {/* Feature pills */}
          <div className="auth-panel-features">
            {panelFeatures.map((f, i) => (
              <div key={i} className="auth-panel-feature">
                <span className="auth-panel-feature-icon">{f.icon}</span>
                <span>{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT: Form panel ── */}
      <div className="auth-form-panel">
        <div className="auth-card">

          {/* Mobile-only logo (hidden on desktop) */}
          <div className="auth-header">
            <h1 className="auth-logo">
              <span className="logo-gradient">QUANTX</span>
            </h1>
            <p className="auth-subtitle">Post-Quantum Secure Communication</p>
          </div>

          {/* Heading */}
          <div className="auth-section-heading">
            <h2>{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
            <p>
              {authMode === 'login'
                ? '// Sign in to your secure session'
                : '// Register to get quantum-safe access'}
            </p>
          </div>

          {/* Controls */}
          <div className="auth-controls">
            <button type="button" className="theme-switch-btn" onClick={onToggleTheme}>
              <span className="btn-icon">{appTheme === 'dark' ? '☀️' : '🌙'}</span>
              {appTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button type="button" className="back-home-btn" onClick={onBackToHome}>
              <span className="btn-icon">←</span>
              Back to Home
            </button>
          </div>

          {/* Mode tabs */}
          <div className="auth-tabs">
            <button
              type="button"
              className={`tab-btn ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => onModeChange('login')}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`tab-btn ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => onModeChange('register')}
            >
              Register
            </button>
          </div>

          {/* Form */}
          <form className="auth-form" onSubmit={onSubmit}>

            {authMode === 'register' && (
              <>
                <div className="input-group">
                  <input
                    type="text"
                    id="displayName"
                    placeholder=" "
                    value={authForm.displayName}
                    onChange={(e) => onFormChange('displayName', e.target.value)}
                    required
                    minLength={2}
                    autoComplete="name"
                  />
                  <label htmlFor="displayName">Full Name</label>
                </div>

                <div className="input-group">
                  <input
                    type="tel"
                    id="phoneNumber"
                    placeholder=" "
                    value={authForm.phoneNumber}
                    onChange={(e) => onFormChange('phoneNumber', e.target.value)}
                    required
                    autoComplete="tel"
                  />
                  <label htmlFor="phoneNumber">Phone (with country code)</label>
                </div>
              </>
            )}

            <div className="input-group">
              <input
                type="email"
                id="email"
                placeholder=" "
                value={authForm.email}
                onChange={(e) => onFormChange('email', e.target.value)}
                required
                autoComplete="email"
              />
              <label htmlFor="email">Email Address</label>
            </div>

            <div className="input-group">
              <input
                type="password"
                id="password"
                placeholder=" "
                value={authForm.password}
                onChange={(e) => onFormChange('password', e.target.value)}
                required
                minLength={6}
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
              />
              <label htmlFor="password">Password</label>
            </div>

            {authError && (
              <div className="error-text">
                <span className="error-icon">⚠️</span>
                {authError}
              </div>
            )}

            <button type="submit" className="submit-btn" disabled={authLoading}>
              {authLoading ? (
                <>
                  <span className="spinner"></span>
                  Securing connection…
                </>
              ) : (
                authMode === 'register' ? 'Create Secure Account →' : 'Sign In →'
              )}
            </button>
          </form>

          {/* Forgot password */}
          {authMode === 'login' && (
            <div className="auth-footer">
              <button type="button" className="forgot-password">
                Forgot password?
              </button>
            </div>
          )}

          {/* Security indicator */}
          <div className="auth-security-badge">
            <span className="auth-security-dot"></span>
            Kyber-1024 · Dilithium-3 · AES-256-GCM · End-to-End Encrypted
          </div>
        </div>
      </div>

    </div>
  );
}

export default AuthPage;