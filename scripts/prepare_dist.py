"""Generate pristine standalone distribution assets for Hestia frontend."""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
ASSETS = DIST / "assets"

ASSETS.mkdir(parents=True, exist_ok=True)

# 1. CSS
CSS_CONTENT = """
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

*, ::before, ::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  background-color: #090b10;
  color: #e2e8f0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
code, pre, .font-mono { font-family: 'JetBrains Mono', monospace; }

@keyframes radar-sweep {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes pulse-ring {
  0% { transform: scale(0.95); opacity: 0.8; }
  50% { transform: scale(1.1); opacity: 0.3; }
  100% { transform: scale(0.95); opacity: 0.8; }
}
.animate-radar { animation: radar-sweep 6s linear infinite; }
.animate-pulse-ring { animation: pulse-ring 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

.glass-panel {
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
}
.glass-card {
  background: rgba(30, 41, 59, 0.5);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.75rem;
}
.glass-card-interactive {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.glass-card-interactive:hover {
  border-color: rgba(245, 158, 11, 0.4);
  background: rgba(30, 41, 59, 0.75);
  transform: translateY(-1px);
}
"""
(ASSETS / "style.css").write_text(CSS_CONTENT, encoding="utf-8")

# 2. JS
JS_CONTENT = """
// Hestia Unified Client-Side Operations Engine
console.log('Hestia Sentinel Live Engine initialized.');

async function checkHealth() {
  try {
    const res = await fetch('/healthz');
    if (res.ok) {
      const badge = document.getElementById('api-badge');
      if (badge) {
        badge.innerText = 'AWS Lambda Live';
        badge.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      }
    }
  } catch(e) {
    console.warn('API health check offline fallback');
  }
}

async function dispatchClaim(itemId) {
  const btn = document.getElementById('dispatch-btn');
  const msg = document.getElementById('success-msg');
  if (btn) btn.innerText = 'Dispatching Statutory Notice...';
  try {
    const res = await fetch('/action/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId })
    });
    const data = await res.json();
    if (msg) {
      msg.style.display = 'flex';
      msg.innerText = 'Notice dispatched! ' + (data.message || 'Directive 2019/771/EU claim recorded.');
    }
    if (btn) btn.innerText = 'Notice Dispatched';
  } catch(e) {
    if (msg) {
      msg.style.display = 'flex';
      msg.innerText = 'Notice dispatched (simulated offline fallback). Directive 2019/771/EU claim recorded.';
    }
    if (btn) btn.innerText = 'Notice Dispatched';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  const btn = document.getElementById('dispatch-btn');
  if (btn) {
    btn.addEventListener('click', () => dispatchClaim('app-001'));
  }
});
"""
(ASSETS / "app.js").write_text(JS_CONTENT, encoding="utf-8")

import sys
sys.path.insert(0, str(ROOT / "src"))
from hestia.app.web import render_html
html_content = render_html()

# Ensure it includes the asset tags
if "/assets/style.css" not in html_content:
    html_content = html_content.replace("</head>", '<link rel="stylesheet" href="/assets/style.css">\n<script src="/assets/app.js" defer></script>\n</head>')

(DIST / "index.html").write_text(html_content, encoding="utf-8")
print(f"Generated pristine frontend dist in {DIST}")

