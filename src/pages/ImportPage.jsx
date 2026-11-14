import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { importApi, backupApi, errMsg} from '../api/client';
import { Btn, GhostBtn } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import { todayYmd } from '../utils/date';

const ENTITIES = [
  {
    id:'customers', label:'Customers',
    required:['name','mobile'],
    optional:['care_of','email','address','tags'],
    note:'Deduplicated by mobile number. Tags: VIP, Corporate, Loyal.',
  },
  {
    id:'vehicles', label:'Vehicles and stock',
    required:['brand','model','chassis_number'],
    optional:['variant','color','engine_number','vehicle_number','key_number','type','status','inbound_date','inbound_location','return_date','returned_location'],
    note:'Deduplicated by chassis_number. type: new/used. status: in_stock/sold/returned.',
  },
  {
    id:'sales', label:'Sales records',
    required:['customer_name','customer_mobile','vehicle_brand','vehicle_model','sale_price'],
    optional:['care_of','chassis_number','engine_number','vehicle_number','vehicle_color','vehicle_variant','rto','financier','payment_mode','nominee_name','nominee_relation','nominee_age','sale_date','customer_address'],
    note:'Customer auto-created if mobile not found. Dedup by chassis_number.',
  },
  {
    id:'service', label:'Service history',
    required:[],
    optional:['customer_name','customer_mobile','vehicle_number','brand','model','odometer_km','complaint','technician','check_in_date','status','amount','notes'],
    note:'All fields optional. Dedup by vehicle_number + check_in_date. status: pending/in_progress/ready/delivered.',
  },
  {
    id:'parts', label:'Spare parts',
    required:['part_number','name','selling_price'],
    optional:['category','brand','compatible_with','stock','reorder_level','purchase_price','gst_rate','hsn_code','location'],
    note:'Dedup by part_number. selling_price is GST-inclusive. gst_rate: 0/5/12/18/28.',
  },
  {
    id:'staff', label:'Staff and users',
    required:['name','username','role'],
    optional:['mobile','email','salary','join_date'],
    note:'Dedup by username. Roles: owner/sales/service_advisor/parts_counter/technician. Each new account gets its own one-time password, shown once after the import.',
  },
  {
    id:'expenses', label:'Expenses',
    required:['date','category','amount'],
    optional:['sub_category','description','vendor','payment_mode','receipt_no','notes'],
    note:'date: DD/MM/YYYY. Categories: Staff Salaries, Rent & Utilities, Vehicle Purchase, Parts & Consumables, RTO & Insurance, Transport & Logistics, Marketing & Advertising, Bank Charges & Loan EMI, Equipment & Maintenance, Miscellaneous.',
  },
];

