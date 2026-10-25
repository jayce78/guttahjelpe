// Gutta Hjelper Pilot - admin finance extension.
// Load after app.js and worker-names-patch.js.
(() => {
  const money = value => new Intl.NumberFormat('nb-NO', {
    style: 'currency', currency: 'NOK', maximumFractionDigits: 2
  }).format(Number(value) || 0);
  const isoToday = () => new Date().toISOString().slice(0, 10);
  const firstOfMonth = () => `${isoToday().slice(0, 7)}-01`;
  const userName = id => {
    const user = users.find(x => x.user_id === id);
    return user?.display_name || user?.email || 'Ukjent bruker';
  };

  function addUi() {
    if (document.querySelector('#workerPayments')) return;
    const homeActions = document.querySelector('#home .actions');
    if (homeActions) {
      homeActions.insertAdjacentHTML('beforeend', `
        <button class="action admin-only" type="button" onclick="ghOpenWorkerPayments()">
          <i>👷</i>Arbeiderbetaling
        </button>
        <button class="action admin-only" type="button" onclick="ghOpenPaymentConfirmation()">
          <i>🧾</i>Betalingsbekreftelse
        </button>`);
    }
    document.querySelector('main').insertAdjacentHTML('beforeend', `
      <section id="workerPayments" class="view">
        <div class="section"><h2>Arbeiderbetaling</h2></div>
        <div class="notice">Betalingsgrunnlag basert på registrerte timer. Dette er ikke lønnskjøring.</div>
        <form id="workerSummaryForm">
          <div class="grid">
            <div class="field"><label>Fra dato</label><input id="workerFrom" type="date" required></div>
            <div class="field"><label>Til dato</label><input id="workerTo" type="date" required></div>
          </div>
          <div class="form-actions"><button class="btn" type="submit">Oppdater oversikt</button></div>
        </form>
        <div id="workerSummary" class="list" style="margin-top:14px"></div>
      </section>

      <section id="paymentConfirmation" class="view">
        <div class="section"><h2>Betalingsbekreftelse</h2></div>
        <div class="notice">Opprett etter at kunden har betalt. Dokumentet er en betalingsbekreftelse, ikke en offisiell faktura.</div>
        <form id="confirmationForm">
          <div class="grid">
            <div class="field full"><label>Jobb</label><select id="confirmationJob" required></select></div>
            <div class="field"><label>Betalingsdato</label><input id="confirmationDate" type="date" required></div>
            <div class="field"><label>Betalingsmåte</label><select id="confirmationMethod"><option>Vipps</option><option>Bankoverføring</option><option>Kontant</option><option>Annet</option></select></div>
            <div class="field"><label>Arbeid / avtalt pris</label><input id="chargeWork" type="number" min="0" step="0.01" value="0"></div>
            <div class="field"><label>Transport / bortkjøring</label><input id="chargeTransport" type="number" min="0" step="0.01" value="0"></div>
            <div class="field"><label>Ekstra utstyr</label><input id="chargeEquipment" type="number" min="0" step="0.01" value="0"></div>
            <div class="field"><label>Drivstoff</label><input id="chargeFuel" type="number" min="0" step="0.01" value="0"></div>
            <div class="field"><label>Materialer / annet</label><input id="chargeMaterials" type="number" min="0" step="0.01" value="0"></div>
            <div class="field full"><label>Tilleggsinformasjon</label><textarea id="confirmationNote"></textarea></div>
          </div>
          <div class="form-actions"><button class="btn" type="submit">Lag betalingsbekreftelse</button></div>
        </form>
        <div id="confirmationPreview"></div>
      </section>`);

    document.querySelector('#workerFrom').value = firstOfMonth();
    document.querySelector('#workerTo').value = isoToday();
    document.querySelector('#confirmationDate').value = isoToday();
    document.querySelector('#workerSummaryForm').addEventListener('submit', e => {
      e.preventDefault(); renderWorkerSummary();
    });
    document.querySelector('#confirmationJob').addEventListener('change', fillJobPrice);
    document.querySelector('#confirmationForm').addEventListener('submit', createConfirmation);
  }

  function openView(id) {
    document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === id));
    window.scrollTo(0, 0);
  }

  window.ghOpenWorkerPayments = async () => {
    if (role !== 'admin') return;
    addUi(); openView('workerPayments'); await renderWorkerSummary();
  };

  window.ghOpenPaymentConfirmation = () => {
    if (role !== 'admin') return;
    addUi(); populateJobs(); openView('paymentConfirmation');
  };

  async function getRates() {
    const { data, error } = await db.from('worker_rates').select('*');
    if (error) throw error;
    return data || [];
  }

  async function renderWorkerSummary() {
    const out = document.querySelector('#workerSummary');
    out.innerHTML = '<div class="empty">Henter…</div>';
    try {
      const from = document.querySelector('#workerFrom').value;
      const to = document.querySelector('#workerTo').value;
      const rates = await getRates();
      const rows = users.filter(u => u.role === 'worker').map(u => {
        const hours = entries.filter(e => e.entry_type === 'hours' && e.user_id === u.user_id && e.entry_date >= from && e.entry_date <= to)
          .reduce((sum, e) => sum + Number(e.quantity || 0), 0);
        const rate = Number(rates.find(r => r.user_id === u.user_id)?.hourly_rate || 0);
        return { user: u, hours, rate, amount: hours * rate };
      });
      out.innerHTML = rows.map(r => `
        <article class="card">
          <div class="jobhead"><div><h3>${esc(r.user.display_name || r.user.email)}</h3><div class="meta">${from} til ${to}</div></div><strong>${r.hours.toLocaleString('nb-NO')} t</strong></div>
          <div class="grid" style="margin-top:10px">
            <div class="field"><label>Intern sats (kr/time)</label><input id="rate-${r.user.user_id}" type="number" min="0" step="0.01" value="${r.rate}"></div>
            <div class="field"><label>Betalingsgrunnlag</label><input value="${money(r.amount)}" readonly></div>
          </div>
          <div class="form-actions">
            <button class="btn alt" type="button" onclick="ghSaveRate('${r.user.user_id}')">Lagre sats</button>
            <button class="btn" type="button" onclick="ghMarkWorkerPaid('${r.user.user_id}',${r.hours})">Marker betalt</button>
          </div>
        </article>`).join('') || '<div class="empty">Ingen arbeidere funnet.</div>';
    } catch (e) { out.innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
  }

  window.ghSaveRate = async userId => {
    const hourly_rate = Number(document.querySelector(`#rate-${userId}`).value || 0);
    const { error } = await db.from('worker_rates').upsert({ user_id: userId, hourly_rate, updated_by: session.user.id }, { onConflict: 'user_id' });
    if (error) return fail(error);
    await renderWorkerSummary();
  };

  window.ghMarkWorkerPaid = async (userId, hours) => {
    const hourly_rate = Number(document.querySelector(`#rate-${userId}`).value || 0);
    const period_from = document.querySelector('#workerFrom').value;
    const period_to = document.querySelector('#workerTo').value;
    if (!confirm(`Registrer ${money(hours * hourly_rate)} som betalt til ${userName(userId)}?`)) return;
    const { error } = await db.from('worker_payments').insert({
      user_id: userId, period_from, period_to, hours, hourly_rate,
      amount: hours * hourly_rate, paid_date: isoToday(), payment_method: 'Bank/Vipps', created_by: session.user.id
    });
    if (error) return fail(error);
    alert('Betaling er registrert.');
  };

  function populateJobs() {
    const select = document.querySelector('#confirmationJob');
    select.innerHTML = '<option value="">Velg jobb</option>' + jobs
      .filter(j => ['Fullført', 'Fakturagrunnlag', 'Betalt'].includes(j.status))
      .map(j => `<option value="${j.id}">${esc(j.job_no)} · ${esc(j.customer)} · ${esc(j.service)}</option>`).join('');
  }

  function fillJobPrice() {
    const job = jobs.find(j => j.id === document.querySelector('#confirmationJob').value);
    document.querySelector('#chargeWork').value = job ? Number(job.agreed_price || 0).toFixed(2) : '0';
  }

  async function createConfirmation(e) {
    e.preventDefault();
    const job = jobs.find(j => j.id === document.querySelector('#confirmationJob').value);
    if (!job) return alert('Velg jobb.');
    const pairs = [
      ['Arbeid / avtalt pris', '#chargeWork'], ['Transport / bortkjøring', '#chargeTransport'],
      ['Ekstra utstyr', '#chargeEquipment'], ['Drivstoff', '#chargeFuel'], ['Materialer / annet', '#chargeMaterials']
    ];
    const lineItems = pairs.map(([description, id]) => ({ description, amount: Number(document.querySelector(id).value || 0) })).filter(x => x.amount > 0);
    const total = lineItems.reduce((sum, x) => sum + x.amount, 0);
    const paymentDate = document.querySelector('#confirmationDate').value;
    const paymentMethod = document.querySelector('#confirmationMethod').value;
    const note = document.querySelector('#confirmationNote').value.trim();
    const { data, error } = await db.rpc('create_payment_confirmation', {
      p_job_id: job.id, p_payment_date: paymentDate, p_payment_method: paymentMethod,
      p_line_items: lineItems, p_total_amount: total, p_extra_description: note || null
    });
    if (error) return fail(error);
    const confirmation = Array.isArray(data) ? data[0] : data;
    renderConfirmation(job, confirmation, lineItems, note);
  }

  function renderConfirmation(job, confirmation, items, note) {
    document.querySelector('#confirmationPreview').innerHTML = `
      <div class="card" id="paymentDocument" style="margin-top:16px;padding:28px">
        <div class="jobhead"><div><h2 style="margin:0;color:var(--navy)">GUTTA HJELPER</h2><b>Betalingsbekreftelse</b></div><div><b>${esc(confirmation.confirmation_no)}</b><br>${esc(confirmation.payment_date)}</div></div>
        <hr><p><b>Jobb:</b> ${esc(job.job_no)}<br><b>Kunde:</b> ${esc(job.customer)}<br><b>Tjeneste:</b> ${esc(job.service)}<br><b>Område:</b> ${esc(job.area || '')}<br><b>Betalingsmåte:</b> ${esc(confirmation.payment_method)}</p>
        <table style="width:100%;border-collapse:collapse">${items.map(x => `<tr><td style="padding:9px;border-bottom:1px solid #ddd">${esc(x.description)}</td><td style="padding:9px;border-bottom:1px solid #ddd;text-align:right">${money(x.amount)}</td></tr>`).join('')}<tr><td style="padding:12px;font-weight:900">Betalt totalt</td><td style="padding:12px;text-align:right;font-weight:900">${money(confirmation.total_amount)}</td></tr></table>
        ${note ? `<p><b>Tilleggsinformasjon:</b><br>${esc(note)}</p>` : ''}
        <p class="small">Bekreftelse på mottatt betaling for utført arbeid. Ikke en offisiell faktura.</p>
        <div class="form-actions"><button class="btn" type="button" onclick="ghPrintConfirmation()">Skriv ut / lagre PDF</button></div>
      </div>`;
  }

  window.ghPrintConfirmation = () => {
    const documentHtml = document.querySelector('#paymentDocument').outerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<!doctype html><html lang="nb"><head><meta charset="utf-8"><title>Betalingsbekreftelse</title><style>body{font-family:Arial,sans-serif;color:#17212b;padding:28px}table{width:100%;border-collapse:collapse}.btn,.form-actions{display:none}</style></head><body>${documentHtml}<script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
  };

  addUi();
})();
