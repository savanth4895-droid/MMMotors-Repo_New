import { useState } from 'react';
import toast from 'react-hot-toast';
import { filesApi } from '../api/client';

  export default function FileUpload({ label, onUploadSuccess, existingFileId = null }) {
  const [uploading, setUploading] = useState(false);
  const [previewId, setPreviewId] = useState(existingFileId);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const data = await filesApi.upload(file);
      
      setPreviewId(data.file_id);
      toast.success('File uploaded successfully!');
      
      if (onUploadSuccess) onUploadSuccess(data.file_id, data.filename);
      
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ marginBottom: '15px' }}>
      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '12px' }}>
        {label}
      </label>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <input 
          type="file" 
          onChange={handleFileChange} 
          disabled={uploading}
          style={{ fontSize: '12px' }}
        />
        {uploading && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Uploading...</span>}
      </div>

      {previewId && (
        <div style={{ marginTop: '10px', display:'flex', alignItems:'flex-start', gap:10 }}>
          <a href={filesApi.getFileUrl(previewId)} target="_blank" rel="noreferrer" style={{ display:'block' }}>
            <img
              src={filesApi.getFileUrl(previewId)}
              alt="Preview"
              style={{ height:90, width:90, borderRadius:4, border:'1px solid var(--border)', objectFit:'cover', display:'block' }}
            />
          </a>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <span style={{ fontSize:10, color:'var(--muted)' }}>Uploaded</span>
            <button
              type="button"
              onClick={() => { setPreviewId(null); if (onUploadSuccess) onUploadSuccess(null); }}
              style={{ fontSize:10, padding:'2px 8px', background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:3, color:'var(--red,#ef4444)', cursor:'pointer' }}
            >Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}
