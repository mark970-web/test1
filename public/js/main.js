/* ═══════════════════════════════════════════
   VacayYay – Shared JS v2
═══════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────────────────
const APP = {
  user:     JSON.parse(localStorage.getItem('vy_user')     || 'null'),
  token:    localStorage.getItem('vy_token')               || null,
  wishlist: JSON.parse(localStorage.getItem('vy_wishlist') || '[]'),
};

// ── Persist ────────────────────────────────────────────────────────────────
function saveWishlist() {
  localStorage.setItem('vy_wishlist', JSON.stringify(APP.wishlist));
}

function saveUser(user, token) {
  APP.user  = user;
  if (token) { APP.token = token; localStorage.setItem('vy_token', token); }
  localStorage.setItem('vy_user', JSON.stringify(user));
}

function logout() {
  const listingsKey = APP.user ? `vy_listings_${APP.user.id}` : null;
  APP.user     = null;
  APP.token    = null;
  APP.wishlist = [];
  localStorage.removeItem('vy_user');
  localStorage.removeItem('vy_token');
  localStorage.removeItem('vy_wishlist');
  if (listingsKey) localStorage.removeItem(listingsKey);
  window.location.href = '/';
}

// ── Auth headers ───────────────────────────────────────────────────────────
function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (APP.token) h['Authorization'] = `Bearer ${APP.token}`;
  return h;
}

// ── Sync server wishlist on login ──────────────────────────────────────────
async function syncWishlist() {
  if (!APP.token) return;
  try {
    const res = await fetch('/api/wishlist/ids', { headers: authHeaders() });
    if (!res.ok) return;
    const { ids } = await res.json();
    const merged = [...new Set([...ids, ...APP.wishlist])];
    APP.wishlist = merged;
    saveWishlist();
  } catch {}
}

// ── Wishlist toggle ────────────────────────────────────────────────────────
async function toggleWishlist(id, btn) {
  const idx  = APP.wishlist.indexOf(id);
  const icon = btn.querySelector('.material-symbols-outlined');
  const adding = idx === -1;
  if (adding) {
    APP.wishlist.push(id);
    btn.classList.add('active');
    if (icon) icon.style.fontVariationSettings = "'FILL' 1";
  } else {
    APP.wishlist.splice(idx, 1);
    btn.classList.remove('active');
    if (icon) icon.style.fontVariationSettings = "'FILL' 0";
  }
  // Persist to localStorage immediately so navigating away keeps the change
  saveWishlist();
  // Sync to server in the background (don't block on it)
  if (APP.token) {
    const method = adding ? 'POST' : 'DELETE';
    fetch(`/api/wishlist/${id}`, { method, headers: authHeaders() }).catch(() => {});
  }
}

// ── Build property card ────────────────────────────────────────────────────
function buildPropertyCard(prop) {
  const wishlisted = APP.wishlist.includes(prop.id);
  const fillFav    = wishlisted ? 1 : 0;
  const isUser     = prop.user_id !== null && prop.user_id !== undefined;
  return `
<div class="col">
  <article class="property-card h-100" onclick="location.href='/property/${prop.id}'">
    <div class="property-img-wrap mb-3">
      <img src="${prop.image}" alt="${prop.title}" loading="lazy">
      <span class="prop-badge ${prop.badgeType}">${isUser ? 'Community' : prop.badge}</span>
      <button class="fav-btn ${wishlisted ? 'active' : ''}"
              onclick="event.stopPropagation(); toggleWishlist(${prop.id}, this)"
              aria-label="Save to wishlist">
        <span class="material-symbols-outlined" style="font-size:1.2rem;font-variation-settings:'FILL' ${fillFav}">favorite</span>
      </button>
      <div class="price-bubble ${prop.priceColor}">
        $${prop.price}<span style="font-size:10px;font-weight:700"> /night</span>
      </div>
    </div>
    <div class="prop-body">
      <div class="d-flex justify-content-between align-items-start mb-1">
        <h3 class="prop-title mb-0">${prop.title}</h3>
        <span class="prop-rating d-flex align-items-center gap-1 ms-2 flex-shrink-0">
          <span class="material-symbols-outlined star" style="font-size:15px;font-variation-settings:'FILL' 1">star</span>
          ${prop.rating > 0 ? prop.rating : 'New'}
        </span>
      </div>
      <p class="prop-location mb-3">${prop.location}</p>
      <a href="/property/${prop.id}" class="view-btn">View Spot</a>
    </div>
  </article>
</div>`;
}

// ── Build search result card ───────────────────────────────────────────────
function buildResultCard(prop) {
  const wishlisted = APP.wishlist.includes(prop.id);
  const fillFav    = wishlisted ? 1 : 0;
  return `
<div class="result-card" onclick="location.href='/property/${prop.id}'">
  <div class="result-card-img mb-3">
    <img src="${prop.image}" alt="${prop.title}" loading="lazy">
    <span class="prop-badge ${prop.badgeType}">${prop.badge}</span>
    <button class="fav-btn ${wishlisted ? 'active' : ''}"
            onclick="event.stopPropagation(); toggleWishlist(${prop.id}, this)"
            aria-label="Save">
      <span class="material-symbols-outlined" style="font-size:1.1rem;font-variation-settings:'FILL' ${fillFav}">favorite</span>
    </button>
  </div>
  <div class="d-flex justify-content-between align-items-start">
    <div>
      <h3 class="prop-title">${prop.title}</h3>
      <p class="prop-location">${prop.location}</p>
      <div class="d-flex gap-2 mt-2">
        ${(prop.amenities || []).slice(0,2).map(a =>
          `<span class="amenity-tag"><span class="material-symbols-outlined" style="font-size:12px">${a.icon}</span>${a.label.split(' ')[0]}</span>`
        ).join('')}
      </div>
    </div>
    <div class="text-end flex-shrink-0 ms-3">
      <div class="prop-rating d-flex align-items-center gap-1 mb-1">
        <span class="material-symbols-outlined star" style="font-size:15px;font-variation-settings:'FILL' 1">star</span>
        ${prop.rating > 0 ? prop.rating : 'New'}
      </div>
      <div class="font-headline fw-800" style="font-size:1.15rem;color:var(--clr-secondary)">
        $${prop.price} <span style="font-size:12px;color:var(--clr-muted);font-family:var(--font-body)">/night</span>
      </div>
    </div>
  </div>
</div>`;
}

// ── Avatar helper ──────────────────────────────────────────────────────────
function avatarHtml(user, size = 32, border = '2px solid #fff') {
  if (user?.avatar) {
    return `<img src="${user.avatar}" alt="${user.name}" class="rounded-circle"
      style="width:${size}px;height:${size}px;object-fit:cover;border:${border};flex-shrink:0"
      title="${user.name}">`;
  }
  const initial  = (user?.name || '?')[0].toUpperCase();
  const fontSize = Math.round(size * 0.42);
  return `<div class="rounded-circle d-flex align-items-center justify-content-center fw-900"
    style="width:${size}px;height:${size}px;background:#fde047;border:${border};color:#000;
           font-family:var(--font-headline);font-size:${fontSize}px;flex-shrink:0"
    title="${user?.name || ''}">${initial}</div>`;
}

// ── Update navbar auth state ────────────────────────────────────────────────
function updateNavAuth() {
  const badge = document.getElementById('nav-user-badge');
  if (!badge) return;
  if (APP.user) badge.innerHTML = avatarHtml(APP.user, 32, '2px solid #fff');
  document.querySelectorAll('[data-auth-name]').forEach(el => {
    if (APP.user) el.textContent = APP.user.name;
  });
}

// ── Format currency ────────────────────────────────────────────────────────
function fmt(n) { return '$' + Number(n).toLocaleString(); }

// ── Run on load ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateNavAuth();
  document.querySelectorAll('[data-action="logout"]').forEach(el =>
    el.addEventListener('click', logout)
  );
});
