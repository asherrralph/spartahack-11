export const RISK_CONFIGS = {
  low: {
    color: '#10b981', // Emerald-500
    label: 'SAFE',
    subtitle: 'Low bot activity detected',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20'
  },
  moderate: {
    color: '#f59e0b', // Amber-500
    label: 'CAUTION',
    subtitle: 'Bot activity rising',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20'
  },
  severe: {
    color: '#ef4444', // Red-500
    label: 'CRITICAL',
    subtitle: 'High risk of sandwich attack',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20'
  }
};

export const TOKEN_LIST = [
  { value: 'ETH', label: 'Ethereum', symbol: 'ETH', logo: '/tokens/eth.png' },
  { value: 'PEPE', label: 'Pepe', symbol: 'PEPE', logo: '/tokens/pepe.png' },
  { value: 'SHIB', label: 'Shiba Inu', symbol: 'SHIB', logo: '/tokens/shib.png' },
];