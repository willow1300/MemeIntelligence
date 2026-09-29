// MIE Extension — Popup script
// Queries the MIE backend (Supabase directly for V1) for token intelligence.
// Displays a lightweight intelligence overlay with expandable sections.

const SUPABASE_URL = 'https://ywytjmjhdzoxvftfknox.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3eXRqbWpoZHpveHZmdGZrbm94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4ODQwMDIsImV4cCI6MjEwMjQ2MDAwMn0.LhVOjydhAfPnVeHoPY6beG_kKx-uIpaLiqg7RcpXQt8';

const content = document.getElementById('content');
const input = document.getElementById('tokenInput');
const btn = document.getElementById('analyzeBtn');

// Auto-fill from last detected token
chrome.storage.local.get('lastDetectedToken', (result) => {
  if (result.lastDetectedToken) {
    input.value = result.lastDetectedToken;
  }
});

btn.addEventListener('click', () => analyze());
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') analyze(); });

async function analyze() {
  const address = input.value.trim();
  if (!address) return;
  content.innerHTML = '<div class="loading"><div class="spinner"></div>Running intelligence engines...</div>';

  try {
    const token = await fetchData('tokens', { address });
    if (!token || token.length === 0) {
      content.innerHTML = '<div class="error">Token not found in MIE database.</div>';
      return;
    }
    const t = token[0];
    const [metadata, lifecycle, analyses, similarities] = await Promise.all([
      fetchData('token_metadata', { token_id: t.id }),
      fetchData('token_lifecycles', { token_id: t.id }),
      fetchData('analyses', { token_id: t.id, analysis_type: 'OVERALL' }),
      fetchSimilarities(t.id),
    ]);

    const wallet = t.creator_wallet_id ? (await fetchData('wallets', { id: t.creator_wallet_id }))[0] : null;
    const developer = wallet ? (await fetchData('developers', { primary_wallet_id: wallet.id }))[0] : null;
    const tokenMetas = await fetchData('token_metas', { token_id: t.id });
    const metas = [];
    for (const tm of tokenMetas) {
      const m = (await fetchData('metas', { id: tm.meta_id }))[0];
      if (m) metas.push(m);
    }

    renderResult(t, metadata[0], lifecycle[0], analyses[0], similarities, wallet, developer, metas);
  } catch (e) {
    content.innerHTML = '<div class="error">Failed to fetch intelligence data.</div>';
    console.error(e);
  }
}

async function fetchData(table, filter) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) params.append(k, v);
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${table}`);
  return res.json();
}

async function fetchSimilarities(tokenId) {
  const [a, b] = await Promise.all([
    fetchData('token_similarities', { token_a_id: tokenId }),
    fetchData('token_similarities', { token_b_id: tokenId }),
  ]);
  return [...a, ...b];
}

function formatMC(v) {
  if (!v) return '—';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatTimeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const days = Math.floor(diff / 86400000);
  if (days >= 365) return `${Math.floor(days / 365)} year(s) ago`;
  if (days >= 30) return `${Math.floor(days / 30)} month(s) ago`;
  if (days >= 1) return `${days} day(s) ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `${hours} hour(s) ago`;
  const mins = Math.floor(diff / 60000);
  if (mins >= 1) return `${mins} minute(s) ago`;
  return `${Math.floor(diff / 1000)} second(s) ago`;
}

function signalColor(v) {
  const u = v.toUpperCase();
  if (u.includes('HIGH') || u.includes('STRONG') || u === 'OLD') return 'emerald';
  if (u.includes('MEDIUM') || u.includes('ESTABLISHED')) return 'amber';
  if (u.includes('LOW') || u.includes('WEAK') || u.includes('NEW') || u.includes('UNKNOWN')) return 'rose';
  return '';
}

