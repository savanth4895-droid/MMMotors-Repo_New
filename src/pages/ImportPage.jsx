import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { importApi } from '../api/client';
import { Btn, GhostBtn } from '../components/ui';
import toast from 'react-hot-toast';

const ENTITIES = [
  {
    id:'customers', label:'Customers', icon:'◉', color:'#3b82f6',
    required:['name','mobile'],
    optional:['email','address','gstin','tags'],
    note:'Deduplicated by mobile number. Tags: VIP, Corporate, Loyal.',
  },
  {
    id:'vehicles', label:'Vehicles / Stock', icon:'⬡', color:'#16a34a',
    required:['brand','model','chassis_number'],
    optional:['variant','color','engine_number','vehicle_number','key_number','type','status','return_date','returned_location'],
    note:'Deduplicated by chassis_number. type: new/used. status: in_stock/sold/returned.',
  },
  {
    id:'sales', label:'Sales Records', icon:'◈', color:'#b8860b',
    required:['customer_name','customer_mobile','vehicle_brand','vehicle_model','sale_price'],
    optional:['chassis_number','engine_number','vehicle_number','vehicle_color','vehicle_variant','payment_mode','nominee_name','nominee_relation','nominee_age','sale_date','customer_address'],
    note:'Customer auto-created if mobile not found. Dedup by chassis_number.',
  },
  {
    id:'service', label:'Service History', icon:'◎', color:'#7c3aed',
    required:[],
    optional:['customer_name','customer_mobile','vehicle_number','brand','model','odometer_km','complaint','technician','check_in_date','status','amount','notes'],
    note:'All fields optional. Dedup by vehicle_number + check_in_date. status: pending/in_progress/ready/delivered.',
  },
  {
    id:'parts', label:'Spare Parts', icon:'◆', color:'#ea580c',
    required:['part_number','name','selling_price'],
    optional:['category','brand','compatible_with','stock','reorder_level','purchase_price','gst_rate','hsn_code','location'],
    note:'Dedup by part_number. selling_price is GST-inclusive. gst_rate: 0/5/12/18/28.',
  },
  {
    id:'staff', label:'Staff / Users', icon:'◫', color:'#db2777',
    required:['name','username','role'],
    optional:['mobile','email','salary','join_date'],
    note:'Dedup by username. Roles: owner/sales/service_advisor/parts_counter/technician. Default password = username.',
  },
];

