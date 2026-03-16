
(function () {
  'use strict';

  let ADMIN_KEY = '';
  const HORAS_DEFAULT = ['10:00','10:45','11:30','12:15','13:00','16:00','16:45','17:30','18:15','19:00','19:45'];

  let barberosData = [];
  function getBarberoName(id) {
    const b = barberosData.find(x => x.id === id);
    if (b) return `${b.nombre} ${b.apellido||''}`.trim();
    const leg = { andrea:'Andrea Escarcha', carlos:'Carlos', lucas:'Lucas' };
    return leg[id] || id;
  }

  // ── Toast ────────────────────────────────────────────────────────────────
  let toastTimer;
  function toast(msg, type = 'ok') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // ── API ──────────────────────────────────────────────────────────────────
  async function api(method, url, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
    };
    if (body) opts.body = JSON.stringify(body);
    let r;
    try {
      r = await fetch(url, opts);
    } catch {
      throw new Error('No se puede conectar al servidor. Asegúrate de que está arrancado con INICIAR_SERVIDOR.bat y accede desde http://localhost:3001/admin.html');
    }
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    return data;
  }

  // ── Login ────────────────────────────────────────────────────────────────
  async function tryLogin() {
    const pass = document.getElementById('adm-pass').value;
    const err  = document.getElementById('login-err');
    err.textContent = '';
    try {
      const data = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass }),
      }).then(r => r.json());
      if (data.ok) {
        ADMIN_KEY = pass;
        sessionStorage.setItem('esc_admin_key', pass);
        showAdmin();
      } else {
        err.textContent = data.error || 'Contraseña incorrecta';
      }
    } catch {
      err.textContent = 'Error de conexión';
    }
  }

  document.getElementById('adm-login-btn').addEventListener('click', tryLogin);
  document.getElementById('adm-pass').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });

  document.getElementById('adm-logout').addEventListener('click', () => {
    ADMIN_KEY = '';
    sessionStorage.removeItem('esc_admin_key');
    document.getElementById('admin-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('adm-pass').value = '';
  });

  function showAdmin() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-screen').style.display = 'block';
    loadBarberos();
    loadReservas();
  }

  const stored = sessionStorage.getItem('esc_admin_key');
  if (stored) { ADMIN_KEY = stored; showAdmin(); }

  // ── Tabs ─────────────────────────────────────────────────────────────────
  document.querySelectorAll('.adm-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.adm-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.adm-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'disponibilidad') renderWeek();
      if (tab.dataset.tab === 'barberos') loadBarberos();
      if (tab.dataset.tab === 'facturacion') cargarFacturacion();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: RESERVAS
  // ─────────────────────────────────────────────────────────────────────────
  let allReservas = [];
  let _activeFiltroHoy = false;

  async function loadReservas() {
    try {
      const data = await api('GET', '/api/reservas');
      allReservas = Array.isArray(data) ? data : [];
      renderReservas();
      updateStats();
    } catch (err) {
      toast(err.message || 'Error al cargar reservas', 'err');
    }
  }

  function updateStats() {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('stat-hoy').textContent        = allReservas.filter(r => r.fecha === today).length;
    document.getElementById('stat-pendientes').textContent  = allReservas.filter(r => r.estado === 'pendiente').length;
    document.getElementById('stat-confirmadas').textContent = allReservas.filter(r => r.estado === 'confirmada').length;
    document.getElementById('stat-canceladas').textContent  = allReservas.filter(r => r.estado === 'cancelada').length;
    document.getElementById('stat-total').textContent       = allReservas.length;
  }

  // Stats clicables como filtros
  document.querySelectorAll('.stat-filter').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      const estado = card.dataset.filterEstado;
      const esHoy = card.dataset.filterHoy === '1';
      document.getElementById('flt-estado').value = estado || '';
      if (esHoy) {
        document.getElementById('flt-fecha').value = new Date().toISOString().slice(0, 10);
      } else {
        document.getElementById('flt-fecha').value = '';
      }
      renderReservas();
    });
  });

  function applyFilters() {
    const barbero = document.getElementById('flt-barbero').value;
    const estado  = document.getElementById('flt-estado').value;
    const fecha   = document.getElementById('flt-fecha').value;
    return allReservas.filter(r => {
      if (barbero && r.barbero !== barbero) return false;
      if (estado  && r.estado  !== estado)  return false;
      if (fecha   && r.fecha   !== fecha)   return false;
      return true;
    });
  }

  function renderNotifBadge(enviado, label) {
    if (enviado) return `<span style="color:#4caf50;font-size:0.75rem;font-weight:600;">Sí</span>`;
    return `<span style="color:var(--color-danger,#e05252);font-size:0.75rem;">No</span>`;
  }

  function renderReservas() {
    const list = applyFilters();
    const tbody = document.getElementById('res-tbody');
    const empty = document.getElementById('res-empty');
    tbody.innerHTML = '';
    if (!list.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    list.sort((a, b) => (a.fecha + a.hora) > (b.fecha + b.hora) ? -1 : 1);

    list.forEach(r => {
      const emailEnviado = r.email_confirmacion_enviado === true;
      const waEnviado    = r.notificado_24h === true;
      const fidEnviada   = r.fidelizacion_enviada === true;

      // Botones de reenvío solo si NO se ha enviado y tiene email/teléfono
      const btnEmail = !emailEnviado && r.email
        ? `<button class="adm-action" data-reenviar="${r.id}" data-tipo="email" title="Reenviar confirmación" style="font-size:0.64rem;padding:3px 8px;">↻ Email</button>` : '';
      const btnWA = !waEnviado && r.telefono
        ? `<button class="adm-action" data-reenviar="${r.id}" data-tipo="whatsapp" title="Reenviar WA" style="font-size:0.64rem;padding:3px 8px;">↻ WA</button>` : '';
      const btnFid = !fidEnviada && r.email
        ? `<button class="adm-action" data-reenviar="${r.id}" data-tipo="fidelizacion" title="Enviar email satisfacción" style="font-size:0.64rem;padding:3px 8px;">↻ Reseña</button>` : '';

      const manualBadge = r.origenManual ? ' <span style="font-size:0.58rem;color:var(--color-gold);vertical-align:middle">[M]</span>' : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-small col-ref" style="font-family:monospace;letter-spacing:0.05em;color:var(--color-gold)">${r.id}</td>
        <td>${formatFecha(r.fecha)}</td>
        <td>${r.hora}</td>
        <td>${escHtml(r.servicio)}</td>
        <td style="color:var(--color-gold);font-weight:600;white-space:nowrap">${r.precio ? r.precio + ' €' : '—'}</td>
        <td>${getBarberoName(r.barbero)}</td>
        <td>
          <span style="cursor:pointer;text-decoration:underline dotted;color:var(--color-white)" data-ver-historial="${escHtml(r.nombre)}">${escHtml(r.nombre)}</span>${manualBadge}<br>
          <span class="td-small">${escHtml(r.email)}</span>
        </td>
        <td class="td-small col-tel">${escHtml(r.telefono)}</td>
        <td><span class="badge badge-${r.estado}">${r.estado}</span></td>
        <td class="td-small col-email-conf">${renderNotifBadge(emailEnviado)}<br>${btnEmail}</td>
        <td class="td-small col-wa">${renderNotifBadge(waEnviado)}<br>${btnWA}</td>
        <td class="td-small col-fidel">${renderNotifBadge(fidEnviada)}<br>${btnFid}</td>
        <td>
          ${r.estado === 'pendiente' ? `<button class="adm-action" data-action="confirmar" data-id="${r.id}">Confirmar</button>` : ''}
          ${r.estado !== 'cancelada' && r.estado !== 'no-show' ? `<button class="adm-action danger" data-action="cancelar" data-id="${r.id}">Cancelar</button>` : ''}
          ${r.estado !== 'no-show' && r.estado !== 'cancelada' ? `<button class="adm-action danger" data-action="noshow" data-id="${r.id}" style="font-size:0.64rem">No-Show</button>` : ''}
          ${r.estado !== 'pagada' ? `<button class="adm-action" data-action="pagada" data-id="${r.id}" style="font-size:0.64rem">Cobrada</button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('res-tbody').addEventListener('click', async e => {
    // Acciones de estado
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      const { action, id } = actionBtn.dataset;
      if (action === 'confirmar') {
        await api('PATCH', `/api/reservas/${id}`, { estado: 'confirmada' });
        toast('Reserva confirmada');
      } else if (action === 'cancelar') {
        if (!confirm('¿Cancelar esta reserva?')) return;
        await api('PATCH', `/api/reservas/${id}`, { estado: 'cancelada' });
        toast('Reserva cancelada', 'err');
      } else if (action === 'noshow') {
        if (!confirm('¿Marcar como No-Show?')) return;
        await api('PATCH', `/api/reservas/${id}`, { estado: 'no-show' });
        toast('Marcada como No-Show', 'err');
      } else if (action === 'pagada') {
        await api('PATCH', `/api/reservas/${id}`, { estado: 'pagada' });
        toast('Marcada como Cobrada ✓');
      }
      await loadReservas();
      return;
    }

    // Reenvío de notificaciones
    const reenviarBtn = e.target.closest('[data-reenviar]');
    if (reenviarBtn) {
      const { reenviar: id, tipo } = reenviarBtn.dataset;
      try {
        await api('POST', `/api/admin/reenviar/${id}/${tipo}`);
        toast(`Reenvío de ${tipo} completado ✓`);
        await loadReservas();
      } catch (err) { toast(err.message, 'err'); }
      return;
    }

    // Ver historial de cliente
    const histBtn = e.target.closest('[data-ver-historial]');
    if (histBtn) {
      abrirHistorial(histBtn.dataset.verHistorial);
    }
  });

  ['flt-barbero','flt-estado','flt-fecha'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderReservas);
  });
  document.getElementById('flt-clear').addEventListener('click', () => {
    document.getElementById('flt-barbero').value = '';
    document.getElementById('flt-estado').value  = '';
    document.getElementById('flt-fecha').value   = '';
    renderReservas();
  });
  document.getElementById('flt-refresh').addEventListener('click', loadReservas);

  // ── Nueva Reserva Manual ─────────────────────────────────────────────────
  document.getElementById('res-nueva-btn').addEventListener('click', () => {
    // Prerellenar con la fecha de hoy
    document.getElementById('rm-fecha').value = new Date().toISOString().slice(0, 10);
    document.getElementById('rm-err').textContent = '';
    document.getElementById('rm-nombre').value = '';
    document.getElementById('rm-email').value = '';
    document.getElementById('rm-telefono').value = '';
    document.getElementById('rm-servicio').value = '';
    document.getElementById('rm-precio').value = '';
    document.getElementById('rm-notas').value = '';
    // Poblar select de barberos
    const sel = document.getElementById('rm-barbero');
    sel.innerHTML = '';
    barberosData.filter(b => b.activo !== false).forEach(b => {
      const o = document.createElement('option');
      o.value = b.id;
      o.textContent = `${b.nombre} ${b.apellido||''}`.trim();
      sel.appendChild(o);
    });
    document.getElementById('res-modal').classList.remove('hidden');
  });

  document.getElementById('rm-cancel').addEventListener('click', () => {
    document.getElementById('res-modal').classList.add('hidden');
  });
  document.getElementById('res-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('res-modal'))
      document.getElementById('res-modal').classList.add('hidden');
  });

  document.getElementById('rm-save').addEventListener('click', async () => {
    const errEl = document.getElementById('rm-err');
    errEl.textContent = '';
    const payload = {
      barbero:   document.getElementById('rm-barbero').value,
      fecha:     document.getElementById('rm-fecha').value,
      hora:      document.getElementById('rm-hora').value,
      servicio:  document.getElementById('rm-servicio').value.trim(),
      precio:    parseFloat(document.getElementById('rm-precio').value) || null,
      nombre:    document.getElementById('rm-nombre').value.trim(),
      telefono:  document.getElementById('rm-telefono').value.trim(),
      email:     document.getElementById('rm-email').value.trim(),
      notas:     document.getElementById('rm-notas').value.trim(),
    };
    if (!payload.servicio) { errEl.textContent = 'El servicio es obligatorio.'; return; }
    if (!payload.nombre)   { errEl.textContent = 'El nombre del cliente es obligatorio.'; return; }
    try {
      await api('POST', '/api/admin/reservas', payload);
      toast('Cita creada correctamente ✓');
      document.getElementById('res-modal').classList.add('hidden');
      await loadReservas();
    } catch (err) { errEl.textContent = err.message || 'Error al crear la cita.'; }
  });

  // ── Historial de Cliente ─────────────────────────────────────────────────
  function abrirHistorial(nombre) {
    const visitas = allReservas
      .filter(r => r.nombre === nombre)
      .sort((a, b) => b.fecha + b.hora > a.fecha + a.hora ? 1 : -1);

    const totalGastado = visitas.reduce((s, r) => s + (parseFloat(r.precio) || 0), 0);

    let html = `<p style="color:var(--color-gold);font-size:0.8rem;margin-bottom:12px">${visitas.length} visita(s) · Total gastado: ${totalGastado.toFixed(2)} €</p>`;
    if (!visitas.length) { html = '<p style="color:var(--color-gray)">Sin visitas registradas.</p>'; }
    else {
      html += '<div class="adm-table-wrap"><table class="adm-table" style="font-size:0.82rem"><thead><tr><th>Fecha</th><th>Hora</th><th>Servicio</th><th>Precio</th><th>Barbero</th><th>Estado</th></tr></thead><tbody>';
      visitas.forEach(r => {
        html += `<tr>
          <td>${formatFecha(r.fecha)}</td><td>${r.hora}</td>
          <td>${escHtml(r.servicio)}</td>
          <td style="color:var(--color-gold);font-weight:600">${r.precio ? r.precio + ' €' : '—'}</td>
          <td>${getBarberoName(r.barbero)}</td>
          <td><span class="badge badge-${r.estado}">${r.estado}</span></td>
        </tr>`;
      });
      html += '</tbody></table></div>';
    }
    document.getElementById('hist-titulo').textContent = `Historial — ${nombre}`;
    document.getElementById('hist-content').innerHTML = html;
    document.getElementById('hist-modal').classList.remove('hidden');
  }

  document.getElementById('hist-close').addEventListener('click', () => {
    document.getElementById('hist-modal').classList.add('hidden');
  });
  document.getElementById('hist-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('hist-modal'))
      document.getElementById('hist-modal').classList.add('hidden');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: FACTURACIÓN
  // ─────────────────────────────────────────────────────────────────────────
  let _lastFacData = null;

  async function cargarFacturacion() {
    const desde   = document.getElementById('fac-desde').value;
    const hasta   = document.getElementById('fac-hasta').value;
    const barbero = document.getElementById('fac-barbero').value;
    let url = '/api/admin/facturacion';
    const params = [];
    if (desde)   params.push(`desde=${desde}`);
    if (hasta)   params.push(`hasta=${hasta}`);
    if (barbero) params.push(`barbero=${barbero}`);
    if (params.length) url += '?' + params.join('&');
    try {
      _lastFacData = await api('GET', url);
      renderFacturacion(_lastFacData);
    } catch (err) { toast(err.message, 'err'); }
  }

  function renderFacturacion(d) {
    document.getElementById('fac-total-ingresos').textContent = d.totalIngresos.toFixed(2) + ' €';
    document.getElementById('fac-total-reservas').textContent = d.totalReservas;
    const ticket = d.totalReservas > 0 ? (d.totalIngresos / d.totalReservas).toFixed(2) : '0.00';
    document.getElementById('fac-ticket-medio').textContent   = ticket + ' €';

    // Top Servicios (barras)
    const maxSrv = d.topServicios.length > 0 ? d.topServicios[0].total : 1;
    document.getElementById('fac-servicios').innerHTML = d.topServicios.length
      ? d.topServicios.map(s => `
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px">
            <span>${escHtml(s.servicio)}</span>
            <span style="color:var(--color-gold);font-weight:600">${s.total.toFixed(2)} € (${s.count} citas)</span>
          </div>
          <div style="background:var(--color-bg-card);height:6px;border-radius:3px;overflow:hidden">
            <div style="background:var(--color-gold);height:100%;width:${Math.round((s.total/maxSrv)*100)}%;transition:width 0.5s"></div>
          </div>
        </div>`).join('')
      : '<p style="color:var(--color-gray);font-size:0.85rem">Sin datos en el periodo seleccionado.</p>';

    // Por Barbero
    const maxBarb = d.porBarbero.length > 0 ? d.porBarbero[0].total : 1;
    document.getElementById('fac-barberos').innerHTML = d.porBarbero.length
      ? d.porBarbero.map(b => `
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px">
            <span>${getBarberoName(b.barbero)}</span>
            <span style="color:var(--color-gold);font-weight:600">${b.total.toFixed(2)} € (${b.count} citas)</span>
          </div>
          <div style="background:var(--color-bg-card);height:6px;border-radius:3px;overflow:hidden">
            <div style="background:#7c6f3b;height:100%;width:${Math.round((b.total/maxBarb)*100)}%;transition:width 0.5s"></div>
          </div>
        </div>`).join('')
      : '<p style="color:var(--color-gray);font-size:0.85rem">Sin datos.</p>';
  }

  document.getElementById('fac-buscar').addEventListener('click', cargarFacturacion);

  // Exportar CSV
  document.getElementById('fac-csv').addEventListener('click', () => {
    if (!_lastFacData || !_lastFacData.reservas.length) {
      toast('Carga primero el informe', 'err'); return;
    }
    const filas = [
      ['Ref', 'Fecha', 'Hora', 'Servicio', 'Precio (€)', 'Barbero', 'Cliente', 'Teléfono', 'Email', 'Estado'],
      ..._lastFacData.reservas.map(r => [
        r.id, r.fecha, r.hora, r.servicio, r.precio || '', getBarberoName(r.barbero),
        r.nombre, r.telefono, r.email, r.estado,
      ])
    ];
    const csv = filas.map(f => f.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `escarcha_facturacion_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: DISPONIBILIDAD
  // ─────────────────────────────────────────────────────────────────────────
  let viewOffset = 0;
  let isMobileView = window.innerWidth <= 768;
  window.addEventListener('resize', () => {
    const mobile = window.innerWidth <= 768;
    if (mobile !== isMobileView) {
      isMobileView = mobile;
      viewOffset = 0;
      if (document.getElementById('disp-barbero').value) renderWeek();
    }
  });

  let dispData   = [];
  let pendingSlots = [];
  let pendingDeletions = [];
  let isDragging = false;
  let dragTarget = null;

  function getStartDate(offset) {
    const now = new Date();
    now.setHours(0,0,0,0);
    if (isMobileView) {
      now.setDate(now.getDate() + offset);
      return now;
    } else {
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
      return monday;
    }
  }

  function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  async function loadDisp(barbero, fechaInicio, fechaFin) {
    const url = `/api/disponibilidad/all?barbero=${barbero}`;
    dispData = await api('GET', url);
    return dispData.filter(s => s.fecha >= fechaInicio && s.fecha <= fechaFin);
  }

  async function renderWeek() {
    const barbero = document.getElementById('disp-barbero').value;
    if (!barbero) {
      document.getElementById('week-grid').innerHTML = '<div style="padding: 20px; color: var(--color-gray); text-align: center; grid-column: 1/-1;">Selecciona un barbero para ver su disponibilidad</div>';
      return;
    }

    const startObj = getStartDate(viewOffset);
    const days    = [];
    const numDays = isMobileView ? 1 : 7;
    for (let i = 0; i < numDays; i++) {
      const d = new Date(startObj);
      d.setDate(startObj.getDate() + i);
      days.push(d);
    }
    const fechaInicio = isoDate(days[0]);
    const fechaFin    = isoDate(days[days.length - 1]);

    if (isMobileView) {
      document.getElementById('week-label').textContent =
        days[0].toLocaleDateString('es-ES', {weekday: 'long', day: 'numeric', month: 'short'});
      document.getElementById('week-grid').classList.add('mobile-grid');
    } else {
      document.getElementById('week-label').textContent =
        `${days[0].toLocaleDateString('es-ES',{day:'numeric',month:'short'})} – ${days[6].toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'})}`;
      document.getElementById('week-grid').classList.remove('mobile-grid');
    }

    const slots = await loadDisp(barbero, fechaInicio, fechaFin);
    const slotMap = {};
    slots.forEach(s => { slotMap[s.fecha + '_' + s.hora] = s; });

    const grid = document.getElementById('week-grid');
    grid.innerHTML = '';
    const today = new Date(); today.setHours(0,0,0,0);

    const corner = document.createElement('div');
    grid.appendChild(corner);

    const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    days.forEach((d) => {
      const el = document.createElement('div');
      const esDomingo = d.getDay() === 0;
      el.className = 'wg-header'
        + (d.getTime() === today.getTime() ? ' today' : '')
        + (esDomingo ? ' domingo-col' : '');
      el.innerHTML = `<strong>${DIAS[d.getDay()]}</strong><br>${d.toLocaleDateString('es-ES',{day:'numeric',month:'short'})}${esDomingo ? '<br><span style="font-size:0.5rem">Cerrado</span>' : ''}`;
      grid.appendChild(el);
    });

    HORAS_DEFAULT.forEach(hora => {
      const timeEl = document.createElement('div');
      timeEl.className = 'wg-time';
      timeEl.textContent = hora;
      grid.appendChild(timeEl);

      days.forEach(d => {
        const fecha  = isoDate(d);
        const key    = fecha + '_' + hora;
        const slot   = slotMap[key];
        const cell   = document.createElement('div');
        const isPast = d < today;
        cell.className = 'wg-cell';
        if (d.getDay() === 0) {
          cell.classList.add('domingo');
          cell.title = 'Cerrado (domingo)';
        } else if (isPast) {
          cell.classList.add('pasado');
        } else if (slot) {
          cell.classList.add(slot.ocupado ? 'ocupado' : 'libre');
          if (slot.ocupado) {
            cell.title = slot.clienteNombre ? `Reservado: ${slot.clienteNombre}${slot.servicio ? ' — ' + slot.servicio : ''}` : 'Reservado';
            cell.innerHTML = `
              <span class="slot-cliente">${slot.clienteNombre || 'Reservado'}</span>
              ${slot.servicio ? `<span class="slot-servicio">${slot.servicio}</span>` : ''}
            `;
          } else {
            cell.addEventListener('click', () => {
              if (pendingSlots.length === 0 && pendingDeletions.length === 0) {
                deleteSlot(slot.id);
              }
            });
            const startDeleteDrag = () => {
              isDragging = true;
              dragTarget = { action: 'delete', id: slot.id };
              cell.classList.add('drag-select');
              pendingDeletions.push(slot.id);
            };
            cell.addEventListener('mousedown', (e) => { startDeleteDrag(); e.preventDefault(); });
            cell.addEventListener('touchstart', (e) => { startDeleteDrag(); e.preventDefault(); }, {passive: false});
          }
        } else {
          cell.addEventListener('click', () => {
            if (pendingSlots.length === 0 && pendingDeletions.length === 0) {
              addSlot(barbero, fecha, hora);
            }
          });
          const startAddDrag = () => {
            isDragging = true;
            dragTarget = { action: 'add', barbero, fecha, hora };
            cell.classList.add('drag-select');
            pendingSlots.push(dragTarget);
          };
          cell.addEventListener('mousedown', (e) => { startAddDrag(); e.preventDefault(); });
          cell.addEventListener('touchstart', (e) => { startAddDrag(); e.preventDefault(); }, {passive: false});
        }

        cell.addEventListener('mouseenter', () => {
          if (isDragging && dragTarget) {
            handleDragOver(cell, slot, barbero, fecha, hora);
          }
        });

        cell._slotData = { slot, fecha, hora, barbero };
        grid.appendChild(cell);
      });
    });
  }

  async function addSlot(barbero, fecha, hora) {
    await api('POST', '/api/disponibilidad', { barbero, fecha, hora });
    toast(`Slot añadido: ${fecha} ${hora}`);
    renderWeek();
  }

  async function deleteSlot(id) {
    await api('DELETE', `/api/disponibilidad/${id}`);
    toast('Slot eliminado', 'err');
    renderWeek();
  }

  document.getElementById('disp-add-week').addEventListener('click', async () => {
    const barbero = document.getElementById('disp-barbero').value;
    const currentRef = getStartDate(viewOffset);
    const day = currentRef.getDay();
    const monday = new Date(currentRef);
    monday.setDate(currentRef.getDate() - (day === 0 ? 6 : day - 1));

    const slots = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const fecha = isoDate(d);
      const today = new Date(); today.setHours(0,0,0,0);
      if (d < today || d.getDay() === 0) continue;
      HORAS_DEFAULT.forEach(hora => slots.push({ barbero, fecha, hora }));
    }
    if (!slots.length) { toast('Todos los días ya son pasados', 'err'); return; }
    await api('POST', '/api/disponibilidad', slots);
    toast(`${slots.length} slots añadidos`);
    renderWeek();
  });

  document.getElementById('disp-refresh').addEventListener('click', renderWeek);
  document.getElementById('disp-barbero').addEventListener('change', renderWeek);
  document.getElementById('week-prev').addEventListener('click', () => { viewOffset--; renderWeek(); });
  document.getElementById('week-next').addEventListener('click', () => { viewOffset++; renderWeek(); });

  let hasDragged = false;

  document.addEventListener('mouseup', async () => {
    if (!isDragging) return;

    const slotsToAdd = [...pendingSlots];
    const slotsToDelete = [...pendingDeletions];

    isDragging = false;
    hasDragged = false;

    document.querySelectorAll('.drag-select').forEach(el => el.classList.remove('drag-select'));

    if (slotsToAdd.length === 0 && slotsToDelete.length === 0) {
      pendingSlots = [];
      pendingDeletions = [];
      return;
    }

    const uniqueAdd = [];
    const seenAdd = new Set();
    for (const s of slotsToAdd) {
      const key = `${s.barbero}_${s.fecha}_${s.hora}`;
      if (!seenAdd.has(key)) { seenAdd.add(key); uniqueAdd.push(s); }
    }

    const uniqueDelete = [...new Set(slotsToDelete)];

    if (uniqueAdd.length > 0) {
      await api('POST', '/api/disponibilidad', uniqueAdd);
      toast(`${uniqueAdd.length} slots añadidos`);
    }

    for (const id of uniqueDelete) {
      await api('DELETE', `/api/disponibilidad/${id}`);
    }
    if (uniqueDelete.length > 0) {
      toast(`${uniqueDelete.length} slots eliminados`, 'err');
    }

    pendingSlots = [];
    pendingDeletions = [];
    renderWeek();
  });

  document.addEventListener('mousemove', () => { if (isDragging) hasDragged = true; });

  document.addEventListener('touchmove', (e) => {
    if (!isDragging || !dragTarget) return;
    hasDragged = true;
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return;
    const cell = el.closest('.wg-cell');
    if (cell && cell._slotData) {
      handleDragOver(cell, cell._slotData.slot, cell._slotData.barbero, cell._slotData.fecha, cell._slotData.hora);
    }
  }, {passive: false});

  document.addEventListener('touchend', () => {
    if (isDragging) document.dispatchEvent(new Event('mouseup'));
  });

  function handleDragOver(cell, slot, barbero, fecha, hora) {
    if (cell.classList.contains('drag-select') || cell.classList.contains('domingo') || cell.classList.contains('pasado') || (slot && slot.ocupado)) return;
    cell.classList.add('drag-select');
    if (dragTarget.action === 'add' && !slot) {
      pendingSlots.push({ action: 'add', barbero, fecha, hora });
    } else if (dragTarget.action === 'delete' && slot && !slot.ocupado) {
      pendingDeletions.push(slot.id);
    }
  }

  document.getElementById('week-grid')?.addEventListener('mouseleave', () => {
    if (isDragging) {
      isDragging = false;
      document.querySelectorAll('.drag-select').forEach(el => el.classList.remove('drag-select'));
      pendingSlots = [];
      pendingDeletions = [];
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: BARBEROS
  // ─────────────────────────────────────────────────────────────────────────

  async function loadBarberos() {
    try {
      const data = await api('GET', '/api/barberos?all=1');
      barberosData = Array.isArray(data) ? data : [];
      renderBarberos();
      updateBarberoSelects();
    } catch (err) { toast(err.message || 'Error al cargar barberos', 'err'); }
  }

  function updateBarberoSelects() {
    const active = barberosData.filter(b => b.activo !== false);
    // Select filtro reservas
    const flt = document.getElementById('flt-barbero');
    if (flt) {
      const prev = flt.value;
      flt.innerHTML = '<option value="">Todos los barberos</option>';
      active.forEach(b => {
        const o = document.createElement('option');
        o.value = b.id; o.textContent = `${b.nombre} ${b.apellido||''}`.trim();
        flt.appendChild(o);
      });
      flt.value = prev;
    }
    // Select facturación
    const fac = document.getElementById('fac-barbero');
    if (fac) {
      const prev = fac.value;
      fac.innerHTML = '<option value="">Todos los barberos</option>';
      active.forEach(b => {
        const o = document.createElement('option');
        o.value = b.id; o.textContent = `${b.nombre} ${b.apellido||''}`.trim();
        fac.appendChild(o);
      });
      fac.value = prev;
    }
    // Select disponibilidad
    const disp = document.getElementById('disp-barbero');
    if (disp) {
      const prev = disp.value;
      disp.innerHTML = '';
      active.forEach(b => {
        const o = document.createElement('option');
        o.value = b.id; o.textContent = `${b.nombre} ${b.apellido||''}`.trim();
        disp.appendChild(o);
      });
      if (active.find(b => b.id === prev)) {
        disp.value = prev;
      } else if (active.length > 0) {
        disp.value = active[0].id;
      }
      if (document.getElementById('panel-disponibilidad').classList.contains('active')) {
        renderWeek();
      }
    }
  }

  function renderBarberos() {
    const grid = document.getElementById('barb-grid');
    if (!grid) return;
    if (!barberosData.length) {
      grid.innerHTML = '<p class="adm-empty">No hay barberos. Añade el primero.</p>';
      return;
    }
    const PLACEHOLDER = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>';
    grid.innerHTML = barberosData.map(b => {
      const fullName = `${escHtml(b.nombre)} ${escHtml(b.apellido||'')}`.trim();
      const fotoHTML = b.foto
        ? `<img src="${escHtml(b.foto)}" alt="${fullName}">`
        : `<div class="barb-avatar">${PLACEHOLDER}</div>`;
      const inactiveBadge = b.activo === false
        ? ' <span style="font-size:0.6rem;color:var(--color-danger);vertical-align:middle">(Inactivo)</span>' : '';
      return `
        <div class="barb-card${b.activo === false ? ' inactive' : ''}">
          <div class="barb-photo">${fotoHTML}</div>
          <div class="barb-info">
            <p class="barb-name">${fullName}${inactiveBadge}</p>
            <p class="barb-role">${escHtml(b.rol)}</p>
            ${b.descripcion ? `<p class="barb-desc">${escHtml(b.descripcion)}</p>` : ''}
            <div class="barb-actions">
              <button class="adm-action" data-barb-edit="${escHtml(b.id)}">Editar</button>
              ${b.activo !== false
                ? `<button class="adm-action danger" data-barb-delete="${escHtml(b.id)}">Desactivar</button>`
                : `<button class="adm-action" data-barb-activate="${escHtml(b.id)}">Activar</button>`}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  document.getElementById('barb-grid').addEventListener('click', async e => {
    const editBtn = e.target.closest('[data-barb-edit]');
    const delBtn  = e.target.closest('[data-barb-delete]');
    const actBtn  = e.target.closest('[data-barb-activate]');
    if (editBtn) { openModal(editBtn.dataset.barbEdit); return; }
    if (delBtn) {
      if (!confirm('¿Desactivar este barbero? Dejará de aparecer en la web.')) return;
      await api('DELETE', `/api/barberos/${delBtn.dataset.barbDelete}`);
      toast('Barbero desactivado'); loadBarberos(); return;
    }
    if (actBtn) {
      await api('PATCH', `/api/barberos/${actBtn.dataset.barbActivate}`, { activo: true });
      toast('Barbero activado'); loadBarberos();
    }
  });

  document.getElementById('barb-add-btn').addEventListener('click', () => openModal(null));

  // ── Modal Barbero ─────────────────────────────────────────────────────────
  let _modalFotoBase64 = null;
  let _modalFotoExt    = null;

  function openModal(id) {
    const b = id ? barberosData.find(x => x.id === id) : null;
    document.getElementById('modal-title').textContent   = b ? 'Editar Barbero' : 'Añadir Barbero';
    document.getElementById('modal-barb-id').value       = b ? b.id : '';
    document.getElementById('modal-nombre').value        = b ? b.nombre        : '';
    document.getElementById('modal-apellido').value      = b ? (b.apellido||'') : '';
    document.getElementById('modal-rol').value           = b ? b.rol            : '';
    document.getElementById('modal-desc').value          = b ? (b.descripcion||'') : '';
    document.getElementById('modal-err').textContent     = '';
    document.getElementById('modal-foto').value          = '';
    _modalFotoBase64 = null; _modalFotoExt = null;
    const preview = document.getElementById('modal-foto-preview');
    if (b && b.foto) { preview.src = b.foto; preview.classList.add('show'); }
    else             { preview.src = '';     preview.classList.remove('show'); }
    document.getElementById('barb-modal').classList.remove('hidden');
    document.getElementById('modal-nombre').focus();
  }

  document.getElementById('modal-cancel').addEventListener('click', () => {
    document.getElementById('barb-modal').classList.add('hidden');
  });
  document.getElementById('barb-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('barb-modal'))
      document.getElementById('barb-modal').classList.add('hidden');
  });

  document.getElementById('modal-foto').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      document.getElementById('modal-err').textContent = 'La imagen supera los 2 MB.';
      e.target.value = ''; return;
    }
    _modalFotoExt = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = ev => {
      _modalFotoBase64 = ev.target.result.split(',')[1];
      const preview = document.getElementById('modal-foto-preview');
      preview.src = ev.target.result;
      preview.classList.add('show');
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('modal-save').addEventListener('click', async () => {
    const id     = document.getElementById('modal-barb-id').value;
    const nombre = document.getElementById('modal-nombre').value.trim();
    const rol    = document.getElementById('modal-rol').value.trim();
    const errEl  = document.getElementById('modal-err');
    errEl.textContent = '';
    if (!nombre) { errEl.textContent = 'El nombre es obligatorio.'; return; }
    if (!rol)    { errEl.textContent = 'El rol es obligatorio.';    return; }

    const payload = {
      nombre, rol,
      apellido:    document.getElementById('modal-apellido').value.trim(),
      descripcion: document.getElementById('modal-desc').value.trim(),
    };
    if (_modalFotoBase64) { payload.fotoBase64 = _modalFotoBase64; payload.fotoExt = _modalFotoExt; }

    try {
      if (id) {
        await api('PATCH', `/api/barberos/${id}`, payload);
        toast('Barbero actualizado ✓');
      } else {
        await api('POST', '/api/barberos', payload);
        toast('Barbero añadido ✓');
      }
      document.getElementById('barb-modal').classList.add('hidden');
      loadBarberos();
    } catch (err) { errEl.textContent = err.message || 'Error al guardar. Inténtalo de nuevo.'; }
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  function formatFecha(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
