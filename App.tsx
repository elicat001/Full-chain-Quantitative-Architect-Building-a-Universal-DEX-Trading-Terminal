import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  BookOpen, 
  Cpu, 
  Layers, 
  Code, 
  PlayCircle, 
  AlertTriangle, 
  TrendingUp, 
  Activity, 
  Server, 
  DollarSign, 
  Zap,
  Terminal,
  PauseCircle,
  RefreshCcw,
  Settings,
  BarChart3,
  Network
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine,
  Area,
  AreaChart
} from 'recharts';
import { Phase, MarketState, SimulationStats } from './types';

// --- Components ---

const NavItem = ({ 
  active, 
  onClick, 
  icon: Icon, 
  label, 
  phase 
}: { 
  active: boolean; 
  onClick: () => void; 
  icon: React.ElementType; 
  label: string;
  phase: Phase;
}) => (
  <button
    onClick={onClick}
    className={`flex items-center w-full p-3 mb-2 rounded-lg transition-all duration-200 ${
      active 
        ? 'bg-hl-green/10 text-hl-green border-l-4 border-hl-green' 
        : 'text-gray-400 hover:bg-hl-card hover:text-white'
    }`}
  >
    <Icon size={18} className="mr-3" />
    <span className="text-sm font-medium">{label}</span>
  </button>
);

const ContentCard = ({ title, children, className = "" }: { title: string, children?: React.ReactNode, className?: string }) => (
  <div className={`bg-hl-card border border-hl-border rounded-xl p-6 mb-6 ${className}`}>
    <h3 className="text-xl font-bold text-white mb-4 flex items-center">
      <span className="bg-gradient-to-r from-hl-green to-hl-blue w-2 h-6 mr-3 rounded-sm"></span>
      {title}
    </h3>
    <div className="text-gray-300 leading-relaxed space-y-4">
      {children}
    </div>
  </div>
);

const CodeBlock = ({ code, language = 'rust' }: { code: string; language?: string }) => (
  <div className="bg-[#0d0e11] border border-hl-border rounded-lg overflow-hidden my-4 shadow-lg">
    <div className="flex justify-between items-center px-4 py-2 bg-[#1a1c23] border-b border-hl-border">
      <span className="text-xs text-gray-400 font-mono uppercase">{language}</span>
      <div className="flex space-x-2">
        <div className="w-2 h-2 rounded-full bg-hl-red/50"></div>
        <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
        <div className="w-2 h-2 rounded-full bg-hl-green/50"></div>
      </div>
    </div>
    <pre className="p-4 overflow-x-auto text-sm font-mono text-gray-300">
      <code>{code}</code>
    </pre>
  </div>
);

// --- Logic & Data ---

const RUST_CODE_SNIPPET = `// Hyperliquid 高频策略核心循环 (Rust)

use tokio_tungstenite::connect_async;
use serde_json::Value;

#[tokio::main]
async fn main() {
    // 1. 建立低延迟 WebSocket 连接
    let (ws_stream, _) = connect_async("wss://api.hyperliquid.xyz/ws").await.unwrap();
    let (mut write, mut read) = ws_stream.split();

    // 2. 订阅 L2 订单簿 (只关注最近的档位以减少带宽)
    let sub_msg = json!({ "method": "subscribe", "subscription": { "type": "l2Book", "coin": "ETH" } });
    write.send(Message::Text(sub_msg.to_string())).await.unwrap();

    // 3. 极速事件循环
    while let Some(message) = read.next().await {
        let data = parse_simd_json(message); // 使用 SIMD 加速解析
        
        // 4. 策略逻辑：Avellaneda-Stoikov 模型
        let mid_price = (data.bids[0].px + data.asks[0].px) / 2.0;
        let inventory = account.get_position("ETH");
        
        // 核心：计算保留价格 (Reservation Price)
        // r = s - q * gamma * sigma^2
        let reservation_price = mid_price - (inventory * RISK_AVERSION * VOLATILITY);
        
        let spread = calculate_optimal_spread(VOLATILITY);
        
        let my_bid = reservation_price - spread / 2.0;
        let my_ask = reservation_price + spread / 2.0;

        // 5. 差分下单 (只在价格变动超过阈值时修改订单，节省 API 限频)
        if (my_bid - current_bid).abs() > TICK_SIZE {
             api_client.post_orders(vec![
                 Order { coin: "ETH", is_buy: true, sz: 1.0, limit_px: my_bid },
                 Order { coin: "ETH", is_buy: false, sz: 1.0, limit_px: my_ask }
             ]).await;
        }
    }
}`;

