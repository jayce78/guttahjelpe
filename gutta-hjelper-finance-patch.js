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
        <div class="notice">Velg en arbeider og periode. Oversikten finner automatisk alle jobber, registrerte timer, utstyr, transport og utgifter knyttet til arbeideren. Dette er et betalingsgrunnlag, ikke lønnskjøring.</div>
        <form id="workerSummaryForm">
          <div class="grid">
            <div class="field full"><label>Arbeider</label><select id="paymentWorker" required></select></div>
            <div class="field"><label>Fra dato</label><input id="workerFrom" type="date" required></div>
            <div class="field"><label>Til dato</label><input id="workerTo" type="date" required></div>
          </div>
          <div class="form-actions"><button class="btn" type="submit">Oppdater oversikt</button></div>
        </form>
        <div id="workerSummary" style="margin-top:14px"></div>
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
          <div class="form-actions"><button class="btn" type="submit">Forhåndsvis betalingsbekreftelse</button></div>
        </form>
        <div id="confirmationPreview"></div>
      </section>`);

    document.querySelector('#workerFrom').value = firstOfMonth();
    populatePaymentWorkers();
    document.querySelector('#workerTo').value = isoToday();
    document.querySelector('#confirmationDate').value = isoToday();
    document.querySelector('#paymentWorker').addEventListener('change', renderWorkerSummary);
    document.querySelector('#workerFrom').addEventListener('change', renderWorkerSummary);
    document.querySelector('#workerTo').addEventListener('change', renderWorkerSummary);
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

  function populatePaymentWorkers(){
    const select=document.querySelector('#paymentWorker');
    if(!select)return;
    const old=select.value;
    select.innerHTML='<option value="">Velg arbeider</option>'+users.filter(u=>u.active&&['worker','admin'].includes(u.role)).sort((a,b)=>(a.display_name||a.email||'').localeCompare(b.display_name||b.email||'','nb')).map(u=>`<option value="${u.user_id}">${esc(u.display_name||u.email)}${u.role==='admin'?' · Admin':''}</option>`).join('');
    if(old&&users.some(u=>u.user_id===old))select.value=old;
  }

  async function renderWorkerSummary() {
    const out = document.querySelector('#workerSummary');
    if(!out)return;
    const userId=document.querySelector('#paymentWorker').value;
    const from=document.querySelector('#workerFrom').value;
    const to=document.querySelector('#workerTo').value;
    if(!userId){out.innerHTML='<div class="empty">Velg en arbeider for å se timer, jobber og utgifter.</div>';return;}
    out.innerHTML = '<div class="empty">Henter…</div>';
    try {
      const rates = await getRates();
      const user=users.find(u=>u.user_id===userId);
      const rate=Number(rates.find(r=>r.user_id===userId)?.hourly_rate||0);
      const workerEntries=entries.filter(e=>e.user_id===userId&&e.entry_date>=from&&e.entry_date<=to);
      const hourEntries=workerEntries.filter(e=>e.entry_type==='hours');
      const equipmentEntries=workerEntries.filter(e=>e.entry_type==='equipment');
      const transportEntries=workerEntries.filter(e=>e.entry_type==='transport');
      const workerExpenses=expenses.filter(e=>e.user_id===userId&&e.expense_date>=from&&e.expense_date<=to);
      const hours=hourEntries.reduce((a,e)=>a+Number(e.quantity||0),0);
      const expenseTotal=workerExpenses.reduce((a,e)=>a+Number(e.amount||0),0);
      const workAmount=hours*rate;
      const totalBasis=workAmount+expenseTotal;
      const involvedIds=[...new Set([...workerEntries.map(e=>e.job_id),...workerExpenses.map(e=>e.job_id)])];
      const projectRows=involvedIds.map(jobId=>{
        const job=jobs.find(j=>j.id===jobId);
        const jobHours=hourEntries.filter(e=>e.job_id===jobId).reduce((a,e)=>a+Number(e.quantity||0),0);
        const jobExpenses=workerExpenses.filter(e=>e.job_id===jobId).reduce((a,e)=>a+Number(e.amount||0),0);
        return {job,jobHours,jobExpenses};
      }).filter(r=>r.job);
      out.innerHTML=`
        <div class="stats">
          <div class="stat"><strong>${hours.toLocaleString('nb-NO')} t</strong><span>registrerte timer</span></div>
          <div class="stat"><strong>${money(workAmount)}</strong><span>arbeidsgrunnlag</span></div>
          <div class="stat"><strong>${money(expenseTotal)}</strong><span>utlegg registrert av arbeider</span></div>
          <div class="stat"><strong>${money(totalBasis)}</strong><span>samlet betalingsgrunnlag</span></div>
        </div>
        <article class="card">
          <div class="jobhead"><div><h3>${esc(user?.display_name||user?.email||'Ukjent bruker')}</h3><div class="meta">${from} til ${to}</div></div><strong>${hours.toLocaleString('nb-NO')} t</strong></div>
          <div class="grid" style="margin-top:10px"><div class="field"><label>Intern sats (kr/time)</label><input id="rate-${userId}" type="number" min="0" step="0.01" value="${rate}"></div><div class="field"><label>Samlet betalingsgrunnlag</label><input value="${money(totalBasis)}" readonly></div></div>
          <div class="form-actions"><button class="btn alt" type="button" onclick="ghSaveRate('${userId}')">Lagre sats</button><button class="btn" type="button" onclick="ghMarkWorkerPaid('${userId}',${hours},${expenseTotal})">Marker betalt</button></div>
        </article>
        <div class="section"><h2>Jobber arbeideren har vært involvert i</h2></div>
        <div class="list">${projectRows.map(r=>`<div class="card"><div class="jobhead"><div><h3>${esc(r.job.job_no)} · ${esc(r.job.customer)}</h3><div class="meta">${esc(r.job.job_date)} · ${esc(r.job.service)}</div></div><strong>${r.jobHours.toLocaleString('nb-NO')} t</strong></div><div class="cardfoot"><span>Utlegg registrert</span><strong>${money(r.jobExpenses)}</strong></div></div>`).join('')||'<div class="empty">Ingen jobber i valgt periode.</div>'}</div>
        <div class="section"><h2>Registrerte timer</h2></div>
        <div class="list">${hourEntries.map(e=>{const j=jobs.find(x=>x.id===e.job_id);return `<div class="card"><div class="jobhead"><div><h3>${esc(j?.job_no||'Ukjent jobb')}</h3><div class="meta">${esc(e.entry_date)} · ${esc(j?.customer||'')}</div></div><strong>${Number(e.quantity||0).toLocaleString('nb-NO')} t</strong></div><p>${esc(e.description||j?.service||'Arbeid')}</p></div>`}).join('')||'<div class="empty">Ingen timer i valgt periode.</div>'}</div>
        <div class="section"><h2>Utlegg betalt av arbeideren</h2></div>
        <div class="notice">Denne oversikten antar at utgifter registrert av arbeideren er personlige utlegg som skal vurderes for refusjon. Kontroller hvert utlegg før betaling.</div>
        <div class="list">${workerExpenses.map(e=>{const j=jobs.find(x=>x.id===e.job_id);return `<div class="card"><div class="jobhead"><div><h3>${esc(e.supplier||e.category||'Utlegg')}</h3><div class="meta">${esc(e.expense_date)} · ${esc(j?.job_no||'Ukjent jobb')}</div></div><strong>${money(e.amount)}</strong></div><p>${esc(e.category||'')}${e.notes?` · ${esc(e.notes)}`:''}</p></div>`}).join('')||'<div class="empty">Ingen utlegg i valgt periode.</div>'}</div>
        ${equipmentEntries.length?`<div class="section"><h2>Utstyr brukt</h2></div><div class="list">${equipmentEntries.map(e=>{const j=jobs.find(x=>x.id===e.job_id);return `<div class="card"><b>${esc(e.equipment||'Utstyr')}</b><div class="meta">${esc(j?.job_no||'')} · ${esc(e.entry_date)} · ${Number(e.quantity||0).toLocaleString('nb-NO')} ${esc(e.unit||'')}</div></div>`}).join('')}</div>`:''}
        ${transportEntries.length?`<div class="section"><h2>Transport</h2></div><div class="list">${transportEntries.map(e=>{const j=jobs.find(x=>x.id===e.job_id);return `<div class="card"><b>${esc(j?.job_no||'Transport')}</b><div class="meta">${esc(e.entry_date)} · ${Number(e.trips||0)} tur(er) · ${Number(e.km||0).toLocaleString('nb-NO')} km</div></div>`}).join('')}</div>`:''}`;
    } catch (e) { out.innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
  }

  window.ghSaveRate = async userId => {
    const hourly_rate = Number(document.querySelector(`#rate-${userId}`).value || 0);
    const { error } = await db.from('worker_rates').upsert({ user_id: userId, hourly_rate, updated_by: session.user.id }, { onConflict: 'user_id' });
    if (error) return fail(error);
    await renderWorkerSummary();
  };

  window.ghMarkWorkerPaid = async (userId, hours, expenseTotal=0) => {
    const hourly_rate = Number(document.querySelector(`#rate-${userId}`).value || 0);
    const period_from = document.querySelector('#workerFrom').value;
    const period_to = document.querySelector('#workerTo').value;
    const total=hours*hourly_rate+Number(expenseTotal||0);
    if (!confirm(`Registrer ${money(total)} som betalt til ${userName(userId)}? Beløpet inkluderer ${money(expenseTotal)} i registrerte utlegg.`)) return;
    const { error } = await db.from('worker_payments').insert({
      user_id: userId, period_from, period_to, hours, hourly_rate,
      amount: total, paid_date: isoToday(), payment_method: 'Bank/Vipps', note: `Arbeid: ${money(hours*hourly_rate)}. Utlegg: ${money(expenseTotal)}.`, created_by: session.user.id
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
    if (!lineItems.length || total <= 0) return alert('Legg inn minst én kostnad før forhåndsvisning.');
    renderConfirmationPreview(job, { payment_date: paymentDate, payment_method: paymentMethod }, lineItems, note, total);
  }

  let pendingConfirmation = null;

  function renderConfirmationPreview(job, confirmation, items, note, total) {
    pendingConfirmation = { job, confirmation, items, note, total };
    document.querySelector('#confirmationPreview').innerHTML = `
      <div class="card" id="paymentDocument" style="margin-top:16px;padding:28px">
        <div class="jobhead"><div><h2 style="margin:0;color:var(--navy)">GUTTA HJELPER</h2><b>Forhåndsvisning</b></div><div><b>Ikke lagret</b><br>${esc(confirmation.payment_date)}</div></div>
        <hr><p><b>Jobb:</b> ${esc(job.job_no)}<br><b>Kunde:</b> ${esc(job.customer)}<br><b>Tjeneste:</b> ${esc(job.service)}<br><b>Område:</b> ${esc(job.area || '')}<br><b>Betalingsmåte:</b> ${esc(confirmation.payment_method)}</p>
        <table style="width:100%;border-collapse:collapse">${items.map(x => `<tr><td style="padding:9px;border-bottom:1px solid #ddd">${esc(x.description)}</td><td style="padding:9px;border-bottom:1px solid #ddd;text-align:right">${money(x.amount)}</td></tr>`).join('')}<tr><td style="padding:12px;font-weight:900">Betalt totalt</td><td style="padding:12px;text-align:right;font-weight:900">${money(total)}</td></tr></table>
        ${note ? `<p><b>Tilleggsinformasjon:</b><br>${esc(note)}</p>` : ''}
        <p class="small">Bekreftelse på mottatt betaling for utført arbeid. Ikke en offisiell faktura.</p>
        <div class="form-actions"><button class="btn alt" type="button" onclick="ghEditConfirmation()">Rediger</button><button class="btn" type="button" onclick="ghSaveConfirmation()">Godkjenn og lagre</button></div>
      </div>`;
  }

  window.ghEditConfirmation = () => {
    document.querySelector('#confirmationPreview').innerHTML = '';
    document.querySelector('#confirmationForm').scrollIntoView({ behavior: 'smooth' });
  };

  window.ghSaveConfirmation = async () => {
    if (!pendingConfirmation) return;
    const { job, confirmation, items, note, total } = pendingConfirmation;
    const button = document.querySelector('#confirmationPreview .btn:not(.alt)');
    if (button) { button.disabled = true; button.textContent = 'Lagrer…'; }
    const { data, error } = await db.rpc('create_payment_confirmation', {
      p_job_id: job.id,
      p_payment_date: confirmation.payment_date,
      p_payment_method: confirmation.payment_method,
      p_line_items: items,
      p_total_amount: total,
      p_extra_description: note || null
    });
    if (error) { if (button) { button.disabled = false; button.textContent = 'Godkjenn og lagre'; } return fail(error); }
    const saved = Array.isArray(data) ? data[0] : data;
    renderSavedConfirmation(job, saved, items, note);
    pendingConfirmation = null;
  };

  function renderSavedConfirmation(job, confirmation, items, note) {
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
