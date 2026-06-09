/* =====================================================================
   ADMIN · App principal
   Maneja auth, vistas (router), CRUD productos, pedidos y settings
   ===================================================================== */

(function () {
  // ----------------------------------------------------------------
  // Init Supabase
  // ----------------------------------------------------------------
  if (!window.SUPABASE_CONFIG || window.SUPABASE_CONFIG.url.includes('YOUR-PROJECT')) {
    document.body.innerHTML = `
      <div style="max-width:560px;margin:80px auto;padding:32px;background:#111120;border:1px solid rgba(255,77,109,.4);border-radius:14px;color:#f5f5fa;font-family:sans-serif;line-height:1.5">
        <h2 style="margin:0 0 12px;color:#ff4d6d">Falta configurar Supabase</h2>
        <p>Editá <code style="background:#0d0d18;padding:2px 6px;border-radius:4px">config.js</code> y pegá la URL y el anon key de tu proyecto de Supabase.</p>
        <p>Mirá las instrucciones en el archivo <strong>README.md</strong>.</p>
      </div>`;
    return;
  }
  const sb = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
  window.sb = sb;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------
  const fmtPrice = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
  const fmtDate = (d) => new Date(d).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function toast(msg, type = 'success') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast ' + type;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2800);
  }

  function showModal(id) {
    $(id).hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModals() {
    $$('.modal').forEach(m => m.hidden = true);
    document.body.style.overflow = '';
  }
  $$('[data-close]').forEach(el => el.addEventListener('click', closeModals));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });

  // ----------------------------------------------------------------
  // AUTH
  // ----------------------------------------------------------------
  async function init() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) showApp(session.user);
    else showLogin();

    sb.auth.onAuthStateChange((ev, sess) => {
      if (sess) showApp(sess.user);
      else showLogin();
    });
  }

  function showLogin() {
    $('#view-login').hidden = false;
    $('#view-app').hidden = true;
  }

  function showApp(user) {
    $('#view-login').hidden = true;
    $('#view-app').hidden = false;
    $('#current-user').textContent = user.email;
    // Link "IR A LA WEB" → URL de la tienda pública
    const gotoWeb = $('#go-to-web');
    if (gotoWeb && window.PUBLIC_WEB_URL) gotoWeb.href = window.PUBLIC_WEB_URL;
    initRouter();
    loadDashboard();
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#login-email').value.trim();
    const pass = $('#login-pass').value;
    $('#login-error').hidden = true;
    $('#login-btn').disabled = true;
    $('#login-btn').textContent = 'Ingresando...';
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    $('#login-btn').disabled = false;
    $('#login-btn').textContent = 'Ingresar';
    if (error) {
      $('#login-error').textContent = error.message === 'Invalid login credentials'
        ? 'Email o contraseña incorrectos.'
        : error.message;
      $('#login-error').hidden = false;
    }
  });

  $('#logout-btn').addEventListener('click', async () => {
    await sb.auth.signOut();
  });

  // ----------------------------------------------------------------
  // ROUTER (state-based view switching)
  // ----------------------------------------------------------------
  function initRouter() {
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const route = item.dataset.route;
        goTo(route);
      });
    });
    // Init route from hash or default
    const hash = (location.hash || '#dashboard').replace('#', '');
    goTo(hash);
  }

  const ROUTES = {
    dashboard: { title: 'Dashboard', load: loadDashboard },
    products:  { title: 'Productos', load: loadProducts },
    orders:    { title: 'Pedidos',   load: loadOrders },
    settings:  { title: 'Configuración', load: loadSettings },
  };

  function goTo(route) {
    if (!ROUTES[route]) route = 'dashboard';
    location.hash = '#' + route;
    $$('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.route === route));
    $$('.page').forEach(p => p.hidden = true);
    $('#page-' + route).hidden = false;
    $('#page-title').textContent = ROUTES[route].title;
    ROUTES[route].load();
  }

  // ----------------------------------------------------------------
  // DASHBOARD
  // ----------------------------------------------------------------
  async function loadDashboard() {
    const { data: stats, error } = await sb.from('admin_stats').select('*').single();
    if (error) {
      console.error(error);
      return;
    }
    $('#stat-products').textContent = stats.total_products ?? 0;
    $('#stat-no-stock').textContent = stats.out_of_stock ?? 0;
    $('#stat-pending').textContent  = stats.pending_orders ?? 0;
    $('#stat-week').textContent     = stats.orders_week ?? 0;
    $('#stat-revenue').textContent  = fmtPrice(stats.revenue_30d);

    // Badge pedidos pendientes en sidebar
    const pendBadge = $('#pending-badge');
    if (stats.pending_orders > 0) {
      pendBadge.textContent = stats.pending_orders;
      pendBadge.hidden = false;
    } else {
      pendBadge.hidden = true;
    }

    // Pedidos recientes (5)
    const { data: orders } = await sb
      .from('orders')
      .select('id, order_number, customer_name, total, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    const wrap = $('#recent-orders-list');
    wrap.innerHTML = '';
    (orders || []).forEach(o => {
      const row = document.createElement('div');
      row.className = 'order-row';
      row.innerHTML = `
        <div>
          <div class="order-num">${escapeHtml(o.order_number)}</div>
          <div class="order-meta">${escapeHtml(o.customer_name || 'Sin nombre')} · ${fmtDate(o.created_at)}</div>
        </div>
        <span class="status-pill ${escapeHtml(o.status)}">${escapeHtml(o.status)}</span>
        <strong>${fmtPrice(o.total)}</strong>
      `;
      row.addEventListener('click', () => openOrderDetail(o.id));
      wrap.appendChild(row);
    });
    if ((orders || []).length === 0) {
      wrap.innerHTML = '<p style="color:var(--muted);padding:14px;text-align:center;background:var(--panel);border-radius:8px">Todavía no hay pedidos.</p>';
    }
  }

  // ----------------------------------------------------------------
  // PRODUCTS
  // ----------------------------------------------------------------
  let PRODUCTS_PAGE = 0;
  const PRODUCTS_PAGE_SIZE = 30;
  let PRODUCTS_SEARCH = '';
  let PRODUCTS_CAT_FILTER = '';
  let CATEGORIES_LIST = [];

  async function loadProducts() {
    if (CATEGORIES_LIST.length === 0) await loadCategories();
    renderCategoryFilter();
    renderCategoryDatalist();
    await renderProductsPage();
  }

  async function loadCategories() {
    const { data } = await sb
      .from('products')
      .select('category')
      .order('category');
    CATEGORIES_LIST = [...new Set((data || []).map(p => p.category).filter(Boolean))];
  }

  function renderCategoryFilter() {
    const sel = $('#products-filter-cat');
    if (sel.options.length > 1) return; // ya renderizado
    CATEGORIES_LIST.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    });
  }

  function renderCategoryDatalist() {
    const dl = $('#cat-list');
    dl.innerHTML = '';
    CATEGORIES_LIST.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      dl.appendChild(opt);
    });
  }

  async function renderProductsPage() {
    let q = sb.from('products').select('*', { count: 'exact' });
    if (PRODUCTS_SEARCH) {
      q = q.ilike('title', `%${PRODUCTS_SEARCH}%`);
    }
    if (PRODUCTS_CAT_FILTER) {
      q = q.eq('category', PRODUCTS_CAT_FILTER);
    }
    q = q.order('id', { ascending: false }).range(
      PRODUCTS_PAGE * PRODUCTS_PAGE_SIZE,
      (PRODUCTS_PAGE + 1) * PRODUCTS_PAGE_SIZE - 1
    );

    const { data, count, error } = await q;
    if (error) { toast('Error cargando productos: ' + error.message, 'error'); return; }

    const tbody = $('#products-tbody');
    tbody.innerHTML = '';
    (data || []).forEach(p => {
      const tr = document.createElement('tr');
      const img = (p.images && p.images[0]) || '';
      tr.innerHTML = `
        <td>${img ? `<img class="row-img" referrerpolicy="no-referrer" src="${escapeHtml(img)}" onerror="this.style.opacity=.2" />` : '<div class="row-img"></div>'}</td>
        <td><strong>${escapeHtml(p.title)}</strong></td>
        <td>${escapeHtml(p.category)}</td>
        <td><strong>${fmtPrice(p.price)}</strong></td>
        <td>${p.handle_stock ? p.stock : '∞'}</td>
        <td><div class="toggle ${p.active ? 'on' : ''}" data-toggle-active="${p.id}"></div></td>
        <td class="row-actions">
          <button class="icon-btn" data-edit="${p.id}" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn danger" data-delete="${p.id}" title="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Pagination
    const totalPages = Math.max(1, Math.ceil((count || 0) / PRODUCTS_PAGE_SIZE));
    const pag = $('#products-pagination');
    pag.innerHTML = `
      <button id="pp-prev" ${PRODUCTS_PAGE <= 0 ? 'disabled' : ''}>← Anterior</button>
      <span class="pages">${PRODUCTS_PAGE + 1} / ${totalPages} · ${count} productos</span>
      <button id="pp-next" ${PRODUCTS_PAGE >= totalPages - 1 ? 'disabled' : ''}>Siguiente →</button>
    `;
    $('#pp-prev').onclick = () => { PRODUCTS_PAGE--; renderProductsPage(); };
    $('#pp-next').onclick = () => { PRODUCTS_PAGE++; renderProductsPage(); };

    // Wire row buttons
    tbody.querySelectorAll('[data-edit]').forEach(b => {
      b.addEventListener('click', () => openProductModal(+b.dataset.edit));
    });
    tbody.querySelectorAll('[data-delete]').forEach(b => {
      b.addEventListener('click', () => deleteProduct(+b.dataset.delete));
    });
    tbody.querySelectorAll('[data-toggle-active]').forEach(t => {
      t.addEventListener('click', () => toggleActive(+t.dataset.toggleActive, t));
    });
  }

  let SEARCH_TIMER;
  $('#products-search').addEventListener('input', (e) => {
    clearTimeout(SEARCH_TIMER);
    SEARCH_TIMER = setTimeout(() => {
      PRODUCTS_SEARCH = e.target.value.trim();
      PRODUCTS_PAGE = 0;
      renderProductsPage();
    }, 240);
  });
  $('#products-filter-cat').addEventListener('change', (e) => {
    PRODUCTS_CAT_FILTER = e.target.value;
    PRODUCTS_PAGE = 0;
    renderProductsPage();
  });

  $('#btn-new-product').addEventListener('click', () => openProductModal(null));

  async function openProductModal(id) {
    const form = $('#product-form');
    form.reset();
    $('#product-modal-title').textContent = id ? 'Editar producto' : 'Nuevo producto';
    form.dataset.editId = id || '';
    if (id) {
      const { data } = await sb.from('products').select('*').eq('id', id).single();
      if (data) {
        form.title.value = data.title || '';
        form.category.value = data.category || '';
        form.brand.value = data.brand || '';
        form.price.value = data.price || 0;
        form.original_price.value = data.original_price || 0;
        form.stock.value = data.stock || 0;
        form.handle_stock.checked = data.handle_stock !== false;
        form.active.checked = data.active !== false;
        form.featured.checked = data.featured === true;
        form.description.value = data.description || '';
        form.images.value = (data.images || []).join(', ');
      }
    }
    showModal('#product-modal');
  }

  $('#product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const id = form.dataset.editId;
    const payload = {
      title: form.title.value.trim(),
      category: form.category.value.trim(),
      brand: form.brand.value.trim() || null,
      price: parseFloat(form.price.value) || 0,
      original_price: parseFloat(form.original_price.value) || 0,
      stock: parseInt(form.stock.value) || 0,
      handle_stock: form.handle_stock.checked,
      active: form.active.checked,
      featured: form.featured.checked,
      description: form.description.value.trim(),
      images: form.images.value.split(',').map(s => s.trim()).filter(Boolean),
    };

    const btn = $('#product-save-btn');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    let result;
    if (id) {
      result = await sb.from('products').update(payload).eq('id', id);
    } else {
      result = await sb.from('products').insert(payload);
    }
    btn.disabled = false;
    btn.textContent = 'Guardar';

    if (result.error) {
      toast('Error: ' + result.error.message, 'error');
      return;
    }
    toast(id ? 'Producto actualizado' : 'Producto creado');
    closeModals();
    // refresh categories if a new one was added
    if (!CATEGORIES_LIST.includes(payload.category)) {
      CATEGORIES_LIST.push(payload.category);
      renderCategoryDatalist();
    }
    renderProductsPage();
  });

  async function deleteProduct(id) {
    if (!confirm('¿Eliminar este producto definitivamente?')) return;
    const { error } = await sb.from('products').delete().eq('id', id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast('Producto eliminado');
    renderProductsPage();
  }

  async function toggleActive(id, el) {
    const newActive = !el.classList.contains('on');
    el.classList.toggle('on');
    const { error } = await sb.from('products').update({ active: newActive }).eq('id', id);
    if (error) { toast('Error: ' + error.message, 'error'); el.classList.toggle('on'); }
  }

  // ----------------------------------------------------------------
  // ORDERS
  // ----------------------------------------------------------------
  async function loadOrders() {
    await renderOrdersList();
  }

  $('#orders-filter-status').addEventListener('change', renderOrdersList);

  async function renderOrdersList() {
    const status = $('#orders-filter-status').value;
    let q = sb.from('orders').select('*').order('created_at', { ascending: false }).limit(100);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) { toast('Error cargando pedidos: ' + error.message, 'error'); return; }
    const tbody = $('#orders-tbody');
    tbody.innerHTML = '';
    (data || []).forEach(o => {
      const itemsCount = (o.items || []).reduce((s, i) => s + (i.qty || 1), 0);
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.innerHTML = `
        <td><strong>${escapeHtml(o.order_number)}</strong></td>
        <td>${escapeHtml(o.customer_name || '—')}<br><span class="muted-sm">${escapeHtml(o.customer_phone || '')}</span></td>
        <td>${itemsCount} ítem${itemsCount === 1 ? '' : 's'}</td>
        <td><strong>${fmtPrice(o.total)}</strong></td>
        <td><span class="status-pill ${escapeHtml(o.status)}">${escapeHtml(o.status)}</span></td>
        <td><span class="muted-sm">${fmtDate(o.created_at)}</span></td>
        <td><button class="icon-btn" data-view="${o.id}">→</button></td>
      `;
      tr.addEventListener('click', () => openOrderDetail(o.id));
      tbody.appendChild(tr);
    });
    if ((data || []).length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:30px">No hay pedidos.</td></tr>';
    }
  }

  async function openOrderDetail(id) {
    const { data: o, error } = await sb.from('orders').select('*').eq('id', id).single();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    const detail = $('#order-detail');
    const itemsHtml = (o.items || []).map(i => `
      <div class="order-item">
        ${i.image ? `<img referrerpolicy="no-referrer" src="${escapeHtml(i.image)}" onerror="this.style.opacity=.2" />` : '<div></div>'}
        <div>
          <strong>${escapeHtml(i.title)}</strong>
          <div class="muted-sm">${fmtPrice(i.price)} × ${i.qty}</div>
        </div>
        <strong>${fmtPrice(i.price * i.qty)}</strong>
      </div>
    `).join('');

    detail.className = 'order-detail';
    detail.innerHTML = `
      <h2>Pedido ${escapeHtml(o.order_number)}</h2>
      <div class="order-info">
        <div><strong>Cliente</strong>${escapeHtml(o.customer_name || '—')}</div>
        <div><strong>Teléfono</strong>${escapeHtml(o.customer_phone || '—')}</div>
        <div><strong>Email</strong>${escapeHtml(o.customer_email || '—')}</div>
        <div><strong>Fecha</strong>${fmtDate(o.created_at)}</div>
        <div><strong>Estado</strong><span class="status-pill ${escapeHtml(o.status)}">${escapeHtml(o.status)}</span></div>
        <div><strong>Pago</strong>${escapeHtml(o.payment_method || '—')}</div>
        <div><strong>Envío</strong>${escapeHtml(o.shipping_method || '—')}</div>
        ${o.shipping_address ? `<div style="grid-column:1/-1"><strong>Dirección</strong>${escapeHtml(o.shipping_address)}</div>` : ''}
        ${o.notes ? `<div style="grid-column:1/-1"><strong>Notas</strong>${escapeHtml(o.notes)}</div>` : ''}
      </div>
      <h3>Items</h3>
      <div class="order-items">${itemsHtml || '<p class="muted">Sin items.</p>'}</div>
      <div class="order-total">
        <span>Total:</span>
        <strong>${fmtPrice(o.total)}</strong>
      </div>
      <div class="order-status-actions">
        <button class="btn-secondary" data-status="pendiente">Pendiente</button>
        <button class="btn-secondary" data-status="en_proceso">En proceso</button>
        <button class="btn-secondary" data-status="enviado">Enviado</button>
        <button class="btn-secondary" data-status="entregado">Entregado</button>
        <button class="btn-secondary" data-status="cancelado" style="border-color:var(--danger);color:var(--danger)">Cancelar</button>
      </div>
    `;
    detail.querySelectorAll('[data-status]').forEach(b => {
      b.addEventListener('click', async () => {
        const { error } = await sb.from('orders').update({ status: b.dataset.status }).eq('id', id);
        if (error) { toast('Error: ' + error.message, 'error'); return; }
        toast(`Estado actualizado a "${b.dataset.status}"`);
        closeModals();
        renderOrdersList();
        loadDashboard();
      });
    });
    showModal('#order-modal');
  }

  // ----------------------------------------------------------------
  // SETTINGS
  // ----------------------------------------------------------------
  async function loadSettings() {
    const { data, error } = await sb.from('settings').select('*');
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    (data || []).forEach(s => {
      const input = document.querySelector(`[data-setting="${s.key}"]`);
      if (input) input.value = typeof s.value === 'string' ? s.value : (s.value || '');
    });
  }

  $('#save-settings').addEventListener('click', async () => {
    $('#save-settings').disabled = true;
    const inputs = document.querySelectorAll('[data-setting]');
    const updates = [];
    inputs.forEach(i => {
      updates.push(
        sb.from('settings').upsert({ key: i.dataset.setting, value: i.value })
      );
    });
    const results = await Promise.all(updates);
    const errors = results.filter(r => r.error);
    $('#save-settings').disabled = false;
    if (errors.length) {
      toast('Error guardando: ' + errors[0].error.message, 'error');
    } else {
      toast('Configuración guardada');
    }
  });

  // ----------------------------------------------------------------
  // GO
  // ----------------------------------------------------------------
  init();
})();
