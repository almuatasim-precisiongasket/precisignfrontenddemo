import { WorkspaceDialog } from '../common/WorkspaceDialog';
import React, { useRef, useState, useEffect } from 'react';
import { UserProfile } from '../../types/index';
import { X, PenTool, Type, Upload, Check, Shield } from 'lucide-react';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  title?: string;
  confirmLabel?: string;
  noteLabel?: string;
  onConfirm: (signatureDataUrl: string, note?: string) => Promise<{ success: boolean; error?: string } | undefined>;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  user,
  title = 'Confirm Digital E-Signature',
  confirmLabel = 'Confirm & Apply Signature',
  noteLabel,
  onConfirm,
}) => {
  const [tab, setTab] = useState<'style' | 'draw' | 'upload'>('style');
  const [styledName, setStyledName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const savingRef = useRef(false);
  const [drawnDataUrl, setDrawnDataUrl] = useState<string | null>(null);
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setStyledName(user.name);
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  // Canvas drawing functions
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x * canvas.width / rect.width, y * canvas.height / rect.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e3a8a';
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineTo(x * canvas.width / rect.width, y * canvas.height / rect.height);
    ctx.stroke();
    setDrawnDataUrl(canvas.toDataURL('image/png'));
  };

  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setDrawnDataUrl(null);
  };

  // Convert styled text to data URL via offscreen canvas
  const generateStyleDataUrl = (text: string): string => {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 400;
    offCanvas.height = 120;
    const ctx = offCanvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, offCanvas.width, offCanvas.height);
      ctx.font = "italic 44px 'Caveat', cursive, sans-serif";
      ctx.fillStyle = '#1e3a8a';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 24, 60);
    }
    return offCanvas.toDataURL('image/png');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg'].includes(file.type)) {
      setSignatureError('Choose a PNG or JPEG signature up to 2 MiB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAndConfirm = async () => {
    if (savingRef.current) return;
    if ((tab === 'style' && !styledName.trim()) || (tab === 'draw' && !drawnDataUrl) || (tab === 'upload' && !uploadedDataUrl)) {
      setSignatureError('Please provide a signature using the selected method.');
      return;
    }
    setSignatureError(null);
    let finalDataUrl = '';
    if (tab === 'draw' && drawnDataUrl) {
      finalDataUrl = drawnDataUrl;
    } else if (tab === 'upload' && uploadedDataUrl) {
      finalDataUrl = uploadedDataUrl;
    } else {
      finalDataUrl = generateStyleDataUrl(styledName);
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await onConfirm(finalDataUrl, noteLabel ? note.trim() || undefined : undefined);
      if (result?.success) onClose();
      else setSignatureError(result?.error || 'The save was not confirmed. Your signature and entries are preserved.');
    } catch {
      setSignatureError('The save was not confirmed. Your signature and entries are preserved. Check the connection before trying again.');
    } finally { savingRef.current = false; setSaving(false); }
  };

  return (
    <WorkspaceDialog titleId="signature-dialog-title" onClose={onClose} busy={saving} className="max-w-lg">
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-[#E2E5E9] bg-[#F5F6F8]">
          <div className="min-w-0 pr-2">
            <h2 id="signature-dialog-title" className="text-sm font-bold text-workspace-ink">{title}</h2>
            <p className="text-[11px] sm:text-xs text-slate-500 truncate">
              Signing as <span className="font-semibold text-slate-800">{user.name}</span>
            </p>
          </div>
          <button
            type="button"
            aria-label="Close signature dialog"
            data-dialog-focus
            disabled={saving}
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab selection */}
        <fieldset disabled={saving} className="flex border-b border-[#E2E5E9] px-4 sm:px-6 pt-2.5 sm:pt-3 bg-white overflow-x-auto">
          <button
            type="button"
            aria-pressed={tab === 'style'}
            onClick={() => setTab('style')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              tab === 'style'
                ? 'border-[#365C78] text-[#192B3C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>Type</span>
          </button>
          <button
            type="button"
            aria-pressed={tab === 'draw'}
            onClick={() => setTab('draw')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
              tab === 'draw'
                ? 'border-[#365C78] text-[#192B3C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Draw</span>
          </button>
          <button
            type="button"
            aria-pressed={tab === 'upload'}
            onClick={() => setTab('upload')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
              tab === 'upload'
                ? 'border-[#365C78] text-[#192B3C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>
        </fieldset>

        {/* Content */}
        <fieldset disabled={saving} className="p-6 space-y-4">
          {signatureError && <p role="alert" className="text-xs text-rose-700">{signatureError}</p>}
          {tab === 'style' && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-700">
                Signed-in name on official document:
              </label>
              <input
                type="text"
                value={styledName}
                readOnly
                className="w-full px-3 py-1.5 text-xs border border-[#CBD5E1] rounded focus:outline-none focus:ring-1 focus:ring-[#365C78]"
                placeholder="e.g. Afzal Kazi"
              />
              <div className="p-4 bg-[#F5F6F8] border border-dashed border-[#CBD5E1] rounded-md flex items-center justify-center min-h-[90px]">
                <div
                  className="text-blue-900 text-3xl font-bold tracking-wider italic select-none"
                  style={{ fontFamily: "'Caveat', cursive" }}
                >
                  {styledName || user.name}
                </div>
              </div>
            </div>
          )}

          {tab === 'draw' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Draw signature on canvas below:</span>
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="text-[#365C78] hover:underline font-semibold"
                >
                  Clear Canvas
                </button>
              </div>
              <div className="border border-[#CBD5E1] rounded-md overflow-hidden bg-[#F5F6F8]">
                <canvas
                  ref={canvasRef}
                  width={420}
                  height={130}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  style={{ touchAction: 'none' }}
                  className="w-full h-[130px] cursor-crosshair bg-white touch-none"
                />
              </div>
            </div>
          )}

          {tab === 'upload' && (
            <div className="space-y-3">
              {user.signatureDataUrl && <button type="button" className="text-xs underline" onClick={() => setUploadedDataUrl(user.signatureDataUrl!)}>Use saved signature</button>}
              <div className="border-2 border-dashed border-[#CBD5E1] rounded-md p-6 text-center hover:bg-[#F9FAFB] transition-colors">
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="sig-file-upload"
                />
                <label htmlFor="sig-file-upload" className="cursor-pointer space-y-2 block">
                  <Upload className="w-6 h-6 mx-auto text-slate-400" />
                  <span className="text-xs font-semibold text-[#365C78] hover:underline block">
                    Choose PNG or JPEG image
                  </span>
                  <span className="text-[10px] text-slate-400 block">Maximum file size 2MB</span>
                </label>
              </div>
              {uploadedDataUrl && (
                <div className="p-2 bg-[#F5F6F8] border rounded-md flex items-center justify-center max-h-[80px]">
                  <img src={uploadedDataUrl} alt="Uploaded" className="max-h-[60px] object-contain" />
                </div>
              )}
            </div>
          )}

          {noteLabel && <label className="block space-y-1 text-xs">
            <span className="font-semibold">{noteLabel} (optional)</span>
            <textarea rows={2} maxLength={2000} value={note} onChange={event => setNote(event.target.value)}
              className="workspace-control block w-full rounded-md px-3 py-2" />
            <span className="block text-slate-600">People who can open this request can read this note in its history. It stays off the official form.</span>
          </label>}

          {/* Governance Notice */}
          <div className="p-2.5 bg-slate-100 rounded-md border border-slate-200 text-[11px] text-slate-700 leading-snug flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#365C78] shrink-0" />
            <span>
              Your signature mark will be recorded with the request.
            </span>
          </div>
        </fieldset>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3.5 border-t border-[#E2E5E9] bg-[#F5F6F8]">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAndConfirm}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#365C78] hover:bg-[#2A4A62] rounded shadow-xs transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </WorkspaceDialog>
  );
};
