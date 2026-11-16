import React, { useState } from 'react';
import {
  MapPin,
  Navigation,
  ExternalLink,
  Copy,
  Check,
  Globe,
  Wifi,
  Radio,
  Compass,
} from 'lucide-react';
import {
  EmergencyCallState,
  emergencyCallManager,
  DEFAULT_CLOUD_SERVER_URL,
} from '../utils/emergencyDialer';

interface LiveCallLocationMapProps {
  callState: EmergencyCallState;
  fallbackLatitude: number;
  fallbackLongitude: number;
  fallbackUnit?: string;
}

export const LiveCallLocationMap: React.FC<LiveCallLocationMapProps> = ({
  callState,
  fallbackLatitude,
  fallbackLongitude,
  fallbackUnit = 'AUTO-101',
}) => {
  const [copied, setCopied] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverInput, setServerInput] = useState(
    callState.serverUrl || DEFAULT_CLOUD_SERVER_URL
  );
  const [mapStyle, setMapStyle] = useState<'osm' | 'google'>('google');

  const liveLoc = callState.remoteLocation;
  const lat =
    liveLoc && (liveLoc.latitude !== 0 || liveLoc.longitude !== 0)
      ? liveLoc.latitude
      : fallbackLatitude || 37.7749;
  const lon =
    liveLoc && (liveLoc.latitude !== 0 || liveLoc.longitude !== 0)
      ? liveLoc.longitude
      : fallbackLongitude || -122.4194;
  const accuracy = liveLoc?.accuracy ?? 10;
  const speedKmh = liveLoc?.speedKmh ?? 0;
  const unitId = liveLoc?.unitNumber || fallbackUnit;
  const updatedAgoSec = liveLoc?.updatedAt
    ? Math.max(0, Math.round((Date.now() - liveLoc.updatedAt) / 1000))
    : 0;

  // Bounding box for OpenStreetMap iframe around live phone coordinates
  const delta = 0.0045;
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${(
    lon - delta
  ).toFixed(6)}%2C${(lat - delta).toFixed(6)}%2C${(lon + delta).toFixed(
    6
  )}%2C${(lat + delta).toFixed(6)}&layer=mapnik&marker=${lat.toFixed(
    6
  )}%2C${lon.toFixed(6)}`;

  // Google Maps embed URL centered on the phone's exact GPS coordinates
  const googleEmbedUrl = `https://maps.google.com/maps?q=${lat.toFixed(
    6
  )},${lon.toFixed(6)}&z=16&output=embed`;

  const googleMapsExternalUrl = `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(
    6
  )},${lon.toFixed(6)}`;

  const handleCopyCoords = () => {
    navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveServerUrl = (e: React.FormEvent) => {
    e.preventDefault();
    emergencyCallManager.setServerUrl(serverInput);
    setShowServerConfig(false);
  };

  return (
    <div className="rounded-xl bg-[#071320] border-2 border-[#38bdf8] overflow-hidden shadow-xl">
      {/* Top Map Header Bar: Phone GPS Status + Server/2-IP Transport Status */}
      <div className="p-2.5 sm:p-3 bg-[#0c1f33] border-b border-[#38bdf8]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#ef4444] text-white flex items-center justify-center shrink-0 animate-pulse">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-headline font-extrabold text-white uppercase">
                LIVE PHONE GPS LOCATION ON MAP ({unitId})
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10b981] text-black font-extrabold uppercase">
                LIVE GPS STREAM · {updatedAgoSec === 0 ? 'NOW' : `${updatedAgoSec}s AGO`}
              </span>
            </div>
            <p className="text-[11px] font-mono text-[#94a3b8]">
              LAT <strong className="text-white">{lat.toFixed(6)}</strong> · LON{' '}
              <strong className="text-white">{lon.toFixed(6)}</strong> · ACCURACY: ±
              {Math.round(accuracy)}m · SPEED: {speedKmh} km/h
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setMapStyle(mapStyle === 'google' ? 'osm' : 'google')}
            className="px-2.5 py-1 rounded bg-[#162a40] hover:bg-[#1e3854] text-[#38bdf8] border border-[#38bdf8]/40 font-mono text-[10px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <Compass className="w-3 h-3" />
            <span>{mapStyle === 'google' ? 'SWITCH TO OSM MAP' : 'SWITCH TO GOOGLE MAP'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowServerConfig(!showServerConfig)}
            className="px-2.5 py-1 rounded bg-[#162a40] hover:bg-[#1e3854] text-[#4edea3] border border-[#10b981]/40 font-mono text-[10px] font-bold flex items-center gap-1 cursor-pointer"
            title="Configure Internet Server URL or Local Wi-Fi IP for 2-IP Phone <-> Laptop calling"
          >
            <Globe className="w-3 h-3" />
            <span>
              {callState.transportMode === 'webrtc-p2p'
                ? '2-IP WEBRTC LIVE'
                : callState.transportMode === 'server-relay'
                ? '2-IP SERVER RELAY'
                : 'SERVER / WI-FI IP'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleCopyCoords}
            className="px-2.5 py-1 rounded bg-[#1c2b3c] hover:bg-[#273647] text-white border border-white/20 font-mono text-[10px] font-bold flex items-center gap-1 cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-[#10b981]" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'COPIED' : 'COPY GPS'}</span>
          </button>

          <a
            href={googleMapsExternalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded bg-[#10b981] hover:bg-[#059669] text-black font-headline font-extrabold text-[10px] flex items-center gap-1 cursor-pointer"
          >
            <ExternalLink className="w-3 h-3" />
            <span>GOOGLE MAPS</span>
          </a>
        </div>
      </div>

      {/* Optional Server / Wi-Fi IP Configurator for 2-IP / LAN operation */}
      {showServerConfig && (
        <form
          onSubmit={handleSaveServerUrl}
          className="p-2.5 bg-[#091929] border-b border-[#38bdf8]/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-xs font-mono"
        >
          <div className="flex items-center gap-1.5 text-[#38bdf8]">
            <Wifi className="w-4 h-4 shrink-0" />
            <span>INTERNET SERVER OR WI-FI IP (FOR PHONE &harr; LAPTOP):</span>
          </div>
          <div className="flex items-center gap-1.5 flex-1 max-w-lg">
            <input
              type="text"
              value={serverInput}
              onChange={(e) => setServerInput(e.target.value)}
              placeholder="Leave empty for Cloud Server, or http://192.168.1.x:3000"
              className="flex-1 px-2.5 py-1 rounded bg-[#051424] border border-[#30363d] text-white text-xs"
            />
            <button
              type="submit"
              className="px-3 py-1 rounded bg-[#10b981] text-black font-bold text-xs cursor-pointer"
            >
              SAVE IP
            </button>
            <button
              type="button"
              onClick={() => {
                setServerInput('');
                emergencyCallManager.setServerUrl('');
                setShowServerConfig(false);
              }}
              className="px-2.5 py-1 rounded bg-[#21262d] text-[#94a3b8] hover:text-white text-xs cursor-pointer"
            >
              AUTO CLOUD
            </button>
          </div>
        </form>
      )}

      {/* Embedded Live Interactive Map */}
      <div className="relative w-full h-56 sm:h-72 bg-[#051424]">
        <iframe
          key={`${mapStyle}-${lat.toFixed(4)}-${lon.toFixed(4)}`}
          title="Live Phone Emergency Location Map"
          src={mapStyle === 'google' ? googleEmbedUrl : osmEmbedUrl}
          className="w-full h-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />

        {/* Floating Live Telemetry Overlay on Map */}
        <div className="absolute bottom-2 left-2 right-2 pointer-events-none flex items-center justify-between gap-2 flex-wrap">
          <div className="px-2.5 py-1.5 rounded-lg bg-black/85 border border-[#ef4444] text-white font-mono text-[11px] flex items-center gap-2 shadow-lg">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] animate-ping" />
            <span>
              PHONE PIN: <strong>{lat.toFixed(5)}</strong>, <strong>{lon.toFixed(5)}</strong>
            </span>
          </div>

          <div className="px-2.5 py-1.5 rounded-lg bg-black/85 border border-[#10b981] text-[#4edea3] font-mono text-[11px] flex items-center gap-1.5 shadow-lg">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>
              {callState.locationTrail.length} GPS POINTS TRACKED ·{' '}
              {callState.peerConnected ? '2-WAY AUDIO LIVE' : 'STREAMING'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