function ImportCard({ cfg, onRefreshCounts }) {
  const confirm = useConfirm();
  const [file,    setFile]    = useState(null);
  const [mode,    setMode]    = useState('skip');
  const [result,  setResult]  = useState(null);
  const [status,  setStatus]  = useState('');
  const [preview, setPreview] = useState(null);
  const [tab,     setTab]     = useState('preview');

  const handleFile = async f => {
    setFile(f); setResult(null); setPreview(null);
    if (!f) return;
    try {
      const res = await importApi.preview(cfg.id, f);
      setPreview(res.data); setTab('preview');
    } catch { toast.error('Could not preview file'); }
  };

  const handleImport = async () => {
    if (!file) return;
    setStatus('importing');
    try {
      const res = await importApi.import(cfg.id, file, mode);
      const r = res.data;
      setResult(r);
      // Show errors tab first if any
      if (r.error_count > 0) {
        setTab('errors');
        toast.error(`${r.error_count} rows failed. See the Errors tab.`);
      } else if (r.skipped_count > 0) {
        setTab('skipped');
        toast.success(`${r.inserted} imported, ${r.skipped_count} skipped`);
      } else {
        setTab('preview');
        toast.success(`${r.inserted} records imported successfully`);
      }
      onRefreshCounts();
    } catch(e) {
      const detail = e?.response?.data?.detail;
      const msg    = typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Import failed';
      toast.error(msg, { duration: 8000 });
      // Also set a synthetic result so user can see
      setResult({ inserted:0, skipped_count:0, error_count:1,
        skipped:[], errors:[{ row:'—', error: msg }],
        summary: msg });
      setTab('errors');
    }
    finally { setStatus(''); }
  };

  const handleTemplate = async () => {
    try {
      const res = await importApi.template(cfg.id);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href=url; a.download=`template_${cfg.id}.xlsx`; a.click();
    } catch { toast.error('Download failed'); }
  };

  const handleClear = async () => {
    if (!(await confirm(`Clear all ${cfg.label} data? This cannot be undone.`))) return;
    setStatus('clearing');
    try {
      const res = await importApi.clear(cfg.id);
      toast.success(`Cleared ${res.data.deleted} records`);
      onRefreshCounts();
    } catch(e) { toast.error(errMsg(e, 'Clear failed')); }
    finally { setStatus(''); }
  };

  const fileId = `file-${cfg.id}`;
  const titleId = `import-${cfg.id}-title`;

  return (
    <section aria-labelledby={titleId} style={{ background:'var(--color-paper)', border:'1px solid var(--color-rule)', borderRadius:'var(--radius-card)', overflow:'hidden' }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'flex-start', flexWrap:'wrap', gap:'var(--space-sm)', padding:'var(--space-md) var(--space-lg)', borderBottom:'1px solid var(--color-rule)' }}>
        <div style={{ flex:'1 1 280px', minWidth:0 }}>
          <h3 id={titleId} className="sheet-sec" style={{ margin:0 }}>{cfg.label}</h3>
          <p className="cell-sub" style={{ maxWidth:'80ch' }}>{cfg.note}</p>
        </div>
        <div style={{ display:'flex', gap:'var(--space-xs)', flexWrap:'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleTemplate}>Download template</button>
          <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" onClick={handleClear} disabled={status==='clearing'}>
            {status==='clearing'?'Clearing…':'Clear all'}
          </button>
        </div>
      </div>

      {/* required / optional columns */}
      <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-xs)', padding:'var(--space-sm) var(--space-lg)', borderBottom:'1px solid var(--color-rule)', background:'var(--color-paper-2)' }}>
        <div className="tag-row" style={{ alignItems:'center' }}>
          <span className="label-xs" style={{ marginRight:'var(--space-2xs)', flexShrink:0 }}>Required:</span>
          {cfg.required.map(r=>(
            <span key={r} className="pill mono" style={{ color:'var(--color-ink)', background:'var(--color-paper)', borderColor:'var(--color-rule-2)' }}>{r}</span>
          ))}
        </div>
        {cfg.optional?.length > 0 && (
          <div className="tag-row" style={{ alignItems:'center' }}>
            <span className="label-xs" style={{ marginRight:'var(--space-2xs)', flexShrink:0 }}>Optional:</span>
            {cfg.optional.map(r=>(
              <span key={r} className="pill pill-dim mono">{r}</span>
            ))}
          </div>
        )}
      </div>

      {/* file picker row */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'var(--space-xs)', alignItems:'center', padding:'var(--space-md) var(--space-lg)', borderBottom:'1px solid var(--color-rule)' }}>
        <label htmlFor={fileId} className="file-drop" style={{ flex:'1 1 260px', minWidth:0, display:'flex', gap:'var(--space-sm)', alignItems:'center', minHeight:'var(--control-h)', padding:'var(--space-xs) var(--space-sm)', borderRadius:'var(--radius-control)', cursor:'pointer', border:`1px dashed ${file?'var(--color-ink-2)':'var(--color-rule-2)'}`, background:file?'var(--color-paper-2)':'transparent' }}>
          <input id={fileId} type="file" accept=".xlsx,.xls,.csv" className="visually-hidden" onChange={e=>handleFile(e.target.files?.[0]||null)} />
          <span className="cell-clip" style={{ fontSize:'var(--text-sm)', color:file?'var(--color-ink)':'var(--color-muted)' }}>{file?file.name:'Click to choose Excel or CSV'}</span>
          {file&&<span className="label-xs mono" style={{ flexShrink:0 }}>{(file.size/1024).toFixed(1)} KB</span>}
        </label>
        <select aria-label="Duplicates" value={mode} onChange={e=>setMode(e.target.value)} style={{ width:'auto' }}>
          <option value="skip">Skip duplicates</option>
          <option value="overwrite">Overwrite duplicates</option>
        </select>
        <Btn disabled={!file||status==='importing'} onClick={handleImport}>
          {status==='importing'?'Importing…':'Import'}
        </Btn>
      </div>

      {/* result summary */}
      {result && (
        <div style={{ borderBottom:'1px solid var(--color-rule)' }}>
          <div className={`notice page-notice${result.error_count>0 ? ' notice-error' : ''}`} role="status" style={{ fontWeight:600, color: result.error_count>0 ? 'var(--color-error)' : 'var(--color-success)' }}>
            {result.summary || `${result.inserted} imported, ${result.skipped_count} skipped, ${result.error_count} errors`}
          </div>
          {result.credentials?.length > 0 && (
            <div className="notice notice-warn page-notice" role="status">
              <div style={{ marginBottom:'var(--space-2xs)' }}>One-time passwords for the new accounts. Share each one with its owner now; they are not shown again.</div>
              <ul style={{ margin:0, paddingLeft:'var(--space-md)' }}>
                {result.credentials.map(c => <li key={c.username}><strong>{c.username}</strong>: <span className="mono">{c.password}</span></li>)}
              </ul>
            </div>
          )}
          <div className="stat-strip" style={{ borderBottom:0 }}>
          {[
            { l:'Inserted', v:result.inserted,      c: result.inserted > 0 ? 'var(--color-success)' : undefined },
            { l:'Skipped',  v:result.skipped_count, c: result.skipped_count > 0 ? 'var(--color-warn)' : undefined },
            { l:'Errors',   v:result.error_count,   c: result.error_count > 0 ? 'var(--color-error)' : undefined },
          ].map(s=>(
            <div key={s.l} className="stat">
              <span className="stat-label">{s.l}</span>
              <span className="stat-value" style={s.c ? { color:s.c } : undefined}>{s.v}</span>
            </div>
          ))}
          </div>
        </div>
      )}

      {/* preview / skipped / errors */}
      {(preview||result) && (
        <div style={{ padding:'0 var(--space-lg) var(--space-lg)' }}>
          <div className="tabs" role="tablist" aria-label={`${cfg.label} import`} style={{ margin:'var(--space-sm) 0' }}>
            {[
              { id:'preview', l:'Preview',                             show:!!preview },
              { id:'skipped', l:`Skipped (${result?.skipped_count||0})`, show:!!result&&result.skipped_count>0 },
              { id:'errors',  l:`Errors (${result?.error_count||0})`,    show:!!result&&result.error_count>0 },
            ].filter(t=>t.show).map(t=>(
              <button key={t.id} type="button" role="tab" className="tab" aria-selected={tab===t.id} onClick={()=>setTab(t.id)}>{t.l}</button>
            ))}
          </div>

          {tab==='preview'&&preview&&(
            <div>
              <p className="cell-sub" style={{ marginBottom:'var(--space-xs)' }}>First {preview.preview?.length} rows. Columns: <span className="mono" style={{ color:'var(--color-ink)' }}>{preview.columns_found?.join(', ')}</span></p>
              <div className="table-wrap" style={{ border:'1px solid var(--color-rule)', borderRadius:'var(--radius-control)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    {preview.columns_found?.map(c=>(
                      <th key={c} className="mono" style={cfg.required.includes(c) ? { color:'var(--color-ink)', fontWeight:600 } : undefined}>
                        {c}{cfg.required.includes(c)?'*':''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview?.map((row,i)=>(
                    <tr key={i}>
                      {preview.columns_found?.map(c=>(
                        <td key={c} className={`cell-clip${row[c] ? '' : ' cell-muted'}`} style={{ maxWidth:140 }}>{row[c]||'Blank'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {tab==='skipped'&&result?.skipped?.map((r,i)=>(
            <div key={i} className="notice notice-warn" style={{ display:'flex', gap:'var(--space-sm)', marginTop:'var(--space-2xs)', padding:'var(--space-xs) var(--space-sm)' }}>
              <span className="mono label-xs" style={{ minWidth:56 }}>Row {r.row}</span>
              <span>{r.reason}</span>
            </div>
          ))}

          {tab==='errors'&&result?.errors?.map((r,i)=>(
            <div key={i} className="notice notice-error" style={{ display:'flex', gap:'var(--space-sm)', marginTop:'var(--space-2xs)', padding:'var(--space-xs) var(--space-sm)' }}>
              <span className="mono label-xs" style={{ minWidth:56 }}>Row {r.row}</span>
              <span>{typeof r.error === 'string' ? r.error : JSON.stringify(r.error)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ImportPage() {
  const { data:counts, refetch } = useQuery({
    queryKey:['import-counts'],
    queryFn: ()=>importApi.counts().then(r=>r.data),
  });

  const [backing, setBacking] = useState(false);

  const downloadBackup = async () => {
    setBacking(true);
    try {
      const res = await backupApi.export();
      const url  = URL.createObjectURL(new Blob([res.data], { type:'application/zip' }));
      const a    = document.createElement('a');
      const date = todayYmd();
      a.href     = url;
      a.download = `MMMotors_Backup_${date}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded. Keep it safe.');
    } catch(e) {
      toast.error(errMsg(e, 'Backup failed'));
    } finally {
      setBacking(false);
    }
  };

  return (
    <div>
      <div className="page-head" style={{ alignItems:'flex-start', flexWrap:'wrap' }}>
        <div style={{ minWidth:0 }}>
          <h2 className="page-head-title">Import data</h2>
          <p className="cell-sub">Upload Excel or CSV files to load existing records. Download a template first.</p>
        </div>
        {/* ── Backup button ── */}
        <button type="button" className="btn btn-ghost" onClick={downloadBackup} disabled={backing} aria-busy={backing}>
          {backing ? 'Preparing backup…' : 'Download full backup'}
        </button>
      </div>

      {/* DB counts */}
      {counts && (
        <section className="stat-strip" aria-label="Records in database">
          {[
            { l:'Customers',    v:counts.customers },
            { l:'Vehicles',     v:counts.vehicles },
            { l:'Sales',        v:counts.sales },
            { l:'Service jobs', v:counts.service_jobs },
            { l:'Spare parts',  v:counts.spare_parts },
            { l:'Staff',        v:counts.users },
          ].map(({l,v})=>(
            <div key={l} className="stat">
              <span className="stat-label">{l}</span>
              <span className="stat-value" style={v>0 ? undefined : { color:'var(--color-muted)' }}>{v}</span>
            </div>
          ))}
        </section>
      )}

      <div className="page-pad" style={{ display:'flex', flexDirection:'column', gap:'var(--space-lg)' }}>
        {/* how it works */}
        <section className="notice" aria-labelledby="import-how" style={{ marginTop:0, padding:'var(--space-md) var(--space-lg)' }}>
          <h3 id="import-how" className="sheet-sec">How it works</h3>
          <ol style={{ listStyle:'none', margin:0, padding:0, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:'var(--space-md)' }}>
            {[
              ['1. Download template','Click Download template to get the correct Excel layout'],
              ['2. Fill your data',   'Add records, one per row, and match column names exactly'],
              ['3. Upload & preview', 'Choose the file: the first 10 rows preview instantly'],
              ['4. Import',          'Click Import to load the records into the database. Skip or overwrite duplicates.'],
            ].map(([h,t])=>(
              <li key={h}>
                <div className="cell-strong" style={{ color:'var(--color-ink)' }}>{h}</div>
                <div className="cell-sub" style={{ lineHeight:1.5 }}>{t}</div>
              </li>
            ))}
          </ol>
        </section>

        {/* import cards */}
        <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-md)' }}>
          {ENTITIES.map(e=><ImportCard key={e.id} cfg={e} onRefreshCounts={refetch} />)}
        </div>
      </div>
    </div>
  );
}
