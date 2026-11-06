import React, { useState } from 'react';
import { 
  ClipboardList, 
  Download, 
  AlertTriangle, 
  AlertOctagon, 
  Info, 
  Filter,
  CheckCircle2
} from 'lucide-react';
import { IncidentEvent } from '../types/telemetry';
import { cabAudio } from '../utils/audio';

interface ShiftLogViewProps {
  events: IncidentEvent[];
  driverId: string;
  cabUnitId: string;
  onClearLogs: () => void;
}

export const ShiftLogView: React.FC<ShiftLogViewProps> = ({
  events,
  driverId,
  cabUnitId,
  onClearLogs,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'warning' | 'emergency'>('all');

  const filtered = events.filter((e) => {
    if (filterSeverity === 'all') return true;
    return e.severity === filterSeverity;
  });

  const exportCsv = () => {
    cabAudio.playKeyClick();
    const headers = 'ID,Timestamp,Severity,Code,Title,Description\n';
    const rows = events
      .map(
        (e) =>
          `"${e.id}","${e.timestamp}","${e.severity}","${e.code}","${e.title}","${e.description.replace(/"/g, '""')}"`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drivelock-shift-log-${cabUnitId}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Shift Log Header */}
      <div className="bg-[#161b22] border border-[#30363d] rounded p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-[#1c2b3c] border border-[#30363d] flex items-center justify-center text-[#ffc174]">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-headline font-bold text-white">
              Shift Incident Log & Audit Trail
            </h3>
            <p className="text-xs font-mono text-[#94a3b8]">
              UNIT: #{cabUnitId} · OPERATOR: {driverId} · TOTAL EVENTS: {events.length}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter segment */}
          <div className="flex items-center bg-[#0d1c2d] p-0.5 rounded border border-[#30363d] text-xs font-mono">
            {(['all', 'warning', 'emergency'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => {
                  cabAudio.playKeyClick();
                  setFilterSeverity(sev);
                }}
                className={`px-2.5 py-1 rounded capitalize transition-colors ${
                  filterSeverity === sev
                    ? 'bg-[#f59e0b] text-[#0d1117] font-bold'
                    : 'text-[#94a3b8] hover:text-white'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          <button
            onClick={exportCsv}
            className="px-3.5 py-1.5 rounded font-mono text-xs font-bold bg-[#1c2b3c] hover:bg-[#273647] text-white border border-[#30363d] flex items-center gap-1.5"
            title="Download CSV Audit Report"
          >
            <Download className="w-3.5 h-3.5 text-[#4edea3]" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* Events List */}
      <div className="bg-[#161b22] border border-[#30363d] rounded overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center font-mono text-xs text-[#94a3b8]">
            <CheckCircle2 className="w-8 h-8 text-[#10b981] mx-auto mb-2" />
            NO EVENTS MATCHING FILTER.
          </div>
        ) : (
          <div className="divide-y divide-[#30363d]">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="p-3.5 sm:p-4 hover:bg-[#1c2b3c]/50 transition-colors flex items-start gap-3.5"
              >
                <div
                  className={`w-7 h-7 rounded shrink-0 flex items-center justify-center mt-0.5 ${
                    item.severity === 'emergency'
                      ? 'bg-[#ef4444] text-white'
                      : item.severity === 'warning'
                      ? 'bg-[#f59e0b] text-[#0d1117]'
                      : 'bg-[#1c2b3c] text-[#4edea3]'
                  }`}
                >
                  {item.severity === 'emergency' ? (
                    <AlertOctagon className="w-4 h-4" />
                  ) : item.severity === 'warning' ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <Info className="w-4 h-4" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-headline font-bold text-white text-sm">
                        {item.title}
                      </span>
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-[#0d1c2d] border border-[#30363d] text-[#94a3b8] uppercase">
                        {item.code}
                      </span>
                    </div>

                    <span className="font-mono text-xs text-[#94a3b8] shrink-0">
                      {item.timestamp}
                    </span>
                  </div>

                  <p className="text-xs font-body text-[#d4e4fa] mt-1">
                    {item.description}
                  </p>

                  {item.telemetrySnapshot && (
                    <div className="mt-2 text-[11px] font-mono text-[#94a3b8] bg-[#0d1c2d] px-2 py-1 rounded inline-block">
                      SPEED: {item.telemetrySnapshot.speedKmh} KM/H · LOCATION: {item.telemetrySnapshot.location}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
