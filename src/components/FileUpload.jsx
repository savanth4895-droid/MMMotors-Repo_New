import { useState } from 'react';
import toast from 'react-hot-toast';
import { filesApi } from '../api/client';

export default function FileUpload({ label, onUploadSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [previewId, setPreviewId] = useState(null);

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
        <div style={{ marginTop: '10px' }}>
          <a href={filesApi.getFileUrl(previewId)} target="_blank" rel="noreferrer">
             <img 
               src={filesApi.getFileUrl(previewId)} 
               alt="Preview" 
               style={{ height: '80px', borderRadius: '4px', border: '1px solid var(--border)', objectFit: 'cover' }} 
             />
          </a>
        </div>
      )}
    </div>
  );
}
