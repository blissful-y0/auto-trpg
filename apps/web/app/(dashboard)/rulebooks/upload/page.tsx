'use client';

import { useState, useRef } from 'react';

export default function RulebookUploadPage() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
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
    if (e.dataTransfer.files?.[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    // Mock 업로드 진행률
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setUploading(false);
          return 100;
        }
        return prev + 10;
      });
    }, 300);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-heading-1 text-text-primary mb-2">규칙서 업로드</h2>
      <p className="text-text-secondary mb-8">
        PDF 형식의 TRPG 규칙서를 업로드하세요
      </p>

      {/* 파일 드래그&드롭 영역 */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
          dragActive
            ? 'border-gold bg-gold/10'
            : 'border-line-strong hover:border-line-strong'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="text-4xl mb-4">📄</div>
        {file ? (
          <div>
            <p className="text-text-primary font-medium">{file.name}</p>
            <p className="text-body-sm text-text-secondary mt-1">
              {(file.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
        ) : (
          <div>
            <p className="text-text-secondary">파일을 드래그하거나 클릭하여 선택</p>
            <p className="text-body-sm text-text-tertiary mt-1">PDF 파일만 지원</p>
          </div>
        )}
      </div>

      {/* 업로드 진행률 */}
      {uploading && (
        <div className="mt-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-text-secondary">업로드 중...</span>
            <span className="text-text-tertiary">{progress}%</span>
          </div>
          <div className="h-2 bg-bg-overlay rounded-full overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {progress === 100 && (
        <div className="mt-6 p-4 bg-success/10 border border-success/30 rounded-lg">
          <p className="text-success text-body-sm">
            업로드 완료! 규칙서가 처리 중입니다. 완료되면 세션에서 사용할 수 있습니다.
          </p>
        </div>
      )}

      {/* 업로드 버튼 */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="btn-primary flex-1 disabled:opacity-50"
        >
          {uploading ? '업로드 중...' : '업로드'}
        </button>
      </div>
    </div>
  );
}