// --- Simulation Types ---

interface SimState {
    midPrice: number;
    reservationPrice: number; // The bot's internal "fair value"
    inventory: number;
    cash: number;
    myBid: number;
    myAsk: number;
}

const INITIAL_PRICE = 1000;
const INITIAL_CASH = 10000;

// --- Main Application ---

const App: React.FC = () => {
  const [activePhase, setActivePhase] = useState<Phase>(Phase.Theory);
  
  // Simulation Configuration
  const [simRunning, setSimRunning] = useState(false);
  const [riskAversion, setRiskAversion] = useState(0.1); // Gamma
  const [volatility, setVolatility] = useState(0.5); // Sigma
  const [latency, setLatency] = useState(20); // Simulated ms
  
  // Simulation State
  const [simState, setSimState] = useState<SimState>({
    midPrice: INITIAL_PRICE,
    reservationPrice: INITIAL_PRICE,
    inventory: 0,
    cash: INITIAL_CASH,
    myBid: 999.5,
    myAsk: 1000.5
  });
  
  const [marketData, setMarketData] = useState<any[]>([]);
  const [stats, setStats] = useState<SimulationStats>({ pnl: 0, trades: 0, volume: 0, latency: 0 });

  // Advanced Stoikov Simulation Loop
  useEffect(() => {
    let interval: number | undefined;

    if (simRunning) {
      interval = window.setInterval(() => {
        setSimState(prev => {
          const time = Date.now();
          
          // 1. Market Dynamics: Geometric Brownian Motion
          const dt = 1/365/24/60/60; // small time step
          const drift = 0;
          const shock = (Math.random() - 0.5) * volatility * 2; // Simple volatility
          const newMid = prev.midPrice + shock;
          
          // 2. Strategy: Calculate Reservation Price (r)
          // r = s - q * gamma * sigma^2
          // If inventory > 0, r < s (Skew quotes down to sell)
          // If inventory < 0, r > s (Skew quotes up to buy)
          const inventorySkew = prev.inventory * riskAversion * volatility * 5; // Multiplier for visual effect
          const newReservation = newMid - inventorySkew;
          
          // 3. Calculate Optimal Quotes
          const halfSpread = volatility * 0.8; // Simplified optimal spread
          const newBid = newReservation - halfSpread;
          const newAsk = newReservation + halfSpread;
          
          // 4. Matching Engine Simulation (Poisson Process)
          // Probability of fill decays exponentially with distance from mid price
          const probHitAsk = Math.exp(-1.5 * (newAsk - newMid)); // Ask hit if price moves up
          const probHitBid = Math.exp(-1.5 * (newMid - newBid)); // Bid hit if price moves down
          
          let nextInv = prev.inventory;
          let nextCash = prev.cash;
          let tradeOccurred = false;

          // Simulate Ask Fill
          if (Math.random() < probHitAsk * 0.3) { // 0.3 factor to slow down visual sim
              nextInv -= 1;
              nextCash += newAsk;
              tradeOccurred = true;
          }
          
          // Simulate Bid Fill
          if (Math.random() < probHitBid * 0.3) {
              nextInv += 1;
              nextCash -= newBid;
              tradeOccurred = true;
          }

          // 5. Update Stats
          const markToMarketVal = nextCash + (nextInv * newMid);
          const pnl = markToMarketVal - INITIAL_CASH;
          
          if (tradeOccurred) {
             setStats(s => ({
                 ...s,
                 trades: s.trades + 1,
                 volume: s.volume + newMid,
                 pnl: pnl
             }));
          }

          // Update Chart Data
          setMarketData(d => {
             const newData = [...d, {
                 timestamp: time,
                 price: newMid,
                 reservation: newReservation,
                 bid: newBid,
                 ask: newAsk,
                 inventory: nextInv
             }];
             if (newData.length > 60) newData.shift();
             return newData;
          });

          return {
              midPrice: newMid,
              reservationPrice: newReservation,
              inventory: nextInv,
              cash: nextCash,
              myBid: newBid,
              myAsk: newAsk
          };
        });
      }, 50); // 50ms Tick
    }
    return () => clearInterval(interval);
  }, [simRunning, riskAversion, volatility]);

  const renderContent = () => {
    switch (activePhase) {
      case Phase.Theory:
        return (
          <div className="animate-fade-in">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">高频做市 (HFT Market Making)</h1>
              <p className="text-gray-400">在毫秒级的战场上，理解微观结构比预测大趋势更重要。</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ContentCard title="做市商的核心任务">
                <ul className="space-y-4 text-sm text-gray-300">
                  <li className="flex items-start">
                    <span className="text-hl-green mr-2">1.</span>
                    <span><strong>提供流动性：</strong>在买一和卖一挂单，赚取点差 (Spread)。</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-hl-green mr-2">2.</span>
                    <span><strong>库存管理 (核心)：</strong>你不是在赌方向。如果你积累了太多多头头寸，你必须降低卖单价格以尽快平仓。这叫 <span className="text-hl-accent">Inventory Skewing</span>。</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-hl-green mr-2">3.</span>
                    <span><strong>逆向选择 (Adverse Selection)：</strong>如果你的买单被“有毒流”(Toxic Flow) 吃掉，通常意味着价格即将暴跌。你必须比这种信息跑得更快。</span>
                  </li>
                </ul>
              </ContentCard>

              <ContentCard title="订单簿微观结构">
                 <div className="relative h-40 bg-[#0d0e11] rounded border border-hl-border flex items-center justify-center overflow-hidden">
                    <div className="absolute w-full h-full flex">
                        <div className="w-1/2 h-full flex flex-col items-end justify-center pr-4 border-r border-dashed border-gray-700">
                            <div className="text-hl-green font-mono">Buy Orders</div>
                            <div className="w-3/4 h-2 bg-hl-green/20 mt-1 rounded"></div>
                            <div className="w-1/2 h-2 bg-hl-green/20 mt-1 rounded"></div>
                            <div className="w-full h-2 bg-hl-green/20 mt-1 rounded"></div>
                        </div>
                        <div className="w-1/2 h-full flex flex-col items-start justify-center pl-4">
                            <div className="text-hl-red font-mono">Sell Orders</div>
                            <div className="w-2/3 h-2 bg-hl-red/20 mt-1 rounded"></div>
                            <div className="w-1/2 h-2 bg-hl-red/20 mt-1 rounded"></div>
                            <div className="w-full h-2 bg-hl-red/20 mt-1 rounded"></div>
                        </div>
                    </div>
                    <div className="z-10 bg-[#141519] px-4 py-2 rounded border border-hl-border text-xs font-mono">
                        Spread (点差)
                    </div>
                 </div>
              </ContentCard>
            </div>
          </div>
        );

      case Phase.Stack:
        return (
          <div className="animate-fade-in">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">极致性能技术栈</h1>
              <p className="text-gray-400">当竞争对手是 Jump Trading 和 Wintermute 时，Python 是不够的。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-hl-card border border-hl-green/30 rounded-xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Cpu size={100} />
                </div>
                <h3 className="text-xl font-bold text-hl-green mb-2">Rust</h3>
                <div className="text-xs font-mono bg-hl-green/10 text-hl-green inline-block px-2 py-1 rounded mb-4">硬性要求</div>
                <p className="text-sm text-gray-400">
                  无 GC (垃圾回收) 暂停。内存安全。现代金融系统的首选。Hyperliquid 的后端本身也是用 Rust 写的。
                </p>
              </div>

              <div className="bg-hl-card border border-hl-border rounded-xl p-6 opacity-75">
                <h3 className="text-xl font-bold text-white mb-2">C++</h3>
                <div className="text-xs font-mono bg-gray-700 text-gray-300 inline-block px-2 py-1 rounded mb-4">传统选择</div>
                <p className="text-sm text-gray-400">
                  如果你有现成的 C++ 库可以使用。但对于新项目，Rust 的开发效率和安全性更高。
                </p>
              </div>
              
              <div className="bg-hl-card border border-hl-red/30 rounded-xl p-6 opacity-60">
                <h3 className="text-xl font-bold text-white mb-2">Python</h3>
                <div className="text-xs font-mono bg-hl-red/10 text-hl-red inline-block px-2 py-1 rounded mb-4">仅用于研究</div>
                <p className="text-sm text-gray-400">
                  仅用于数据分析、回测和原型设计。由于 GIL 和解释器开销，无法处理微秒级做市。
                </p>
              </div>
            </div>

            <ContentCard title="系统级调优 (System Tuning)">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="bg-[#0d0e11] p-4 rounded border border-hl-border">
                   <div className="flex items-center mb-2 text-hl-blue">
                      <Zap size={18} className="mr-2" />
                      <span className="font-bold text-sm">Kernel Bypass</span>
                   </div>
                   <p className="text-xs text-gray-400 leading-relaxed">
                     使用 DPDK 或 Solarflare OpenOnload。绕过操作系统笨重的 TCP/IP 协议栈，直接从网卡读取数据包。
                   </p>
                 </div>
                 
                 <div className="bg-[#0d0e11] p-4 rounded border border-hl-border">
                   <div className="flex items-center mb-2 text-hl-blue">
                      <Cpu size={18} className="mr-2" />
                      <span className="font-bold text-sm">CPU Isolation</span>
                   </div>
                   <p className="text-xs text-gray-400 leading-relaxed">
                     使用 <code className="bg-gray-800 px-1 rounded">isolcpus</code>。将策略线程“钉”在特定物理核心上，独占 L1/L2 缓存，防止上下文切换。
                   </p>
                 </div>

                 <div className="bg-[#0d0e11] p-4 rounded border border-hl-border">
                   <div className="flex items-center mb-2 text-hl-blue">
                      <Code size={18} className="mr-2" />
                      <span className="font-bold text-sm">SIMD JSON</span>
                   </div>
                   <p className="text-xs text-gray-400 leading-relaxed">
                     使用 <code className="bg-gray-800 px-1 rounded">simd-json</code>。利用 CPU 的 AVX2 指令集并行解析 JSON 数据，解析速度提升 300%。
                   </p>
                 </div>
               </div>
            </ContentCard>
          </div>
        );

      case Phase.Code:
        return (
          <div className="animate-fade-in h-full flex flex-col">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-white mb-2">核心代码架构</h1>
              <p className="text-gray-400">基于 Toko 的异步事件驱动架构。</p>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <CodeBlock code={RUST_CODE_SNIPPET} />
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-hl-card border-l-2 border-hl-green rounded-r-lg">
                  <h4 className="font-bold text-sm text-hl-green mb-1">事件循环 (Event Loop)</h4>
                  <p className="text-xs text-gray-400">
                    必须是单线程无锁的 (Single-threaded Lock-free)。锁 (Mutex) 会导致线程争用，引入不可控的延迟抖动。
                  </p>
                </div>
                <div className="p-4 bg-hl-card border-l-2 border-hl-blue rounded-r-lg">
                  <h4 className="font-bold text-sm text-hl-blue mb-1">状态管理</h4>
                  <p className="text-xs text-gray-400">
                    在本地内存中完整重建订单簿 (Local Orderbook)。不要每次下单都去查询 API，直接使用本地状态计算。
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
        
      case Phase.Simulation:
        return (
          <div className="animate-fade-in h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-3xl font-bold text-white mb-1">Stoikov 策略模拟器</h1>
                <p className="text-gray-400 text-sm">深度观察：库存如何偏移保留价格 (Reservation Price)</p>
              </div>
              <div className="flex items-center space-x-4">
                 <div className="flex flex-col items-end mr-4">
                    <span className={`text-sm font-mono font-bold ${stats.pnl >= 0 ? 'text-hl-green' : 'text-hl-red'}`}>
                      PnL: ${stats.pnl.toFixed(2)}
                    </span>
                 </div>
                <button 
                  onClick={() => setSimRunning(!simRunning)}
                  className={`flex items-center px-6 py-2 rounded-full font-bold transition-all ${
                    simRunning 
                      ? 'bg-hl-red/10 text-hl-red border border-hl-red/50 hover:bg-hl-red/20' 
                      : 'bg-hl-green text-white hover:bg-hl-green/90 shadow-[0_0_15px_rgba(46,189,133,0.4)]'
                  }`}
                >
                  {simRunning ? <><PauseCircle className="mr-2" /> 停止模拟</> : <><PlayCircle className="mr-2" /> 启动模拟</>}
                </button>
                <button 
                  onClick={() => {
                    setStats({ pnl: 0, trades: 0, volume: 0, latency: 0 });
                    setSimState({ midPrice: INITIAL_PRICE, reservationPrice: INITIAL_PRICE, inventory: 0, cash: INITIAL_CASH, myBid: 999.5, myAsk: 1000.5 });
                    setMarketData([]);
                  }}
                  className="p-2 rounded-full bg-hl-card text-gray-400 hover:text-white border border-hl-border"
                >
                  <RefreshCcw size={18} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[400px]">
              {/* Main Chart */}
              <div className="lg:col-span-2 bg-[#0d0e11] border border-hl-border rounded-xl p-4 flex flex-col relative">
                <div className="absolute top-4 left-4 z-10 flex space-x-4 text-xs">
                    <div className="flex items-center"><div className="w-3 h-1 bg-hl-blue mr-2"></div>Mid Price (中间价)</div>
                    <div className="flex items-center"><div className="w-3 h-1 bg-hl-accent mr-2"></div>Reservation Price (保留价)</div>
                    <div className="flex items-center"><div className="w-3 h-1 bg-hl-green mr-2"></div>My Bid</div>
                    <div className="flex items-center"><div className="w-3 h-1 bg-hl-red mr-2"></div>My Ask</div>
                </div>

                <div className="flex-1 w-full h-full min-h-[300px] mt-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={marketData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="timestamp" hide />
                      <YAxis domain={['auto', 'auto']} orientation="right" stroke="#4b5563" tick={{fontSize: 12}} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#141519', borderColor: '#2a2d35', color: '#fff' }}
                        labelStyle={{ display: 'none' }}
                        formatter={(value: any) => parseFloat(value).toFixed(2)}
                      />
                      {/* Market Mid Price */}
                      <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      
                      {/* Strategy Reservation Price - The "Soul" of the bot */}
                      <Line type="step" dataKey="reservation" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                      
                      {/* Quotes */}
                      <Line type="step" dataKey="bid" stroke="#2ebd85" strokeWidth={1} dot={false} opacity={0.6} />
                      <Line type="step" dataKey="ask" stroke="#f6465d" strokeWidth={1} dot={false} opacity={0.6} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Control Panel & Internal State */}
              <div className="space-y-6">
                {/* Parameters */}
                <div className="bg-hl-card border border-hl-border rounded-xl p-4">
                    <h4 className="text-xs font-bold text-gray-500 mb-4 uppercase flex items-center">
                        <Settings size={14} className="mr-2" /> 策略参数 (Strategy Params)
                    </h4>
                    
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-400">Inventory Aversion (γ)</span>
                                <span className="text-white font-mono">{riskAversion.toFixed(2)}</span>
                            </div>
                            <input 
                                type="range" min="0.01" max="0.5" step="0.01"
                                value={riskAversion}
                                onChange={(e) => setRiskAversion(parseFloat(e.target.value))}
                                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-hl-accent"
                            />
                            <p className="text-[10px] text-gray-500 mt-1">值越大，库存稍微偏离 0 就会大幅调整报价。</p>
                        </div>
                        
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-400">Market Volatility (σ)</span>
                                <span className="text-white font-mono">{volatility.toFixed(2)}</span>
                            </div>
                            <input 
                                type="range" min="0.1" max="2.0" step="0.1"
                                value={volatility}
                                onChange={(e) => setVolatility(parseFloat(e.target.value))}
                                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-hl-blue"
                            />
                            <p className="text-[10px] text-gray-500 mt-1">波动率越大，点差越宽。</p>
                        </div>
                    </div>
                </div>

                {/* Live Internals Visualizer */}
                <div className="bg-hl-card border border-hl-border rounded-xl p-4">
                   <h4 className="text-xs font-bold text-gray-500 mb-3 uppercase flex items-center">
                       <Activity size={14} className="mr-2" /> 内部状态 (Internals)
                   </h4>
                   
                   <div className="grid grid-cols-2 gap-4 mb-4">
                       <div className="bg-[#0d0e11] p-2 rounded border border-hl-border text-center">
                           <div className="text-[10px] text-gray-500">Inventory</div>
                           <div className={`text-lg font-mono font-bold ${simState.inventory === 0 ? 'text-gray-300' : simState.inventory > 0 ? 'text-hl-green' : 'text-hl-red'}`}>
                               {simState.inventory}
                           </div>
                       </div>
                       <div className="bg-[#0d0e11] p-2 rounded border border-hl-border text-center">
                           <div className="text-[10px] text-gray-500">Skew</div>
                           <div className="text-lg font-mono font-bold text-hl-accent">
                               {(simState.reservationPrice - simState.midPrice).toFixed(2)}
                           </div>
                       </div>
                   </div>

                   <div className="space-y-2 text-xs font-mono">
                       <div className="flex justify-between">
                           <span className="text-hl-red">My Ask</span>
                           <span>{simState.myAsk.toFixed(2)}</span>
                       </div>
                       <div className="flex justify-between font-bold">
                           <span className="text-hl-accent">Reservation</span>
                           <span>{simState.reservationPrice.toFixed(2)}</span>
                       </div>
                       <div className="flex justify-between text-gray-500">
                           <span>Mid Price</span>
                           <span>{simState.midPrice.toFixed(2)}</span>
                       </div>
                       <div className="flex justify-between">
                           <span className="text-hl-green">My Bid</span>
                           <span>{simState.myBid.toFixed(2)}</span>
                       </div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        );
        
      case Phase.Reality:
        return (
          <div className="animate-fade-in">
             <div className="mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">阶段五：基础设施与实战</h1>
              <p className="text-gray-400">当你拥有了完美的策略代码，接下来就是“拼硬件”。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                    { icon: Server, title: "裸金属服务器", cost: "$800+/月", desc: "独占 CPU 资源，无虚拟化噪音。" },
                    { icon: Network, title: "主机托管 (Colo)", cost: "$5000+/月", desc: "服务器放在交易所机房隔壁，光纤直连。" },
                    { icon: BarChart3, title: "L3 数据源", cost: "$2000+/月", desc: "购买逐笔成交数据用于回测。" },
                    { icon: DollarSign, title: "最低资金", cost: "$10,000+", desc: "HFT 需要一定的资本厚度来承受回撤。" },
                ].map((item, idx) => (
                    <div key={idx} className="bg-hl-card border border-hl-border p-6 rounded-xl flex flex-col items-center text-center hover:border-hl-green/50 transition-colors">
                        <item.icon className="text-hl-green mb-4" size={32} />
                        <h3 className="text-white font-bold mb-1">{item.title}</h3>
                        <div className="text-hl-green font-mono text-sm mb-2">{item.cost}</div>
                        <p className="text-gray-500 text-xs">{item.desc}</p>
                    </div>
                ))}
            </div>

            <ContentCard title="为什么散户几乎不可能成功？">
                <div className="space-y-4">
                  <div className="flex items-start space-x-4 bg-hl-red/10 p-4 rounded-lg border border-hl-red/20">
                    <AlertTriangle className="text-hl-red shrink-0 mt-1" />
                    <div>
                      <h4 className="text-hl-red font-bold mb-1 text-sm">延迟的马太效应</h4>
                      <p className="text-xs text-gray-300">
                        这是一个“赢家通吃”的游戏。如果你比竞争对手慢 1 毫秒，你永远抢不到好的单子，却总是会接到“有毒”的单子（即别人知道价格要变了，赶紧卖给你，你还没反应过来）。
                      </p>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-400 leading-relaxed">
                    即使在 Hyperliquid 这样的高性能 DEX，你也面临着与 Wintermute、Jump 等顶级做市商的竞争。他们拥有更低的费率等级（Maker Rebates），这不仅是成本优势，更是生存优势。
                  </p>
                </div>
            </ContentCard>
          </div>
        );
        
      default:
        return <div className="text-gray-500">模块建设中...</div>;
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0b0d] text-gray-300 font-sans selection:bg-hl-green selection:text-white">
      {/* Sidebar */}
      <div className="w-64 bg-[#141519] border-r border-hl-border flex flex-col shrink-0">
        <div className="p-6 flex items-center border-b border-hl-border">
          <div className="bg-hl-green/20 p-2 rounded-lg mr-3">
            <Activity className="text-hl-green" size={24} />
          </div>
          <div>
            <h1 className="text-white font-bold tracking-tight">HFT Master</h1>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest">Hyperliquid 做市指南</div>
          </div>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <div className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-4 px-3">课程大纲</div>
          <NavItem 
            active={activePhase === Phase.Theory} 
            onClick={() => setActivePhase(Phase.Theory)} 
            icon={BookOpen} 
            label="1. 核心概念" 
            phase={Phase.Theory}
          />
           <NavItem 
            active={activePhase === Phase.Stack} 
            onClick={() => setActivePhase(Phase.Stack)} 
            icon={Layers} 
            label="2. 技术栈选型" 
            phase={Phase.Stack}
          />
          <NavItem 
            active={activePhase === Phase.Code} 
            onClick={() => setActivePhase(Phase.Code)} 
            icon={Code} 
            label="3. 代码架构" 
            phase={Phase.Code}
          />
          
          <div className="my-4 border-t border-hl-border"></div>
          
          <div className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-4 px-3">实验室</div>
          <NavItem 
            active={activePhase === Phase.Simulation} 
            onClick={() => setActivePhase(Phase.Simulation)} 
            icon={Terminal} 
            label="策略模拟器" 
            phase={Phase.Simulation}
          />
          
          <div className="my-4 border-t border-hl-border"></div>
          
          <NavItem 
            active={activePhase === Phase.Reality} 
            onClick={() => setActivePhase(Phase.Reality)} 
            icon={AlertTriangle} 
            label="实战与成本" 
            phase={Phase.Reality}
          />
        </nav>

        <div className="p-4 border-t border-hl-border bg-[#0d0e11]">
          <div className="flex items-center text-xs text-gray-500">
            <div className="w-2 h-2 rounded-full bg-hl-green mr-2 animate-pulse"></div>
            Hyperliquid Mainnet
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-[#0a0b0d] p-8 relative">
        {/* Dynamic Background Mesh */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
           <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-hl-green/20 rounded-full blur-[128px]"></div>
           <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-hl-blue/10 rounded-full blur-[128px]"></div>
        </div>
        
        <div className="relative z-10 max-w-6xl mx-auto h-full flex flex-col">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;