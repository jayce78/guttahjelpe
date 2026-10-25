// Gutta Hjelper: monthly worker payment statement and shared document branding.
// Load after app.js, worker-names-patch.js and gutta-hjelper-finance-patch.js.
(() => {
  const LOGO = 'gutta-hjelper-logo.png';
  const cash = v => new Intl.NumberFormat('nb-NO',{style:'currency',currency:'NOK',maximumFractionDigits:2}).format(Number(v)||0);
  const day = () => new Date().toISOString().slice(0,10);
  const first = () => `${day().slice(0,7)}-01`;
  let draft = null;

  function addUi(){
    if(document.querySelector('#workerStatement')) return;
    document.querySelector('main').insertAdjacentHTML('beforeend',`
      <section id="workerStatement" class="view">
        <div class="section"><h2>Arbeids- og betalingsgrunnlag</h2></div>
        <div class="notice">Månedsoversikt for arbeideren. Dokumentet er ikke en offisiell lønnsslipp og inneholder ikke skatt, feriepenger eller arbeidsgiveravgift.</div>
        <form id="statementForm"><div class="grid">
          <div class="field"><label>Arbeider</label><select id="statementWorker" required></select></div>
          <div class="field"><label>Ansattnummer</label><input id="employeeNo" required placeholder="GH-EMP-001"></div>
          <div class="field"><label>Fullt navn</label><input id="legalName"></div>
          <div class="field"><label>Startdato</label><input id="startDate" type="date"></div>
          <div class="field"><label>Fra dato</label><input id="statementFrom" type="date" required></div>
          <div class="field"><label>Til dato</label><input id="statementTo" type="date" required></div>
          <div class="field"><label>Timesats</label><input id="statementRate" type="number" min="0" step="0.01" required></div>
          <div class="field"><label>Planlagt betalingsdato</label><input id="statementPayDate" type="date"></div>
          <div class="field full"><label>Notat</label><textarea id="statementNote"></textarea></div>
        </div><div class="form-actions"><button class="btn" type="submit">Forhåndsvis månedsgrunnlag</button></div></form>
        <div id="statementPreview"></div>
      </section>`);
    $('#statementFrom').value=first();$('#statementTo').value=day();$('#statementPayDate').value=day();
    $('#statementWorker').addEventListener('change',loadProfile);
    $('#statementForm').addEventListener('submit',previewStatement);
    brandDynamicDocuments();
  }

  function open(id){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));scrollTo(0,0)}
  window.ghOpenWorkerStatement=()=>{if(role!=='admin')return;addUi();populateWorkers();open('workerStatement')};

  window.ghPrepareWorkerStatement=async(userId,periodFrom,periodTo,hourlyRate)=>{
    if(role!=='admin')return;
    addUi();
    populateWorkers();
    open('workerStatement');
    $('#statementWorker').value=userId||'';
    $('#statementFrom').value=periodFrom||first();
    $('#statementTo').value=periodTo||day();
    $('#statementPayDate').value=day();
    if(userId)await loadProfile();
    if(hourlyRate!==undefined&&hourlyRate!==null)$('#statementRate').value=Number(hourlyRate||0);
    $('#statementForm').scrollIntoView({behavior:'smooth'});
  };

  function populateWorkers(){
    $('#statementWorker').innerHTML='<option value="">Velg arbeider</option>'+users.filter(u=>u.role==='worker'&&u.active).map(u=>`<option value="${u.user_id}">${esc(u.display_name||u.email)}</option>`).join('');
  }

  async function loadProfile(){
    const id=$('#statementWorker').value;if(!id)return;
    const [{data:profile},{data:rate}]=await Promise.all([
      db.from('worker_profiles').select('*').eq('user_id',id).maybeSingle(),
      db.from('worker_rates').select('hourly_rate').eq('user_id',id).maybeSingle()
    ]);
    $('#employeeNo').value=profile?.employee_no||'';$('#legalName').value=profile?.legal_name||'';$('#startDate').value=profile?.start_date||'';$('#statementRate').value=rate?.hourly_rate||0;
  }

  async function previewStatement(e){
    e.preventDefault();
    const userId=$('#statementWorker').value,from=$('#statementFrom').value,to=$('#statementTo').value,employeeNo=$('#employeeNo').value.trim(),legalName=$('#legalName').value.trim(),rate=Number($('#statementRate').value||0);
    if(!userId||!employeeNo)return alert('Velg arbeider og legg inn ansattnummer.');
    const user=users.find(u=>u.user_id===userId);
    const rows=entries.filter(x=>x.entry_type==='hours'&&x.user_id===userId&&x.entry_date>=from&&x.entry_date<=to).map(x=>{const job=jobs.find(j=>j.id===x.job_id);return{job_no:job?.job_no||'',date:x.entry_date,description:x.description||job?.service||'Arbeid',hours:Number(x.quantity||0)}});
    const hours=rows.reduce((a,x)=>a+x.hours,0),amount=hours*rate;
    draft={userId,user,employeeNo,legalName,from,to,rate,rows,hours,amount,paymentDate:$('#statementPayDate').value||null,note:$('#statementNote').value.trim(),startDate:$('#startDate').value||null};
    $('#statementPreview').innerHTML=statementHtml(draft,null,true);
  }

  function statementHtml(d,saved,isPreview){
    return `<div class="card gh-document" id="workerStatementDocument" style="margin-top:16px;padding:28px">
      <div class="gh-logo"><img src="${LOGO}" alt="Gutta Hjelper"></div>
      <div class="jobhead"><div><h2>ARBEIDS- OG BETALINGSGRUNNLAG</h2><b>${isPreview?'FORHÅNDSVISNING':'Klar for lønnskjøring'}</b></div><div><b>${saved?.statement_no||'Ikke lagret'}</b><br>${d.from} – ${d.to}</div></div><hr>
      <p><b>Arbeider:</b> ${esc(d.legalName||d.user?.display_name||d.user?.email)}<br><b>Ansattnummer:</b> ${esc(d.employeeNo)}${d.startDate?`<br><b>Startdato:</b> ${esc(d.startDate)}`:''}<br><b>Planlagt betalingsdato:</b> ${esc(d.paymentDate||'Ikke satt')}</p>
      <table class="doc-table"><thead><tr><th>Jobb</th><th>Dato</th><th>Arbeid</th><th>Timer</th><th>Beløp</th></tr></thead><tbody>${d.rows.map(r=>`<tr><td>${esc(r.job_no)}</td><td>${esc(r.date)}</td><td>${esc(r.description)}</td><td>${r.hours.toLocaleString('nb-NO')}</td><td>${cash(r.hours*d.rate)}</td></tr>`).join('')}<tr class="doc-total"><td colspan="3">Totalt</td><td>${d.hours.toLocaleString('nb-NO')} t</td><td>${cash(d.amount)}</td></tr></tbody></table>
      <p><b>Timesats:</b> ${cash(d.rate)}</p>${d.note?`<p><b>Notat:</b><br>${esc(d.note)}</p>`:''}
      <p class="small">Internt arbeids- og betalingsgrunnlag. Offisiell lønnsslipp, skatt, feriepenger og rapportering håndteres separat.</p>
      <div class="form-actions">${isPreview?`<button class="btn alt" onclick="ghEditWorkerStatement()">Rediger</button><button class="btn" onclick="ghSaveWorkerStatement()">Godkjenn og lagre</button>`:`<button class="btn" onclick="ghPrintDocument('workerStatementDocument','Arbeids- og betalingsgrunnlag')">Skriv ut / lagre PDF</button>`}</div>
    </div>`;
  }

  window.ghEditWorkerStatement=()=>{$('#statementPreview').innerHTML='';$('#statementForm').scrollIntoView({behavior:'smooth'})};
  window.ghSaveWorkerStatement=async()=>{
    if(!draft)return;
    const {error:pErr}=await db.from('worker_profiles').upsert({user_id:draft.userId,employee_no:draft.employeeNo,legal_name:draft.legalName||null,start_date:draft.startDate,updated_by:session.user.id},{onConflict:'user_id'});if(pErr)return fail(pErr);
    const {error:rErr}=await db.from('worker_rates').upsert({user_id:draft.userId,hourly_rate:draft.rate,updated_by:session.user.id},{onConflict:'user_id'});if(rErr)return fail(rErr);
    const {data,error}=await db.rpc('create_worker_statement',{p_user_id:draft.userId,p_employee_no:draft.employeeNo,p_period_from:draft.from,p_period_to:draft.to,p_payment_date:draft.paymentDate,p_total_hours:draft.hours,p_hourly_rate:draft.rate,p_line_items:draft.rows,p_note:draft.note||null});if(error)return fail(error);
    const saved=Array.isArray(data)?data[0]:data;$('#statementPreview').innerHTML=statementHtml(draft,saved,false);draft=null;
  };

  window.ghPrintDocument=(id,title)=>{
    const node=document.getElementById(id);if(!node)return;
    const w=open('','_blank');w.document.write(`<!doctype html><html lang="nb"><head><meta charset="utf-8"><title>${title}</title><style>${printCss()}</style></head><body>${node.outerHTML}<script>onload=()=>print()<\/script></body></html>`);w.document.close();
  };

  function printCss(){return `body{font-family:Arial,sans-serif;color:#17212b;padding:24px}.gh-document{max-width:850px;margin:auto}.gh-logo img{width:280px;max-height:98px;object-fit:contain}.jobhead{display:flex;justify-content:space-between;gap:20px}.jobhead h2{margin:0}.doc-table{width:100%;border-collapse:collapse;margin-top:18px}.doc-table th,.doc-table td{padding:8px;border-bottom:1px solid #d9e2ec;text-align:left}.doc-table th:last-child,.doc-table td:last-child{text-align:right}.doc-total{font-weight:700}.small{font-size:12px;color:#607080}.form-actions,.btn{display:none}`}

  function brandDynamicDocuments(){
    const observer=new MutationObserver(()=>document.querySelectorAll('#paymentDocument').forEach(doc=>{if(!doc.querySelector('.gh-logo'))doc.insertAdjacentHTML('afterbegin',`<div class="gh-logo"><img src="${LOGO}" alt="Gutta Hjelper" style="width:280px;max-height:98px;object-fit:contain;margin-bottom:16px"></div>`)}));
    observer.observe(document.body,{childList:true,subtree:true});
  }

  addUi();
})();