function ImportCard({ cfg, onRefreshCounts }) {
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
      setResult(res.data);
      setTab(res.data.error_count>0?'errors':res.data.skipped_count>0?'skipped':'preview');
      toast.success(`Imported ${res.data.inserted} records`);
      onRefreshCounts();
    } catch(e) { toast.error(e?.response?.data?.detail||'Import failed'); }
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
    if (!window.confirm(`Clear ALL ${cfg.label} data? This cannot be undone.`)) return;
    setStatus('clearing');
    try {
      const res = await importApi.clear(cfg.id);
      toast.success(`Cleared ${res.data.deleted} records`);
      onRefreshCounts();
    } catch(e) { toast.error(e?.response?.data?.detail||'Clear failed'); }
    finally { setStatus(''); }
  };

  const fileId = `file-${cfg.id}`;
  const selStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, padding:'8px 10px', color:'var(--text)', outline:'none', fontSize:12, fontFamily:'IBM Plex Sans,sans-serif' };

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, overflow:'hidden' }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
        <span style={{ fontSize:15, color:cfg.color }}>{cfg.icon}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:600 }}>{cfg.label}</div>
          <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{cfg.note}</div>
        </div>
        <button onClick={handleTemplate} style={{ padding:'5px 12px', background:'transparent', border:`1px solid ${cfg.color}44`, borderRadius:3, color:cfg.color, fontSize:11, cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif' }}>↓ Template</button>
        <button onClick={handleClear} disabled={status==='clearing'} style={{ padding:'5px 12px', background:'transparent', border:'1px solid rgba(220,38,38,.3)', borderRadius:3, color:'var(--red)', fontSize:11, cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif', opacity:status==='clearing'?.5:1 }}>
          {status==='clearing'?'Clearing…':'Clear all'}
        </button>
      </div>

      {/* required / optional columns */}
      <div style={{ padding:'10px 18px', borderBottom:'1px solid var(--border)', background:'rgba(0,0,0,.02)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom: cfg.optional?.length ? 6 : 0 }}>
          <span className="label-xs" style={{ marginRight:4, flexShrink:0 }}>Required:</span>
          {cfg.required.map(r=>(
            <span key={r} style={{ fontSize:10, padding:'2px 8px', borderRadius:2, color:cfg.color, background:`${cfg.color}18`, border:`1px solid ${cfg.color}33`, fontFamily:'IBM Plex Mono,monospace' }}>{r}</span>
          ))}
        </div>
        {cfg.optional?.length > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
            <span className="label-xs" style={{ marginRight:4, flexShrink:0, color:'var(--dim)' }}>Optional:</span>
            {cfg.optional.map(r=>(
              <span key={r} style={{ fontSize:10, padding:'2px 8px', borderRadius:2, color:'var(--dim)', background:'rgba(0,0,0,.04)', border:'1px solid var(--border)', fontFamily:'IBM Plex Mono,monospace' }}>{r}</span>
            ))}
          </div>
        )}
      </div>

      {/* file picker row */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:8, alignItems:'center', padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
        <label htmlFor={fileId} style={{ display:'flex', gap:10, alignItems:'center', padding:'10px 14px', borderRadius:4, cursor:'pointer', border:`1px dashed ${file?cfg.color:'var(--border)'}`, background:file?`${cfg.color}08`:'transparent' }}>
          <input id={fileId} type="file" accept=".xlsx,.xls,.csv" style={{ display:'none' }} onChange={e=>handleFile(e.target.files?.[0]||null)} />
          <span style={{ fontSize:11, color:file?cfg.color:'var(--muted)' }}>{file?file.name:'Click to choose Excel or CSV'}</span>
          {file&&<span style={{ fontSize:10, color:'var(--dim)' }}>{(file.size/1024).toFixed(1)} KB</span>}
        </label>
        <select value={mode} onChange={e=>setMode(e.target.value)} style={selStyle}>
          <option value="skip">Skip duplicates</option>
          <option value="overwrite">Overwrite duplicates</option>
        </select>
        <Btn disabled={!file||status==='importing'} onClick={handleImport} color={cfg.color}>
          {status==='importing'?'Importing…':'Import →'}
        </Btn>
      </div>

      {/* result summary */}
      {result && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
          {[
            { l:'Inserted', v:result.inserted,      c:'#4ade80' },
            { l:'Skipped',  v:result.skipped_count, c:'#fbbf24' },
            { l:'Errors',   v:result.error_count,   c:'#f87171' },
          ].map(s=>(
            <div key={s.l} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'10px 14px', textAlign:'center' }}>
              <div style={{ fontSize:9, color:'var(--dim)', letterSpacing:'.07em', textTransform:'uppercase' }}>{s.l}</div>
              <div className="display" style={{ fontSize:22, fontWeight:800, color:s.c, marginTop:4 }}>{s.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* preview / skipped / errors */}
      {(preview||result) && (
        <div style={{ padding:'0 18px 18px' }}>
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--border)', margin:'12px 0' }}>
            {[
              { id:'preview', l:'Preview',                             show:!!preview },
              { id:'skipped', l:`Skipped (${result?.skipped_count||0})`, show:!!result&&result.skipped_count>0 },
              { id:'errors',  l:`Errors (${result?.error_count||0})`,    show:!!result&&result.error_count>0 },
            ].filter(t=>t.show).map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:'7px 14px', background:'transparent', border:'none', borderBottom:tab===t.id?`2px solid ${cfg.color}`:'2px solid transparent', color:tab===t.id?cfg.color:'var(--muted)', cursor:'pointer', fontSize:10, letterSpacing:'.06em', textTransform:'uppercase', fontFamily:'IBM Plex Sans,sans-serif' }}>{t.l}</button>
            ))}
          </div>

          {tab==='preview'&&preview&&(
            <div style={{ overflowX:'auto' }}>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:8 }}>First {preview.preview?.length} rows · Columns: <span className="mono" style={{ color:'var(--text)' }}>{preview.columns_found?.join(', ')}</span></div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {preview.columns_found?.map(c=>(
                      <th key={c} style={{ padding:'5px 10px', textAlign:'left', color:cfg.required.includes(c)?cfg.color:'var(--dim)', fontWeight:cfg.required.includes(c)?700:400, letterSpacing:'.05em', textTransform:'uppercase', whiteSpace:'nowrap' }}>
                        {c}{cfg.required.includes(c)?'*':''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview?.map((row,i)=>(
                    <tr key={i} style={{ borderBottom:'1px solid var(--border)', background:i%2===0?'transparent':'var(--surface2)' }}>
                      {preview.columns_found?.map(c=>(
                        <td key={c} style={{ padding:'6px 10px', color:row[c]?'var(--text)':'var(--dim)', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row[c]||'—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab==='skipped'&&result?.skipped?.map((r,i)=>(
            <div key={i} style={{ display:'flex', gap:10, padding:'7px 12px', marginBottom:4, background:'rgba(251,191,36,.06)', border:'1px solid rgba(251,191,36,.15)', borderRadius:3 }}>
              <span className="mono" style={{ fontSize:10, color:'var(--dim)', minWidth:44 }}>Row {r.row}</span>
              <span style={{ fontSize:11, color:'#fbbf24' }}>{r.reason}</span>
            </div>
          ))}

          {tab==='errors'&&result?.errors?.map((r,i)=>(
            <div key={i} style={{ display:'flex', gap:10, padding:'7px 12px', marginBottom:4, background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.15)', borderRadius:3 }}>
              <span className="mono" style={{ fontSize:10, color:'var(--dim)', minWidth:44 }}>Row {r.row}</span>
              <span style={{ fontSize:11, color:'#f87171' }}>{r.error}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ImportPage() {
  const { data:counts, refetch } = useQuery({
    queryKey:['import-counts'],
    queryFn: ()=>importApi.counts().then(r=>r.data),
  });

  return (
    <div style={{ padding:24 }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:600, letterSpacing:'-.01em', marginBottom:4 }}>Import data</div>
        <div style={{ fontSize:11, color:'var(--muted)' }}>Upload Excel or CSV files to load existing records. Download a template first.</div>
      </div>

      {/* how it works */}
      <div style={{ background:'rgba(200,148,10,.04)', border:'1px solid rgba(200,148,10,.15)', borderRadius:6, padding:'14px 18px', marginBottom:20 }}>
        <div style={{ fontSize:10, color:'var(--accent)', letterSpacing:'.08em', textTransform:'uppercase', marginBottom:10, fontWeight:600 }}>How it works</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {[
            ['1. Download template','Click ↓ Template to get the correct Excel layout'],
            ['2. Fill your data',   'Add records — one per row, match column names exactly'],
            ['3. Upload & preview', 'Drop the file in — first 10 rows preview instantly'],
            ['4. Import',          'Click Import → to load into MongoDB. Skip or Overwrite duplicates.'],
          ].map(([h,t])=>(
            <div key={h}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--text)', marginBottom:4 }}>{h}</div>
              <div style={{ fontSize:10, color:'var(--muted)', lineHeight:1.6 }}>{t}</div>
            </div>
          ))}
        </div>
      </div>

      {/* DB counts */}
      {counts && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, padding:'14px 18px', marginBottom:20 }}>
          <div className="label-xs" style={{ marginBottom:10 }}>Records in database</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10 }}>
            {[
              { l:'Customers',    v:counts.customers },
              { l:'Vehicles',     v:counts.vehicles },
              { l:'Sales',        v:counts.sales },
              { l:'Service jobs', v:counts.service_jobs },
              { l:'Spare parts',  v:counts.spare_parts },
              { l:'Staff',        v:counts.users },
            ].map(({l,v})=>(
              <div key={l} style={{ textAlign:'center' }}>
                <div style={{ fontSize:9, color:'var(--dim)', marginBottom:4 }}>{l}</div>
                <div className="display" style={{ fontSize:20, fontWeight:800, color:v>0?'var(--accent)':'var(--dim)' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* import cards */}
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {ENTITIES.map(e=><ImportCard key={e.id} cfg={e} onRefreshCounts={refetch} />)}
      </div>
    </div>
  );
}
