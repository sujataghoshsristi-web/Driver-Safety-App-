import { FleetVehicle } from '../types/telemetry';

export const FLEET_VEHICLES: FleetVehicle[] = [
  // 1. AUTO-RICKSHAW (3-WHEELER AUTO)
  {
    id: 'veh-auto-101',
    unitNumber: 'AUTO-101',
    name: 'Bajaj RE Compact 3-Wheeler Auto',
    type: 'Auto-Rickshaw (3-Wheeler)',
    category: 'auto',
    vin: 'MD2AA24AZL109401',
    fuelType: 'CNG (Gas)',
    passengerCapacity: 3,
    governorLimitKmh: 45,
    gasWarningThresholdPpm: 30, // CNG rear tank under passenger bench: high sensitivity!
    plateNumber: 'DL-1RA-4921',
    assignedDepot: 'South City Auto-Rickshaw Stand',
  },
  {
    id: 'veh-auto-204',
    unitNumber: 'AUTO-204',
    name: 'Mahindra Treo Electric Auto (EV)',
    type: 'Auto-Rickshaw (3-Wheeler)',
    category: 'auto',
    vin: 'MA1EV3W08NM204118',
    fuelType: 'Electric EV',
    passengerCapacity: 4,
    governorLimitKmh: 40,
    gasWarningThresholdPpm: 25, // Battery compartment thermal runaway & toxic off-gas
    plateNumber: 'MH-02-EV-8841',
    assignedDepot: 'Metro Central EV Charging Hub',
  },

  // 2. COMMERCIAL CAB / TAXI (SEDAN / RIDESHARE)
  {
    id: 'veh-cab-301',
    unitNumber: 'CAB-301',
    name: 'Toyota Camry / Dzire Commercial City Cab',
    type: 'Cab / Taxi',
    category: 'cab',
    vin: '4T1B11HK5KU301492',
    fuelType: 'CNG (Gas)',
    passengerCapacity: 4,
    governorLimitKmh: 70,
    gasWarningThresholdPpm: 35, // Trunk-mounted CNG fuel cylinder safety cutoff
    plateNumber: 'NY-TX-3014',
    assignedDepot: 'JFK Airport Commercial Cab Queue',
  },
  {
    id: 'veh-cab-408',
    unitNumber: 'CAB-408',
    name: 'Fleet Premier Rideshare Cab (Sedan)',
    type: 'Cab / Taxi',
    category: 'cab',
    vin: '1HGCR2F83HA408219',
    fuelType: 'Petrol',
    passengerCapacity: 4,
    governorLimitKmh: 80,
    gasWarningThresholdPpm: 45,
    plateNumber: 'CA-CAB-408',
    assignedDepot: 'Downtown Central Cab Stand #4',
  },

  // 3. PUBLIC TRANSIT & SCHOOL BUS
  {
    id: 'veh-bus-512',
    unitNumber: 'BUS-512',
    name: 'City Transit Low-Floor Bus (45-Seater)',
    type: 'City / School Bus',
    category: 'bus',
    vin: '1T8X44CNG9J512803',
    fuelType: 'CNG (Gas)',
    passengerCapacity: 45,
    governorLimitKmh: 60,
    gasWarningThresholdPpm: 30, // High passenger density passenger cabin air monitoring
    plateNumber: 'BUS-CNG-512',
    assignedDepot: 'Municipal Transit Bus Terminal #2',
  },
  {
    id: 'veh-bus-608',
    unitNumber: 'BUS-608',
    name: 'Student Safety School Bus (52-Seater)',
    type: 'City / School Bus',
    category: 'bus',
    vin: '1BABBB7A8KF608104',
    fuelType: 'Diesel',
    passengerCapacity: 52,
    governorLimitKmh: 50, // Mandatory strict speed cap for student safety
    gasWarningThresholdPpm: 25, // Strictest CO threshold to protect children from exhaust
    plateNumber: 'SCH-BUS-608',
    assignedDepot: 'District School Transportation Yard',
  },
  {
    id: 'veh-bus-901',
    unitNumber: 'BUS-901',
    name: 'Volvo B11R Luxury Intercity Coach',
    type: 'Intercity Coach Bus',
    category: 'bus',
    vin: 'YV3R84200KA901842',
    fuelType: 'Diesel',
    passengerCapacity: 38,
    governorLimitKmh: 80,
    gasWarningThresholdPpm: 45,
    plateNumber: 'EXP-901-CT',
    assignedDepot: 'Grand Interstate Coach Terminal',
  },

  // 4. PASSENGER SHUTTLE VAN & CARGO
  {
    id: 'veh-van-704',
    unitNumber: 'VAN-704',
    name: 'Commuter Shuttle Van (14-Passenger)',
    type: 'Van / Shuttle',
    category: 'van',
    vin: 'WD3PF4CC5KP704128',
    fuelType: 'CNG (Gas)',
    passengerCapacity: 14,
    governorLimitKmh: 75,
    gasWarningThresholdPpm: 35,
    plateNumber: 'SHT-VAN-704',
    assignedDepot: 'Metro Tech Park Employee Shuttle',
  },
];
