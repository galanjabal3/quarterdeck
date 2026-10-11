import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { CloudUpload, FolderOpen, RefreshCw } from 'lucide-react';

const DEFAULT_TEXT = 'Drop files, photos, or text snippet here';

const MAX_VISIBLE_FILES = 5;

interface PickedFile {
  name: string;
  size: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UniversalDrop() {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [zoneText, setZoneText] = useState<string>(DEFAULT_TEXT);
  const [pickedFiles, setPickedFiles] = useState<PickedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-reset hanya untuk feedback tanpa daftar file — pilihan file tetap
  // ditampilkan sampai user memilih yang lain.
  useEffect(() => {
    if (zoneText === DEFAULT_TEXT || pickedFiles.length > 0) return;
    const timer = window.setTimeout(() => setZoneText(DEFAULT_TEXT), 2000);
    return () => window.clearTimeout(timer);
  }, [zoneText, pickedFiles]);

  // Satu jalur preview dipakai drag & drop maupun file picker.
  const showFiles = (files: File[], message: string): void => {
    setPickedFiles(files.map((file) => ({ name: file.name, size: file.size })));
    setZoneText(message);
  };

  const openFilePicker = (): void => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
    showFiles(files, `Received ${files.length || 1} dropped item(s) — nothing is uploaded`);
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    showFiles(files, `Selected ${files.length} file(s) — nothing is uploaded`);
    event.target.value = ''; // reset supaya file yang sama bisa dipilih ulang
  };

  const handleZoneClick = (): void => {
    openFilePicker();
  };

  const handleZoneKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFilePicker();
    }
  };

  const visibleFiles = pickedFiles.slice(0, MAX_VISIBLE_FILES);

  return (
    <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/80 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
            <RefreshCw className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Universal Drop</h3>
            <p className="text-xs text-slate-500">
              Local drop zone — everything stays on this device
            </p>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileInput}
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleZoneClick}
        onKeyDown={handleZoneKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Drop files here or press Enter to browse"
        className={`w-full border-2 border-dashed transition-all rounded-casual-card p-8 flex flex-col items-center justify-center text-center gap-3 cursor-pointer group ${
          isDragging
            ? 'bg-white border-indigo-400'
            : 'bg-slate-50/70 border-slate-300 hover:border-indigo-400 hover:bg-white'
        }`}
      >
        <div className="w-14 h-14 rounded-casual-card bg-white text-indigo-600 group-hover:scale-105 shadow-sm border border-slate-200 flex items-center justify-center transition-all">
          <CloudUpload className="w-7 h-7" aria-hidden="true" />
        </div>
        <div>
          <span className="text-sm font-bold text-slate-800 block">{zoneText}</span>
          <span className="text-xs text-slate-500">
            Preview only — files are never uploaded, synced, or sent anywhere
          </span>
        </div>
        <div className="flex flex-col items-center gap-2 pt-1 w-full">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openFilePicker();
            }}
            className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-medium hover:border-slate-300 shadow-2xs flex items-center gap-1.5"
          >
            <FolderOpen className="w-[15px] h-[15px] text-indigo-500" aria-hidden="true" />
            <span>Browse files</span>
          </button>
          {visibleFiles.length > 0 && (
            <ul className="w-full max-w-sm flex flex-col gap-1.5 pt-1">
              {visibleFiles.map((file, index) => (
                <li
                  key={`${index}-${file.name}`}
                  className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-left"
                >
                  <span className="text-xs text-slate-700 truncate">{file.name}</span>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {formatSize(file.size)}
                  </span>
                </li>
              ))}
              {pickedFiles.length > MAX_VISIBLE_FILES && (
                <li className="text-[11px] text-slate-400 px-1 text-left">
                  +{pickedFiles.length - MAX_VISIBLE_FILES} more
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
