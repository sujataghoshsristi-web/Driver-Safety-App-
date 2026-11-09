import React, { useState } from 'react';
import { 
  Bus,
  Car,
  Truck, 
  Check, 
  X, 
  Fuel, 
  Gauge, 
  ShieldAlert, 
  Building2, 
  Users,
  Flame,
  Zap,
  SlidersHorizontal,
  Info
} from 'lucide-react';
import { FleetVehicle } from '../types/telemetry';
import { FLEET_VEHICLES } from '../data/fleetVehicles';
import { cabAudio } from '../utils/audio';

interface VehicleSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVehicle: FleetVehicle;
  onSelectVehicle: (vehicle: FleetVehicle) => void;
}

type VehicleCategoryFilter = 'all' | 'auto' | 'cab' | 'bus' | 'van';

export const VehicleSelectorModal: React.FC<VehicleSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedVehicle,
  onSelectVehicle,
}) => {
  const [activeCategory, setActiveCategory] = useState<VehicleCategoryFilter>('all');

  if (!isOpen) return null;

  const filteredVehicles = FLEET_VEHICLES.filter((vehicle) => {
    if (activeCategory === 'all') return true;
    return vehicle.category === activeCategory;
  });

  const handleSelect = (v: FleetVehicle) => {
    cabAudio.playKeyClick();
    onSelectVehicle(v);
    onClose();
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'auto':
        return <span className="text-xl leading-none">🛺</span>;
      case 'cab':
        return <Car className="w-5 h-5 text-[#facc15]" />;
      case 'bus':
        return <Bus className="w-5 h-5 text-[#38bdf8]" />;
      case 'van':
        return <Truck className="w-5 h-5 text-[#34d399]" />;
      default:
        return <Car className="w-5 h-5 text-[#f59e0b]" />;
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'auto':
        return {
          label: 'AUTO-RICKSHAW',
          classes: 'bg-[#ff7849]/15 text-[#ff8c42] border-[#ff7849]/30',
          emoji: '🛺',
        };
      case 'cab':
        return {
          label: 'CAB / TAXI',
          classes: 'bg-[#facc15]/15 text-[#facc15] border-[#facc15]/30',
          emoji: '🚕',
        };
      case 'bus':
        return {
          label: 'CITY & SCHOOL BUS',
          classes: 'bg-[#38bdf8]/15 text-[#38bdf8] border-[#38bdf8]/30',
          emoji: '🚌',
        };
      case 'van':
        return {
          label: 'VAN / SHUTTLE',
          classes: 'bg-[#34d399]/15 text-[#34d399] border-[#34d399]/30',
          emoji: '🚐',
        };
      default:
        return {
          label: 'COMMERCIAL',
          classes: 'bg-[#94a3b8]/15 text-[#94a3b8] border-[#94a3b8]/30',
          emoji: '🚗',
        };
    }
  };

  const counts = {
    all: FLEET_VEHICLES.length,
    auto: FLEET_VEHICLES.filter((v) => v.category === 'auto').length,
    cab: FLEET_VEHICLES.filter((v) => v.category === 'cab').length,
    bus: FLEET_VEHICLES.filter((v) => v.category === 'bus').length,
    van: FLEET_VEHICLES.filter((v) => v.category === 'van').length,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl bg-[#0b1726] border-2 border-[#f59e0b] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#051424] px-5 py-3.5 border-b border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#f59e0b] text-[#051424] flex items-center justify-center font-headline font-bold text-xl shadow-md">
              <span className="text-xl">🛺</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-headline font-bold text-white tracking-wide">
                  SELECT COMMERCIAL VEHICLE
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1c2b3c] text-[#ffc174] border border-[#f59e0b]/40 font-bold">
                  AUTO · CAB · BUS · VAN
                </span>
              </div>
              <p className="text-xs font-mono text-[#94a3b8]">
                Calibrates speed governor limit and MQ-9 gas threshold for each vehicle type
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              cabAudio.playKeyClick();
              onClose();
            }}
            className="p-1.5 rounded text-[#94a3b8] hover:text-white hover:bg-[#161b22] border border-[#30363d] transition-colors"
            aria-label="Close vehicle selector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Tabs: AUTO, CAB, BUS, VAN */}
        <div className="bg-[#0e1a29] px-4 sm:px-5 py-2.5 border-b border-[#30363d] flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => {
              cabAudio.playKeyClick();
              setActiveCategory('all');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeCategory === 'all'
                ? 'bg-[#f59e0b] text-[#051424] shadow-md'
                : 'bg-[#161b22] text-[#94a3b8] hover:text-white border border-[#30363d]'
            }`}
          >
            <span>ALL VEHICLES</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/20 font-mono">
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              cabAudio.playKeyClick();
              setActiveCategory('auto');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeCategory === 'auto'
                ? 'bg-[#ff8c42] text-[#051424] shadow-md ring-1 ring-white/20'
                : 'bg-[#161b22] text-[#ff8c42] hover:bg-[#1c2b3c] border border-[#ff8c42]/30'
            }`}
          >
            <span>🛺 AUTO (3-WHEELER)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/20 font-mono">
              {counts.auto}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              cabAudio.playKeyClick();
              setActiveCategory('cab');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeCategory === 'cab'
                ? 'bg-[#facc15] text-[#051424] shadow-md ring-1 ring-white/20'
                : 'bg-[#161b22] text-[#facc15] hover:bg-[#1c2b3c] border border-[#facc15]/30'
            }`}
          >
            <span>🚕 CAB / TAXI</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/20 font-mono">
              {counts.cab}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              cabAudio.playKeyClick();
              setActiveCategory('bus');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeCategory === 'bus'
                ? 'bg-[#38bdf8] text-[#051424] shadow-md ring-1 ring-white/20'
                : 'bg-[#161b22] text-[#38bdf8] hover:bg-[#1c2b3c] border border-[#38bdf8]/30'
            }`}
          >
            <span>🚌 BUS (CITY/SCHOOL)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/20 font-mono">
              {counts.bus}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              cabAudio.playKeyClick();
              setActiveCategory('van');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeCategory === 'van'
                ? 'bg-[#34d399] text-[#051424] shadow-md ring-1 ring-white/20'
                : 'bg-[#161b22] text-[#34d399] hover:bg-[#1c2b3c] border border-[#34d399]/30'
            }`}
          >
            <span>🚐 VAN / SHUTTLE</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/20 font-mono">
              {counts.van}
            </span>
          </button>
        </div>

        {/* Informational Banner */}
        <div className="bg-[#122030] px-4 sm:px-5 py-2 border-b border-[#30363d] flex items-center gap-2 text-xs font-mono text-[#94a3b8]">
          <Info className="w-4 h-4 text-[#ffc174] shrink-0" />
          <span>
            Selecting a vehicle automatically updates the <strong className="text-white">CAN-Bus Speed Governor</strong> and the <strong className="text-white">MQ-9 Gas Safety Threshold</strong> tailored to passenger safety.
          </span>
        </div>

        {/* Vehicles List */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1 font-body">
          <div className="flex items-center justify-between text-xs font-mono text-[#94a3b8] uppercase mb-1">
            <span>
              SHOWING {filteredVehicles.length} {activeCategory === 'all' ? 'TOTAL FLEET ASSETS' : `${activeCategory.toUpperCase()} ASSETS`}
            </span>
            <span className="text-[#ffc174]">
              CURRENT UNIT: {selectedVehicle.unitNumber}
            </span>
          </div>

          <div className="space-y-3">
            {filteredVehicles.map((vehicle) => {
              const isSelected = selectedVehicle.id === vehicle.id;
              const badge = getCategoryBadge(vehicle.category);

              return (
                <div
                  key={vehicle.id}
                  onClick={() => handleSelect(vehicle)}
                  className={`p-3.5 sm:p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-[#16273c] border-[#f59e0b] shadow-xl ring-1 ring-[#f59e0b]/40'
                      : 'bg-[#131b26] border-[#30363d] hover:border-[#94a3b8]/60 hover:bg-[#1a2536]'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    {/* Category Icon */}
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold shrink-0 mt-0.5 border ${
                        isSelected
                          ? 'bg-[#f59e0b] text-[#051424] border-[#f59e0b]'
                          : 'bg-[#1c2b3c] border-[#30363d]'
                      }`}
                    >
                      {getCategoryIcon(vehicle.category)}
                    </div>

                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-headline font-bold text-white text-base">
                          {vehicle.name}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#0d1c2d] text-[#ffc174] border border-[#f59e0b]/40 font-bold">
                          {vehicle.unitNumber}
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold flex items-center gap-1 ${badge.classes}`}>
                          <span>{badge.emoji}</span>
                          <span>{badge.label}</span>
                        </span>
                      </div>

                      {/* Specs: Fuel, Passenger Capacity, Governor, Gas Threshold */}
                      <div className="text-xs font-mono text-[#cbd5e1] flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
                        <span className="flex items-center gap-1 text-[#ffc174] bg-[#051424] px-2 py-0.5 rounded border border-[#30363d]">
                          <Fuel className="w-3.5 h-3.5" />
                          <span>{vehicle.fuelType}</span>
                        </span>

                        <span className="flex items-center gap-1 text-[#67e8f9] bg-[#051424] px-2 py-0.5 rounded border border-[#30363d]">
                          <Users className="w-3.5 h-3.5" />
                          <span>{vehicle.passengerCapacity} Seater</span>
                        </span>

                        <span className="flex items-center gap-1 text-[#4edea3] bg-[#051424] px-2 py-0.5 rounded border border-[#30363d]">
                          <Gauge className="w-3.5 h-3.5" />
                          <span>Gov: {vehicle.governorLimitKmh} km/h</span>
                        </span>

                        <span className="flex items-center gap-1 text-[#fbbf24] bg-[#051424] px-2 py-0.5 rounded border border-[#30363d]">
                          <Flame className="w-3.5 h-3.5 text-[#ef4444]" />
                          <span>MQ-9 Gas: {vehicle.gasWarningThresholdPpm} PPM</span>
                        </span>
                      </div>

                      <div className="text-[11px] font-mono text-[#64748b] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span>VIN: {vehicle.vin}</span>
                        <span>·</span>
                        <span>REG: {vehicle.plateNumber}</span>
                        <span>·</span>
                        <span className="text-[#94a3b8] flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-[#ffc174]" />
                          {vehicle.assignedDepot}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right side: Action Button */}
                  <div className="flex items-center sm:flex-col sm:items-end justify-between shrink-0 gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#30363d]">
                    {isSelected ? (
                      <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#10b981] text-black font-headline font-bold text-xs shadow-md">
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>ACTIVE UNIT</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(vehicle);
                        }}
                        className="px-3.5 py-2 rounded-lg font-headline font-bold text-xs bg-[#21262d] text-white hover:bg-[#f59e0b] hover:text-[#051424] transition-all flex items-center gap-1.5 border border-[#30363d]"
                      >
                        <span>ASSIGN TO CAB</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#051424] px-5 py-3 border-t border-[#30363d] flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[#94a3b8]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#10b981]" />
            <span>SPEED GOVERNOR & MQ-9 GAS THRESHOLD SYNCED IN REAL-TIME</span>
          </div>
          <button
            onClick={() => {
              cabAudio.playKeyClick();
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg font-headline font-bold text-xs bg-[#161b22] hover:bg-[#21262d] text-white border border-[#30363d] transition-colors"
          >
            CONFIRM & CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
