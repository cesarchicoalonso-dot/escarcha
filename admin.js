
(function () {
  'use strict';

  let ADMIN_KEY = '';
  const HORAS_DEFAULT = ['10:00','10:45','11:30','12:15','13:00','16:00','16:45','17:30','18:15','19:00','19:45'];

  // Barberos dinámicos — se puebla al cargar
  let barberosData = [];
  function getBarberoName(id) {
    const b = barberosData.find(x => x.id === id);
    if (b) return `${b.nombre} ${b.apellido||''}`.trim();
    // fallback ids legacy
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
    loadBarberos(); // primero barberos para que los selects estén poblados
    loadReservas();
  }

  // Revalidar sesión guardada
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
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: RESERVAS
  // ─────────────────────────────────────────────────────────────────────────
  let allReservas = [];

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
    document.getElementById('stat-hoy').textContent       = allReservas.filter(r => r.fecha === today).length;
    document.getElementById('stat-pendientes').textContent = allReservas.filter(r => r.estado === 'pendiente').length;
    document.getElementById('stat-confirmadas').textContent= allReservas.filter(r => r.estado === 'confirmada').length;
    document.getElementById('stat-total').textContent      = allReservas.length;
  }

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

  function renderReservas() {
    const list = applyFilters();
    const tbody = document.getElementById('res-tbody');
    const empty = document.getElementById('res-empty');
    tbody.innerHTML = '';
    if (!list.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    // Ordenar: más reciente primero (por fecha+hora)
    list.sort((a, b) => (a.fecha + a.hora) > (b.fecha + b.hora) ? -1 : 1);

    list.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-small" style="font-family:monospace;letter-spacing:0.05em;color:var(--color-gold)">${r.id}</td>
        <td>${formatFecha(r.fecha)}</td>
        <td>${r.hora}</td>
        <td>${r.servicio}</td>
        <td style="color:var(--color-gold);font-weight:600;white-space:nowrap">${r.precio ? r.precio + ' €' : '—'}</td>
        <td>${getBarberoName(r.barbero)}</td>
        <td>
          ${escHtml(r.nombre)}<br>
          <span class="td-small">${escHtml(r.email)}</span>
        </td>
        <td class="td-small">${escHtml(r.telefono)}</td>
        <td><span class="badge badge-${r.estado}">${r.estado}</span></td>
        <td>
          ${r.estado === 'pendiente' ? `<button class="adm-action" data-action="confirmar" data-id="${r.id}">Confirmar</button>` : ''}
          ${r.estado !== 'cancelada' ? `<button class="adm-action danger" data-action="cancelar" data-id="${r.id}">Cancelar</button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('res-tbody').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'confirmar') {
      await api('PATCH', `/api/reservas/${id}`, { estado: 'confirmada' });
      toast('Reserva confirmada');
    } else if (action === 'cancelar') {
      if (!confirm('¿Cancelar esta reserva?')) return;
      await api('PATCH', `/api/reservas/${id}`, { estado: 'cancelada' });
      toast('Reserva cancelada', 'err');
    }
    await loadReservas();
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

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: DISPONIBILIDAD
  // ─────────────────────────────────────────────────────────────────────────
  let viewOffset = 0; // desplazamiento (semanas o días) desde hoy
  let isMobileView = window.innerWidth <= 768;
  window.addEventListener('resize', () => {
    const mobile = window.innerWidth <= 768;
    if (mobile !== isMobileView) {
      isMobileView = mobile;
      viewOffset = 0; // reset al cambiar vista
      if (document.getElementById('disp-barbero').value) renderWeek();
    }
  });

  let dispData   = []; // todos los slots (libres + ocupados) del servidor
  let pendingSlots = [];     // slots pendientes por añadir (drag)
  let pendingDeletions = []; // slots pendientes por eliminar (drag)
  let isDragging = false;   // estado de arrastre
  let dragTarget = null;    // objetivo actual del arrastre

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
    // Cargar todos los slots de la semana
    const url = `/api/disponibilidad/all?barbero=${barbero}`;
    dispData = await api('GET', url);
    // Filtrar por rango de fechas
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

    // Cabecera vacía (esquina)
    const corner = document.createElement('div');
    grid.appendChild(corner);

    // Cabeceras de días dinámicas (1 o 7)
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

    // Filas de horas
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
        const isPast = d < today; // definido localmente en cada iteración
        cell.className = 'wg-cell';
        if (d.getDay() === 0) {
          // Domingo — día cerrado
          cell.classList.add('domingo');
          cell.title = 'Cerrado (domingo)';
        } else if (isPast) {
          cell.classList.add('pasado');
        } else if (slot) {
          cell.classList.add(slot.ocupado ? 'ocupado' : 'libre');
          if (slot.ocupado) {
            cell.title = slot.clienteNombre ? `Reservado: ${slot.clienteNombre}${slot.servicio ? ' — ' + slot.servicio : ''}` : 'Reservado';
            // Mostrar nombre del cliente y servicio debajo
            cell.innerHTML = `
              <span class="slot-cliente">${slot.clienteNombre || 'Reservado'}</span>
              ${slot.servicio ? `<span class="slot-servicio">${slot.servicio}</span>` : ''}
            `;
          } else {
            // Slot libre - no mostrar nada
            // Click para eliminar (solo si no hubo arrastre)
            cell.addEventListener('click', () => {
              if (pendingSlots.length === 0 && pendingDeletions.length === 0) {
                deleteSlot(slot.id);
              }
            });
            // Iniciar arrastre para eliminar (ratón y táctil)
            const startDeleteDrag = (e) => {
              isDragging = true;
              dragTarget = { action: 'delete', id: slot.id };
              cell.classList.add('drag-select');
              pendingDeletions.push(slot.id); // Registrar de inmediato el origen
            };
            cell.addEventListener('mousedown', (e) => { startDeleteDrag(); e.preventDefault(); });
            cell.addEventListener('touchstart', (e) => { startDeleteDrag(); e.preventDefault(); }, {passive: false});
          }
        } else {
          // Sin slot - vacío
          // Click para añadir (solo si no hubo arrastre)
          cell.addEventListener('click', () => {
            if (pendingSlots.length === 0 && pendingDeletions.length === 0) {
              addSlot(barbero, fecha, hora);
            }
          });
          // Iniciar arrastre para añadir (ratón y táctil)
          const startAddDrag = (e) => {
            isDragging = true;
            dragTarget = { action: 'add', barbero, fecha, hora };
            cell.classList.add('drag-select');
            pendingSlots.push(dragTarget); // Registrar de inmediato el origen
          };
          cell.addEventListener('mousedown', (e) => { startAddDrag(); e.preventDefault(); });
          cell.addEventListener('touchstart', (e) => { startAddDrag(); e.preventDefault(); }, {passive: false});
        }

        // Eventos de arrastre encima de otras celdas (mouse)
        cell.addEventListener('mouseenter', () => {
          if (isDragging && dragTarget) {
            handleDragOver(cell, slot, barbero, fecha, hora);
          }
        });

        // Guardar referencia para usar fuera
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

  // Añadir semana completa
  document.getElementById('disp-add-week').addEventListener('click', async () => {
    const barbero = document.getElementById('disp-barbero').value;
    const currentRef = getStartDate(viewOffset); // la fecha actualmente mostrada (Lunes o el día específico)
    const day = currentRef.getDay();
    const monday = new Date(currentRef);
    monday.setDate(currentRef.getDate() - (day === 0 ? 6 : day - 1)); // Siempre el lunes de esta semana

    const slots   = [];
    for (let i = 0; i < 6; i++) { // Lun-Sáb
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const fecha = isoDate(d);
      const today = new Date(); today.setHours(0,0,0,0);
      if (d < today || d.getDay() === 0) continue; // Saltar pasados o domingos
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

  // Eventos de arrastre para selección múltiple
  let hasDragged = false; // Track if we actually dragged

  document.addEventListener('mouseup', async () => {
    if (!isDragging) return;

    const slotsToAdd = [...pendingSlots];
    const slotsToDelete = [...pendingDeletions];

    isDragging = false;
    hasDragged = false;

    // Limpiar clases visuales
    document.querySelectorAll('.drag-select').forEach(el => el.classList.remove('drag-select'));

    // Si no huboarrastre real, salir
    if (slotsToAdd.length === 0 && slotsToDelete.length === 0) {
      pendingSlots = [];
      pendingDeletions = [];
      return;
    }

    // Deduplicar slots a añadir
    const uniqueAdd = [];
    const seenAdd = new Set();
    for (const s of slotsToAdd) {
      const key = `${s.barbero}_${s.fecha}_${s.hora}`;
      if (!seenAdd.has(key)) {
        seenAdd.add(key);
        uniqueAdd.push(s);
      }
    }

    // Deduplicar slots a eliminar
    const uniqueDelete = [...new Set(slotsToDelete)];

    // Procesar
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

  // Trackear si se movió el mouse o el dedo mientras estaba presionado
  document.addEventListener('mousemove', (e) => {
    if (isDragging) hasDragged = true;
  });

  // TÁCTIL: Replicar el mouseenter mediante elementFromPoint
  document.addEventListener('touchmove', (e) => {
    if (!isDragging || !dragTarget) return;
    hasDragged = true;
    e.preventDefault(); // Evitar scroll de la página al arrastrar
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return;
    const cell = el.closest('.wg-cell');
    if (cell && cell._slotData) {
      handleDragOver(cell, cell._slotData.slot, cell._slotData.barbero, cell._slotData.fecha, cell._slotData.hora);
    }
  }, {passive: false});

  // TÁCTIL: Replicar el mouseup al soltar
  document.addEventListener('touchend', (e) => {
    if (isDragging) {
      // Forzar un mouseup event sintético o llamar directo a la lógica
      document.dispatchEvent(new Event('mouseup'));
    }
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

  // Cancelar arrastre si se sale del grid
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
        disp.value = active[0].id; // Forzar selección del primero si no había previo
      }
      
      // Forzar re-render de la semana si estamos en esa pestaña
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

  // ── Modal ─────────────────────────────────────────────────────────────────
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

