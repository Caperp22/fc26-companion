// Abreviatura en español por posición (estilo EA FC)
export const POSITION_ES = {
  GK:  'PO',   // Portero
  CB:  'DFC',  // Defensa Central
  LB:  'LI',   // Lateral Izquierdo
  RB:  'LD',   // Lateral Derecho
  LWB: 'CAI',  // Carrilero Izquierdo
  RWB: 'CAD',  // Carrilero Derecho
  CDM: 'MCD',  // Mediocampista Defensivo
  CM:  'MC',   // Mediocampista Central
  CAM: 'MCO',  // Mediocampista Ofensivo
  LM:  'MI',   // Mediocampista Izquierdo
  RM:  'MD',   // Mediocampista Derecho
  LW:  'EI',   // Extremo Izquierdo
  RW:  'ED',   // Extremo Derecho
  CF:  'SD',   // Segunda Delantera
  ST:  'DC',   // Delantero Centro
};

// Nombre completo en español
export const POSITION_FULL_ES = {
  GK:  'Portero',
  CB:  'Defensa Central',
  LB:  'Lateral Izquierdo',
  RB:  'Lateral Derecho',
  LWB: 'Carrilero Izq.',
  RWB: 'Carrilero Der.',
  CDM: 'Medio Defensivo',
  CM:  'Mediocampista',
  CAM: 'Medio Ofensivo',
  LM:  'Medio Izquierdo',
  RM:  'Medio Derecho',
  LW:  'Extremo Izq.',
  RW:  'Extremo Der.',
  CF:  'Segunda Delantera',
  ST:  'Delantero',
};

// Todas las posiciones en orden para filtros
export const ALL_POSITIONS = [
  'GK',
  'CB', 'LB', 'RB', 'LWB', 'RWB',
  'CDM', 'CM', 'CAM', 'LM', 'RM',
  'LW', 'RW', 'CF', 'ST',
];

// Color de fondo por línea
export const POSITION_BG = (position) => {
  if (position === 'GK')                             return '#b45309'; // ámbar oscuro
  if (['CB','LB','RB','LWB','RWB'].includes(position)) return '#1d4ed8'; // azul
  if (['CDM','CM','CAM','LM','RM'].includes(position))  return '#6d28d9'; // violeta
  return '#b91c1c';                                                        // rojo
};
