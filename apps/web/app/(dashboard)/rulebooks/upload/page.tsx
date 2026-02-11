'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Upload, FileText, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { rulebookApi } from '@/lib/api';

type UploadStep = 'idle' | 'registering' | 'uploading' | 'processing' | 'done' | 'error';

const STEP_LABELS: Record<UploadStep, { title: string; desc: string }> = {
  idle: { title: '', desc: '' },
  registering: { title: '등록 중...', desc: '서버에 규칙서 정보를 등록하고 있습니다' },
  uploading: { title: '업로드 중...', desc: '파일을 클라우드 저장소에 업로드하고 있습니다' },
  processing: { title: '처리 시작...', desc: '규칙서 분석 및 AI 참조 데이터 생성을 시작합니다' },
  done: { title: '업로드 완료!', desc: '규칙서 처리가 백그라운드에서 진행됩니다. 완료되면 세션에서 사용할 수 있습니다' },
  error: { title: '업로드 실패', desc: '' },
};

const gameSystems = [
  { id: 'dnd5e', name: 'D&D 5th Edition' },
  { id: 'pathfinder2e', name: 'Pathfinder 2e' },
  { id: 'coc7e', name: 'Call of Cthulhu 7e' },
  { id: 'custom', name: '커스텀 시스템' },
];

export default function RulebookUploadPage() {
  const router = useRouter();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [gameSystem, setGameSystem] = useState('dnd5e');
  const [step, setStep] = useState<UploadStep>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validateAndSetFile(dropped);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) validateAndSetFile(selected);
  };

  const validateAndSetFile = (f: File) => {
    if (f.type !== 'application/pdf') {
      toast.error('PDF 파일만 업로드할 수 있습니다');
      return;
    }
    if (f.size > 100 * 1024 * 1024) {
      toast.error('파일 크기는 100MB 이하여야 합니다');
      return;
    }
    setFile(f);
    if (!title) {
      setTitle(f.name.replace(/\.pdf$/i, ''));
    }
    setStep('idle');
    setErrorMessage('');
  };

  const handleUpload = async () => {
    if (!file) return;
    if (!title.trim()) {
      toast.error('규칙서 제목을 입력해주세요');
      return;
    }

    setStep('registering');
    setErrorMessage('');

    try {
      await rulebookApi.upload(file, title.trim(), gameSystem, (s) => setStep(s));
      setStep('done');
      toast.success('업로드 완료! 규칙서 처리가 시작되었습니다.');
    } catch (err) {
      setStep('error');
      const message = err instanceof Error ? err.message : '업로드에 실패했습니다';
      setErrorMessage(message);
      toast.error(message);
    }
  };

  const handleReset = () => {
    setFile(null);
    setTitle('');
    setStep('idle');
    setErrorMessage('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const isProcessing = step === 'registering' || step === 'uploading' || step === 'processing';

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-body-sm text-text-secondary hover:text-text-primary mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        돌아가기
      </button>

      <h2 className="text-heading-1 text-text-primary mb-2 flex items-center gap-2">
        <Upload size={24} className="text-gold" />
        규칙서 업로드
      </h2>
      <p className="text-text-secondary mb-8 text-body-sm">
        PDF 형식의 TRPG 규칙서를 업로드하면 AI GM이 규칙을 참조합니다
      </p>

      {/* 파일 드래그&드롭 영역 */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => step === 'idle' && inputRef.current?.click()}
        className={`card border-2 border-dashed rounded-xl p-12 text-center transition-all ${
          isProcessing || step === 'done'
            ? 'cursor-default'
            : dragActive
              ? 'border-gold bg-gold/10 cursor-pointer'
              : 'border-line-strong hover:border-gold/50 cursor-pointer'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="hidden"
        />

        {file ? (
          <div className="flex flex-col items-center">
            <FileText size={40} className="text-gold mb-3" />
            <p className="text-text-primary font-medium">{file.name}</p>
            <p className="text-body-sm text-text-tertiary mt-1">
              {(file.size / (1024 * 1024)).toFixed(2)} MB
            </p>
            {step === 'idle' && (
              <button
                onClick={(e) => { e.stopPropagation(); handleReset(); }}
                className="mt-3 text-body-sm text-text-tertiary hover:text-danger transition-colors"
              >
                파일 변경
              </button>
            )}
          </div>
        ) : (
          <div>
            <Upload size={40} className="text-text-tertiary mx-auto mb-3" />
            <p className="text-text-secondary">파일을 드래그하거나 클릭하여 선택</p>
            <p className="text-body-sm text-text-tertiary mt-1">PDF 파일만 지원 (최대 100MB)</p>
          </div>
        )}
      </div>

      {/* 제목 + 시스템 입력 (파일 선택 후) */}
      {file && step === 'idle' && (
        <div className="mt-6 space-y-4">
          <div className="card p-5">
            <label className="block text-body-sm font-medium text-text-primary mb-2">
              규칙서 제목
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: D&D 5e Player's Handbook"
              className="input-field"
              required
            />
          </div>
          <div className="card p-5">
            <label className="block text-body-sm font-medium text-text-primary mb-2">
              게임 시스템
            </label>
            <select
              value={gameSystem}
              onChange={(e) => setGameSystem(e.target.value)}
              className="input-field"
            >
              {gameSystems.map((sys) => (
                <option key={sys.id} value={sys.id}>{sys.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* 상태 표시 */}
      {isProcessing && (
        <div className="mt-6 flex items-center gap-3 p-4 card">
          <Loader2 size={20} className="animate-spin text-gold shrink-0" />
          <div>
            <p className="text-text-primary text-sm font-medium">{STEP_LABELS[step].title}</p>
            <p className="text-text-tertiary text-xs mt-0.5">{STEP_LABELS[step].desc}</p>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="mt-6 p-4 bg-success/10 border border-success/30 rounded-xl flex items-center gap-3">
          <CheckCircle2 size={20} className="text-success shrink-0" />
          <div>
            <p className="text-success text-sm font-medium">{STEP_LABELS.done.title}</p>
            <p className="text-text-tertiary text-xs mt-0.5">{STEP_LABELS.done.desc}</p>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="mt-6 p-4 bg-danger/10 border border-danger/30 rounded-xl">
          <p className="text-danger text-sm font-medium">{STEP_LABELS.error.title}</p>
          <p className="text-text-tertiary text-xs mt-0.5">{errorMessage}</p>
        </div>
      )}

      {/* 버튼 영역 */}
      <div className="mt-6 flex gap-3">
        {step === 'done' ? (
          <>
            <button
              onClick={handleReset}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <Upload size={16} />
              다른 규칙서 업로드
            </button>
            <button
              onClick={() => router.push('/rulebooks')}
              className="flex-1 py-2.5 rounded-xl border border-line text-text-secondary hover:text-text-primary hover:border-line-strong transition-all text-center"
            >
              규칙서 목록으로
            </button>
          </>
        ) : step === 'error' ? (
          <>
            <button
              onClick={handleUpload}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              다시 시도
            </button>
            <button
              onClick={handleReset}
              className="flex-1 py-2.5 rounded-xl border border-line text-text-secondary hover:text-text-primary hover:border-line-strong transition-all text-center"
            >
              파일 변경
            </button>
          </>
        ) : (
          <button
            onClick={handleUpload}
            disabled={!file || isProcessing}
            className="btn-primary flex-1 py-2.5 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                처리 중...
              </>
            ) : (
              <>
                <Upload size={16} />
                업로드
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
