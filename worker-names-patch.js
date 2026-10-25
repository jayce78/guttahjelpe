// Gutta Hjelper - worker name display patch
// Load AFTER app.js.

function workerName(userId) {
  const user = users.find(u => u.user_id === userId);
  return user?.display_name || user?.email || 'Ukjent bruker';
}

renderDetail = function () {
  const job = jobs.find(x => x.id === selectedJob);
  if (!job) return;

  const jobEntries = entries.filter(x => x.job_id === job.id);
  const jobExpenses = expenses.filter(x => x.job_id === job.id);

  const hourEntries = jobEntries.filter(x => x.entry_type === 'hours');
  const equipmentEntries = jobEntries.filter(x => x.entry_type === 'equipment');
  const transportEntries = jobEntries.filter(x => x.entry_type === 'transport');
  const noteEntries = jobEntries.filter(x => x.entry_type === 'note');

  const totalHours = hourEntries.reduce(
    (sum, entry) => sum + Number(entry.quantity || 0),
    0
  );

  const card = (entry, title, value = '', note = '') => `
    <div class="card">
      <div class="jobhead">
        <div>
          <h3>${esc(workerName(entry.user_id))}</h3>
          <div class="meta">${esc(entry.entry_date || entry.expense_date || '')}</div>
        </div>
        ${value ? `<strong>${value}</strong>` : ''}
      </div>
      <p>${esc(title)}</p>
      ${note ? `<span class="small">${esc(note)}</span>` : ''}
    </div>
  `;

  const hoursHtml = hourEntries.length
    ? hourEntries.map(entry => card(
        entry,
        entry.description || 'Ingen beskrivelse',
        `${Number(entry.quantity || 0).toLocaleString('nb-NO')} t`
      )).join('')
    : '<div class="empty">Ingen timer registrert.</div>';

  const equipmentHtml = equipmentEntries.map(entry => card(
    entry,
    entry.equipment || 'Utstyr',
    `${Number(entry.quantity || 0).toLocaleString('nb-NO')} ${entry.unit || ''}`,
    entry.description || ''
  )).join('');

  const transportHtml = transportEntries.map(entry => card(
    entry,
    `${Number(entry.trips || 0)} tur(er) · ${Number(entry.km || 0).toLocaleString('nb-NO')} km`,
    '',
    entry.description || ''
  )).join('');

  const notesHtml = noteEntries.map(entry => card(
    entry,
    entry.description || 'Notat'
  )).join('');

  const expensesHtml = jobExpenses.map(expense => card(
    expense,
    `${expense.category || 'Utgift'}${expense.supplier ? ` · ${expense.supplier}` : ''}`,
    nok(expense.amount),
    expense.notes || ''
  )).join('');

  $('#detailBody').innerHTML = `
    <div class="detail-head">
      <span class="meta">${esc(job.job_no)} · ${esc(job.job_date)}</span>
      <h2>${esc(job.customer)} · ${esc(job.service)}</h2>
      <p>${esc(job.area || '')}</p>
    </div>

    <div class="stats">
      <div class="stat">
        <strong>${totalHours.toLocaleString('nb-NO')} t</strong>
        <span>registrerte timer</span>
      </div>
      <div class="stat admin-only">
        <strong>${nok(job.agreed_price)}</strong>
        <span>avtalt pris</span>
      </div>
    </div>

    ${role === 'admin' ? `
      <div class="card">
        <label>Status</label>
        <select id="detailStatus">
          ${[
            'Forespørsel',
            'Tilbud sendt',
            'Planlagt',
            'Pågår',
            'Fullført',
            'Fakturagrunnlag',
            'Betalt',
            'Kansellert',
            'Avvist'
          ].map(status => `
            <option ${status === job.status ? 'selected' : ''}>${status}</option>
          `).join('')}
        </select>
      </div>
    ` : ''}

    <div class="section"><h2>Arbeidstimer</h2></div>
    <div class="list">${hoursHtml}</div>

    ${equipmentHtml ? `
      <div class="section"><h2>Utstyr</h2></div>
      <div class="list">${equipmentHtml}</div>
    ` : ''}

    ${transportHtml ? `
      <div class="section"><h2>Transport</h2></div>
      <div class="list">${transportHtml}</div>
    ` : ''}

    ${notesHtml ? `
      <div class="section"><h2>Notater</h2></div>
      <div class="list">${notesHtml}</div>
    ` : ''}

    ${expensesHtml ? `
      <div class="section"><h2>Utgifter</h2></div>
      <div class="list">${expensesHtml}</div>
    ` : ''}
  `;

  if (role === 'admin') {
    $('#detailStatus').onchange = async event => {
      const { error } = await db
        .from('jobs')
        .update({
          status: event.target.value,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);

      if (error) return fail(error);
      await loadAll();
      renderDetail();
    };
  }
};
