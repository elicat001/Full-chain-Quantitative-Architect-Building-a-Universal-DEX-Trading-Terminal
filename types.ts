export enum Phase {
  Theory = 'THEORY',
  Stack = 'STACK',
  Architecture = 'ARCH',
  Code = 'CODE',
  Backtest = 'BACKTEST',
  Simulation = 'SIMULATION',
  Reality = 'REALITY'
}

export interface Order {
  id: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
}

export interface MarketState {
  price: number;
  timestamp: number;
}

export interface SimulationStats {
  pnl: number;
  trades: number;
  volume: number;
  latency: number;
}