import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { filesApi } from '../api/client';

  export default function FileUpload({ label, onUploadSuccess, existingFileId = null }) {
  const [uploading, setUploading] = useState(false);
  const [previewId, setPreviewId] = useState(existingFileId);
  const [blob, setBlob] = useState(null); // { id, url, isImage } from an authenticated fetch

  // Fetch through the API client (Bearer token) instead of linking to the API origin,
  // so an uploaded file never opens as a page on the cookie-authenticated API host.
  useEffect(() => {
    if (!previewId) return undefined;
    let url = null, cancelled = false;
    filesApi.getFileBlob(previewId)
      .then(data => {
        url = URL.createObjectURL(data);
        if (cancelled) URL.revokeObjectURL(url);
        else setBlob({ id: previewId, url, isImage: data.type.startsWith('image/') });
      })
      .catch(() => {});
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [previewId]);
  const preview = blob && blob.id === previewId ? blob : null;

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
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={handleFileChange} 
          disabled={uploading}
        />
        {uploading && <span role="status" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>Uploading…</span>}
      </div>

      {previewId && (
        <div style={{ marginTop: '10px', display:'flex', alignItems:'flex-start', gap:10 }}>
          {preview?.isImage ? (
            <a href={preview.url} target="_blank" rel="noopener noreferrer" style={{ display:'block' }}>
              <img
                src={preview.url}
                alt="Preview"
                width="90" height="90"
                style={{ height:90, width:90, borderRadius:'var(--radius-control)', border:'1px solid var(--color-rule)', objectFit:'cover', display:'block' }}
              />
            </a>
          ) : preview ? (
            <a href={preview.url} download className="btn btn-ghost btn-sm">Download file</a>
          ) : null}
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <span style={{ fontSize:'var(--text-xs)', color:'var(--color-muted)' }}>Uploaded</span>
            <button
              type="button"
              onClick={() => { setPreviewId(null); if (onUploadSuccess) onUploadSuccess(null); }}
              className="btn btn-ghost btn-sm"
              style={{ color:'var(--color-error)' }}
            >Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}
