import { useEffect, useState, type DragEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Camera, ClipboardPaste, CloudUpload, Download, RefreshCw } from 'lucide-react';

interface Preset {
  label: string;
  icon: LucideIcon;
  iconClass: string;
}

const PRESETS: Preset[] = [
  { label: 'Clipboard Text', icon: ClipboardPaste, iconClass: 'text-indigo-500' },
  { label: 'Screenshots', icon: Camera, iconClass: 'text-emerald-500' },
  { label: 'Recent Downloads', icon: Download, iconClass: 'text-amber-500' },
];

const DEFAULT_TEXT = 'Drop files, photos, or text snippet here';

export default function UniversalDrop() {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [zoneText, setZoneText] = useState<string>(DEFAULT_TEXT);

  useEffect(() => {
    if (zoneText === DEFAULT_TEXT) return;
    const timer = window.setTimeout(() => setZoneText(DEFAULT_TEXT), 2000);
    return () => window.clearTimeout(timer);
  }, [zoneText]);

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
    const count = event.dataTransfer?.files ? event.dataTransfer.files.length : 1;
    setZoneText(`Dispatched: ${count} dropped item(s)`);
  };

  const handlePreset = (label: string): void => {
    setZoneText(`Dispatched: ${label}`);
  };

  return (
    <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/80 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
            <RefreshCw className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Universal Drop</h3>
            <p className="text-xs text-slate-500">Drop files or text here to sync across devices</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>3 paired devices active</span>
        </div>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
            Syncs instantly via end-to-end local airbridge
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {PRESETS.map((preset) => {
            const Icon = preset.icon;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePreset(preset.label)}
                className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-medium hover:border-slate-300 shadow-2xs flex items-center gap-1.5"
              >
                <Icon className={`w-[15px] h-[15px] ${preset.iconClass}`} aria-hidden="true" />
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
