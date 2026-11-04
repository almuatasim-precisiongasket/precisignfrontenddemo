import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { PenTool, Type, Upload, Check, RotateCcw, Shield, User } from 'lucide-react';

export const UserProfileView: React.FC = () => {
  const { currentUser, updateUserSignature, users, setCurrentUserId, readOnly: connected } = useApp();

  const [activeTab, setActiveTab] = useState<'style' | 'draw' | 'upload'>('style');
  const [signatureText, setSignatureText] = useState(
    currentUser.signatureStyleText || currentUser.name
  );
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const saveLock = useRef(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);
  const hasDrawn = useRef(false);

  // Canvas drawing
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo((e.clientX - rect.left) * canvas.width / rect.width, (e.clientY - rect.top) * canvas.height / rect.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e3a8a';
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo((e.clientX - rect.left) * canvas.width / rect.width, (e.clientY - rect.top) * canvas.height / rect.height);
    ctx.stroke();
    hasDrawn.current = true;
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
  };

  const generateDataUrl = (text: string): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "italic 44px 'Caveat', cursive, sans-serif";
      ctx.fillStyle = '#1e3a8a';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 20, 60);
    }
    return canvas.toDataURL('image/png');
  };

  const handleSaveSignature = async () => {
    if (saveLock.current || reading) return;
    let finalUrl = '';
    if ((activeTab === 'draw' && !hasDrawn.current) || (activeTab === 'style' && !signatureText.trim())) {
      setFeedback('Please provide a signature using the selected method.');
      return;
    }
    if (activeTab === 'draw' && canvasRef.current) {
      finalUrl = canvasRef.current.toDataURL('image/png');
    } else if (activeTab === 'upload') {
      if (!uploaded && !currentUser.signatureDataUrl) {
        setFeedback('Please upload a signature image first.');
        return;
      }
      finalUrl = uploaded || currentUser.signatureDataUrl!;
    } else {
      finalUrl = generateDataUrl(signatureText);
    }

    saveLock.current = true; setSaving(true);
    try {
      await updateUserSignature(currentUser.id, finalUrl, connected ? currentUser.name : signatureText);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not save signature.');
      return;
    } finally { saveLock.current = false; setSaving(false); }
    setFeedback(`Signature profile updated successfully for ${currentUser.name}.`);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2*1024*1024 || !['image/png','image/jpeg'].includes(file.type)) { setFeedback('Choose a PNG or JPEG up to 2 MiB.'); return; }
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => { setReading(false); setUploaded(String(reader.result)); setFeedback('Image selected. Save your profile to register it.'); };
    reader.onerror = () => { setReading(false); setFeedback('Could not read the selected image.'); };
    reader.readAsDataURL(file);
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="pb-4 border-b border-[#E2E5E9]">
        <h1 className="text-xl font-bold text-[#192B3C] tracking-tight">
          User Profile &amp; E-Signature Registration
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Configure your signature for document approvals.
        </p>
      </div>

      {feedback && (
        <div role="status" className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 flex items-center gap-2">
          {feedback.startsWith('Signature profile updated successfully') && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
          <span>{feedback}</span>
        </div>
      )}

      {/* User profile card */}
      <div className="bg-white border border-[#E2E5E9] rounded-lg p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-md flex items-center justify-center text-lg font-bold text-white shadow-xs"
            style={{ backgroundColor: currentUser.avatarColor || '#365C78' }}
          >
            {currentUser.initials}
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#192B3C]">{currentUser.name}</h2>
            <div className="text-xs font-semibold text-[#365C78]">{currentUser.role}</div>
            <div className="text-xs text-slate-500">
              {currentUser.department} · {currentUser.email}
            </div>
          </div>
        </div>

        {/* Persona quick switch */}
        {!connected && <div className="text-right">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Demo Persona Switcher:
          </label>
          <select
            value={currentUser.id}
            onChange={(e) => setCurrentUserId(e.target.value)}
            className="p-1.5 border border-[#CBD5E1] rounded text-xs font-semibold text-slate-800 bg-[#F5F6F8] cursor-pointer"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {u.role}
              </option>
            ))}
          </select>
        </div>}
      </div>

      {currentUser.signatureDataUrl && <img src={currentUser.signatureDataUrl} alt="Saved signature" className="max-h-24" />}
      {/* E-Signature setup container */}
      <div className="bg-white border border-[#E2E5E9] rounded-lg p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#192B3C]">
              Electronic Signature Studio
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Each request still requires explicit signature confirmation. Existing signed requests keep their original marks.
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-[#E2E5E9] gap-2">
          <button
            onClick={() => setActiveTab('style')}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'style'
                ? 'border-[#365C78] text-[#192B3C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>Handwritten Style</span>
          </button>

          <button
            onClick={() => { hasDrawn.current = false; setActiveTab('draw'); }}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'draw'
                ? 'border-[#365C78] text-[#192B3C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Draw with Mouse / Pen</span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'upload'
                ? 'border-[#365C78] text-[#192B3C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Image</span>
          </button>
        </div>

        {/* Tab contents */}
        {activeTab === 'style' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Name to render in cursive script:
              </label>
              <input
                type="text"
                value={signatureText}
                readOnly={connected}
                onChange={(e) => setSignatureText(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-[#CBD5E1] rounded focus:outline-none focus:ring-1 focus:ring-[#365C78]"
              />
            </div>

            <div className="p-6 bg-[#F5F6F8] border border-[#E2E5E9] rounded-md flex items-center justify-center min-h-[120px]">
              <div
                className="text-blue-900 text-4xl font-bold tracking-wider italic select-none"
                style={{ fontFamily: "'Caveat', cursive" }}
              >
                {signatureText || currentUser.name}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'draw' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Use your mouse or stylus to draw your signature:</span>
              <button
                onClick={clearCanvas}
                className="text-[#365C78] hover:underline font-semibold flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear Canvas</span>
              </button>
            </div>
            <div className="border border-[#CBD5E1] rounded-md overflow-hidden bg-white">
              <canvas
                ref={canvasRef}
                width={500}
                height={150}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="w-full h-[150px] cursor-crosshair"
              />
            </div>
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="space-y-3">
            <div className="border-2 border-dashed border-[#CBD5E1] rounded-md p-6 text-center hover:bg-[#F9FAFB] transition-colors">
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleImageUpload}
                className="hidden"
                id="profile-sig-file"
              />
              <label htmlFor="profile-sig-file" className="cursor-pointer space-y-1 block">
                <Upload className="w-6 h-6 mx-auto text-slate-400" />
                <span className="text-xs font-semibold text-[#365C78] hover:underline block">
                  Select PNG or JPEG image
                </span>
                <span className="text-[10px] text-slate-400 block">Maximum file size 2MB</span>
              </label>
            </div>
          </div>
        )}

        {uploaded && <img src={uploaded} alt="Selected signature" className="max-h-24" />}
        {/* Save button */}
        <div className="pt-3 border-t border-[#E2E5E9] flex justify-end">
          <button
            disabled={saving || reading}
            onClick={handleSaveSignature}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#365C78] hover:bg-[#2A4A62] text-white rounded-md text-xs font-semibold shadow-xs transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving…' : 'Save E-Signature Profile'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