function renderResult(token, metadata, lifecycle, analysis, similarities, wallet, developer, metas) {
  const lc = lifecycle || {};
  const ft = lc.failure_type || 'UNKNOWN';
  const ftDisplay = ft.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  const ftBadge = ft === 'HEALTHY' ? 'badge-emerald' : ft === 'LIQUIDITY_EVENT' || ft === 'DEV_SELLING' ? 'badge-rose' : 'badge-slate';

  // Parse research signal
  let signalComponents = [];
  let overallLabel = 'UNKNOWN';
  if (analysis && analysis.result) {
    const r = typeof analysis.result === 'string' ? JSON.parse(analysis.result) : analysis.result;
    signalComponents = r.components || [];
    overallLabel = (r.overall || 'UNKNOWN').replace(/_/g, ' ');
  }
  const overallClass = overallLabel.includes('HIGH') ? 'high' : overallLabel.includes('MEDIUM') ? 'medium' : 'low';

  // Wallet age
  let walletAgeLabel = 'Unknown';
  let walletAgeClass = '';
  if (wallet && wallet.first_seen_at) {
    const ageDays = (Date.now() - new Date(wallet.first_seen_at).getTime()) / 86400000;
    if (ageDays < 1) { walletAgeLabel = 'NEW (seconds before launch)'; walletAgeClass = 'rose'; }
    else if (ageDays > 365) { walletAgeLabel = `${Math.floor(ageDays / 365)} year(s) ago`; walletAgeClass = 'emerald'; }
    else if (ageDays > 30) { walletAgeLabel = `${Math.floor(ageDays)} days ago`; walletAgeClass = 'amber'; }
    else { walletAgeLabel = `${Math.floor(ageDays)} days ago`; walletAgeClass = 'rose'; }
  }

  // Similar tokens summary
  const highSim = similarities.filter(s => s.overall_score >= 0.7).length;
  let earliestMatch = null;
  for (const s of similarities) {
    const other = s.token_a_id === token.id ? s.token_b_id : s.token_a_id;
    const diff = s.token_a_id === token.id ? s.time_difference_seconds : -s.time_difference_seconds;
    if (diff < 0) {
      if (!earliestMatch || Math.abs(diff) < Math.abs(earliestMatch)) earliestMatch = Math.abs(diff);
    }
  }
  const earliestLabel = earliestMatch
    ? earliestMatch < 3600 ? `${Math.round(earliestMatch / 60)} min earlier`
    : earliestMatch < 86400 ? `${Math.floor(earliestMatch / 3600)}h earlier`
    : `${Math.floor(earliestMatch / 86400)}d earlier`
    : '—';

  // Meta labels
  const metaLabels = metas.map(m => m.name).slice(0, 5).join(' / ');

  const html = `
    <div class="token-header">
      ${token.image_url
        ? `<img src="${token.image_url}" alt="${token.symbol}" onerror="this.style.display='none'" />`
        : `<div class="placeholder">${token.symbol.charAt(0)}</div>`}
      <div class="info">
        <h2>$${token.symbol}</h2>
        <div class="name">${token.name}</div>
      </div>
      <span class="badge ${ftBadge}" style="margin-left:auto;">${ftDisplay}</span>
    </div>

    <div class="stats">
      <div class="stat"><div class="label">Peak MC</div><div class="value">${formatMC(lc.peak_market_cap)}</div></div>
      <div class="stat"><div class="label">Volume</div><div class="value">—</div></div>
      <div class="stat"><div class="label">Liquidity</div><div class="value">—</div></div>
      <div class="stat"><div class="label">Wallet Age</div><div class="value ${walletAgeClass}">${walletAgeLabel}</div></div>
    </div>

    <div class="stats">
      <div class="stat"><div class="label">Similar Tokens</div><div class="value">${similarities.length} found</div></div>
      <div class="stat"><div class="label">Earliest Match</div><div class="value amber">${earliestLabel}</div></div>
    </div>

    <div class="stats">
      <div class="stat"><div class="label">Developer</div><div class="value">${developer ? developer.name : 'Unknown'}</div></div>
      <div class="stat"><div class="label">Launches</div><div class="value">${developer ? developer.launch_count : '—'}</div></div>
    </div>

    <div class="stat" style="margin-bottom: 10px;">
      <div class="label">Meta</div>
      <div class="value" style="font-size:12px;">${metaLabels || 'Not classified'}</div>
    </div>

    <div class="overall-badge ${overallClass}">RESEARCH SIGNAL: ${overallLabel}</div>

    ${signalComponents.length > 0 ? `
    <div class="collapsible">
      <div class="collapsible-header" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
        <span class="arrow">▶</span> Why? (Research Signal)
      </div>
      <div class="collapsible-body">
        <div class="signal-grid">
          ${signalComponents.map(c => `<div class="signal-pill"><span class="l">${c.label}</span><span class="v ${signalColor(c.value)}">${c.value}</span></div>`).join('')}
        </div>
      </div>
    </div>` : ''}

    ${similarities.length > 0 ? `
    <div class="collapsible">
      <div class="collapsible-header" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
        <span class="arrow">▶</span> Similar Tokens (${similarities.length})
      </div>
      <div class="collapsible-body">
        ${similarities.slice(0, 5).map((s, i) => {
          const diff = s.token_a_id === token.id ? s.time_difference_seconds : -s.time_difference_seconds;
          const earlier = diff < 0;
          const abs = Math.abs(diff);
          const label = abs < 3600 ? `${Math.round(abs/60)}m` : abs < 86400 ? `${Math.floor(abs/3600)}h` : `${Math.floor(abs/86400)}d`;
          return `<div class="similar-item"><span class="sym">#${i+1}</span><span class="time">${earlier ? label + ' earlier' : label + ' later'}</span><span class="score">${(s.overall_score*100).toFixed(0)}% match</span></div>`;
        }).join('')}
      </div>
    </div>` : ''}

    ${developer ? `
    <div class="collapsible">
      <div class="collapsible-header" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
        <span class="arrow">▶</span> Developer (${developer.name})
      </div>
      <div class="collapsible-body">
        <div class="stats">
          <div class="stat"><div class="label">Total Launches</div><div class="value">${developer.launch_count}</div></div>
        </div>
      </div>
    </div>` : ''}

    ${wallet ? `
    <div class="collapsible">
      <div class="collapsible-header" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
        <span class="arrow">▶</span> Wallet
      </div>
      <div class="collapsible-body">
        <div class="stats">
          <div class="stat"><div class="label">First Observed</div><div class="value ${walletAgeClass}">${formatTimeAgo(wallet.first_seen_at)}</div></div>
          <div class="stat"><div class="label">Transactions</div><div class="value">${wallet.transaction_count}</div></div>
        </div>
        <div class="stat" style="margin-top:6px;"><div class="label">Type</div><div class="value" style="font-size:12px;">${wallet.wallet_type}</div></div>
      </div>
    </div>` : ''}

    ${lifecycle ? `
    <div class="collapsible">
      <div class="collapsible-header" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
        <span class="arrow">▶</span> Lifecycle
      </div>
      <div class="collapsible-body">
        <div class="stats">
          <div class="stat"><div class="label">Peak MC</div><div class="value">${formatMC(lc.peak_market_cap)}</div></div>
          <div class="stat"><div class="label">Classification</div><div class="value" style="font-size:12px;">${ftDisplay}</div></div>
        </div>
        ${lc.evidence && lc.evidence.length > 0 ? `<div class="evidence" style="margin-top:6px;"><ul>${lc.evidence.map(e => `<li>${e}</li>`).join('')}</ul></div>` : ''}
      </div>
    </div>` : ''}

    <div class="collapsible">
      <div class="collapsible-header" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
        <span class="arrow">▶</span> Meta
      </div>
      <div class="collapsible-body">
        ${metas.length > 0 ? metas.map(m => `<div class="similar-item"><span class="sym">${m.name}</span><span class="badge badge-slate" style="margin-left:auto;">${m.type}</span></div>`).join('') : 'Not classified'}
      </div>
    </div>

    <div class="disclaimer">
      MIE is a research tool. Not financial advice. All conclusions are analytical with evidence and confidence.
    </div>
  `;
  content.innerHTML = html;
}
