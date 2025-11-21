import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Cpu, 
  Layers, 
  Code, 
  PlayCircle, 
  AlertTriangle, 
  Activity, 
  Server, 
  DollarSign, 
  Zap,
  Terminal,
  PauseCircle,
  RefreshCcw,
  Settings,
  BarChart3,
  Network,
  ShieldAlert
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
} from 'recharts';
import { Phase, SimulationStats } from './types';

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
    <pre className="p-4 overflow-x-auto text-sm font-mono text-gray-300 scrollbar-thin scrollbar-thumb-hl-border scrollbar-track-transparent">
      <code>{code}</code>
    </pre>
  </div>
);

// --- Logic & Data ---

const RUST_PRODUCTION_CODE = `// Hyperliquid HFT Core Engine (Rust)
// 生产环境架构标准示例 v1.0

use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use futures_util::{StreamExt, SinkExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex; // 在极高频场景推荐使用 crossbeam 或无锁队列
use std::time::{Duration, Instant};

// 定义 L2 订单簿数据结构 (Simd-Json 友好)
#[derive(Debug, Deserialize)]
struct L2Book {
    coin: String,
    levels: Vec<Vec<String>>, // [price, size] - 解析为字符串防止精度丢失
    time: u64,
}

#[derive(Debug, Clone)]
struct StrategyState {
    inventory: f64,    // 当前持仓 (ETH)
    cash: f64,         // 可用资金 (USDC)
    active_orders: Vec<String>, // 活跃订单 ID
}

#[tokio::main]
async fn main() {
    // 1. 初始化高性能日志 (带微秒时间戳)
    env_logger::builder().format_timestamp_micros().init();

    // 2. 建立 WebSocket 连接 (Hyperliquid Mainnet)
    let url = "wss://api.hyperliquid.xyz/ws";
    let (ws_stream, _) = connect_async(url).await.expect("Failed to connect");
    let (mut write, mut read) = ws_stream.split();
    println!("✅ Connected to Hyperliquid WebSocket Feed");

    // 3. 订阅核心频道 (L2 Book & User Fills)
    // "nTrades" 用于流式成交计算，"l2Book" 用于深度计算
    let sub_msg = r#"{ "method": "subscribe", "subscription": { "type": "l2Book", "coin": "ETH" } }"#;
    write.send(sub_msg.into()).await.expect("Failed to subscribe");

    // 4. 共享状态 (Hot State)
    let state = Arc::new(Mutex::new(StrategyState {
        inventory: 0.0,
        cash: 10000.0,
        active_orders: vec![],
    }));

    println!("🚀 HFT Engine Started. Listening for ticks...");

    // 5. 极速事件循环 (Hot Path Loop)
    while let Some(msg) = read.next().await {
        // 延迟监控点 A
        let start = Instant::now(); 
        
        match msg {
            Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                // 解析阶段 (关键路径: 使用 simd-json 优化性能)
                // let book: L2Book = simd_json::from_str(&text).unwrap();
                
                // 这里的逻辑必须在 <50us 内完成以保持竞争力
                process_tick(&text, state.clone()).await;
            },
            Ok(tokio_tungstenite::tungstenite::Message::Ping(_)) => {
                // 自动处理 Ping/Pong 保持连接存活
            },
            Err(e) => eprintln!("WS Error: {:?}", e),
            _ => {}
        }

        // 延迟监控点 B: 如果处理耗时超过 100us，发出警告
        if start.elapsed().as_micros() > 100 {
             eprintln!("⚠️ Slow Tick Warning: {}us", start.elapsed().as_micros());
        }
    }
}

// 核心策略逻辑
async fn process_tick(data: &str, state: Arc<Mutex<StrategyState>>) {
    // 1. 解析行情
    // 2. 更新本地 Orderbook 状态
    // 3. 计算 Avellaneda-Stoikov 指标 (Reservation Price)
    // 4. 风险检查 (Risk Check)
    // 5. 异步发送下单请求 (Reqwest / Hyper)
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
          const shock = (Math.random() - 0.5) * volatility * 2; 
          const newMid = prev.midPrice + shock;
          
          // 2. Strategy: Calculate Reservation Price (r)
          // r = s - q * gamma * sigma^2
          const inventorySkew = prev.inventory * riskAversion * volatility * 5; 
          const newReservation = newMid - inventorySkew;
          
          // 3. Calculate Optimal Quotes
          const halfSpread = volatility * 0.8; 
          const newBid = newReservation - halfSpread;
          const newAsk = newReservation + halfSpread;
          
          // 4. Matching Engine Simulation (Poisson Process)
          const probHitAsk = Math.exp(-1.5 * (newAsk - newMid)); 
          const probHitBid = Math.exp(-1.5 * (newMid - newBid)); 
          
          let nextInv = prev.inventory;
          let nextCash = prev.cash;
          let tradeOccurred = false;

          // Simulate Ask Fill
          if (Math.random() < probHitAsk * 0.3) { 
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
      }, 50); 
    }
    return () => clearInterval(interval);
  }, [simRunning, riskAversion, volatility]);

  const renderContent = () => {
    switch (activePhase) {
      case Phase.Theory:
        return (
          <div className="animate-fade-in">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">Rust 高频策略基础</h1>
              <p className="text-gray-400">为什么在 Hyperliquid 这样的高性能链上交易所，Rust 是唯一选择？</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ContentCard title="技术优势">
                <ul className="space-y-4 text-sm text-gray-300">
                  <li className="flex items-start">
                    <Zap className="text-hl-green mr-2 shrink-0" size={18} />
                    <span><strong>零成本抽象 (Zero-cost Abstractions)：</strong> Rust 让你在写高级代码的同时，编译出汇编级的机器码。</span>
                  </li>
                  <li className="flex items-start">
                    <ShieldAlert className="text-hl-green mr-2 shrink-0" size={18} />
                    <span><strong>内存安全 (Memory Safety)：</strong> HFT 系统需要 7x24 运行。C++ 常见的段错误 (Segfaults) 在 Rust 中几乎绝迹。</span>
                  </li>
                  <li className="flex items-start">
                    <Cpu className="text-hl-green mr-2 shrink-0" size={18} />
                    <span><strong>无 GC (No Garbage Collection)：</strong> Java 和 Go 的垃圾回收会造成毫秒级的停顿 (STW)，这在高频交易中是致命的。Rust 像 C++ 一样手动管理内存，但更安全。</span>
                  </li>
                </ul>
              </ContentCard>

              <ContentCard title="Hyperliquid 特性">
                <div className="space-y-4 text-sm text-gray-300">
                  <p>Hyperliquid 是基于 HyperBFT 共识构建的 L1 链，这意味着：</p>
                  <div className="bg-[#0d0e11] p-3 rounded border border-hl-border">
                    <span className="text-hl-accent font-bold">Block Latency:</span> &lt; 200ms<br/>
                    <span className="text-hl-blue font-bold">API Limit:</span> 1200 requests/min (IP based)<br/>
                    <span className="text-hl-green font-bold">Tech Stack:</span> 整个交易所后端也是用 Rust 编写的。
                  </div>
                  <p className="text-xs text-gray-400">
                    使用 Rust 客户端意味着你可以复用部分官方 SDK 的逻辑，并获得最佳的序列化/反序列化性能。
                  </p>
                </div>
              </ContentCard>
            </div>
          </div>
        );

      case Phase.Stack:
        return (
          <div className="animate-fade-in">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">Rust 生产级工具链</h1>
              <p className="text-gray-400">抛弃 Python，以下是构建真实盈利机器人的核心依赖库。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <ContentCard title="核心 Crates (依赖库)">
                <div className="space-y-4">
                   <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                      <span className="font-mono text-hl-green font-bold">tokio</span>
                      <span className="text-xs text-gray-500">异步运行时 (The Runtime)</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                      <span className="font-mono text-hl-green font-bold">tungstenite</span>
                      <span className="text-xs text-gray-500">WebSocket 客户端</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                      <span className="font-mono text-hl-green font-bold">simd-json</span>
                      <span className="text-xs text-gray-500">利用 CPU 指令集加速 JSON 解析</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                      <span className="font-mono text-hl-green font-bold">reqwest</span>
                      <span className="text-xs text-gray-500">HTTP 客户端 (用于非实时操作)</span>
                   </div>
                </div>
              </ContentCard>

              <ContentCard title="性能调优 (Profiling)">
                <div className="space-y-4">
                   <div className="bg-[#0d0e11] p-4 rounded border border-hl-border">
                     <h4 className="font-bold text-white mb-1 flex items-center"><Activity size={16} className="mr-2 text-hl-red"/> Flamegraph (火焰图)</h4>
                     <p className="text-xs text-gray-400">
                       使用 <code className="bg-gray-800 px-1">cargo flamegraph</code> 分析 CPU 热点。如果你发现 20% 的时间花在 JSON 解析上，就必须优化它。
                     </p>
                   </div>
                   <div className="bg-[#0d0e11] p-4 rounded border border-hl-border">
                     <h4 className="font-bold text-white mb-1 flex items-center"><Server size={16} className="mr-2 text-hl-blue"/> Criterion.rs</h4>
                     <p className="text-xs text-gray-400">
                       Rust 的微基准测试框架。在修改任何核心逻辑前，先写 benchmark 确保没有引入性能倒退。
                     </p>
                   </div>
                </div>
              </ContentCard>
            </div>
          </div>
        );

      case Phase.Code:
        return (
          <div className="animate-fade-in h-full flex flex-col">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-white mb-2">生产环境代码架构</h1>
              <p className="text-gray-400">这是你启动 `cargo new hft_bot` 后应该编写的第一份代码。</p>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <CodeBlock code={RUST_PRODUCTION_CODE} />
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-hl-card border-l-2 border-hl-green rounded-r-lg">
                  <h4 className="font-bold text-sm text-hl-green mb-1">Simd-Json</h4>
                  <p className="text-xs text-gray-400">
                    标准库的 `serde_json` 很好，但对于 HFT 来说太慢了。`simd-json` 利用 AVX2/SSE4.2 指令集，能将解析速度提升 2-3 倍。
                  </p>
                </div>
                <div className="p-4 bg-hl-card border-l-2 border-hl-blue rounded-r-lg">
                  <h4 className="font-bold text-sm text-hl-blue mb-1">Arc &lt;Mutex&gt;</h4>
                  <p className="text-xs text-gray-400">
                    在演示代码中我们使用了 Mutex 锁。在极致优化场景下，应该使用 **Crossbeam Channels** 或 **Ring Buffer** 来在 WebSocket 线程和策略线程之间传递数据，实现无锁 (Lock-free) 通信。
                  </p>
                </div>
                <div className="p-4 bg-hl-card border-l-2 border-hl-red rounded-r-lg">
                  <h4 className="font-bold text-sm text-hl-red mb-1">Hot Path Warning</h4>
                  <p className="text-xs text-gray-400">
                    在 `process_tick` 函数中，绝对禁止进行任何 I/O 操作（如打印日志到文件、数据库写入）。这些操作必须异步分发到低优先级线程。
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
                <h1 className="text-3xl font-bold text-white mb-1">Rust 策略逻辑可视化</h1>
                <p className="text-gray-400 text-sm">这就是你的 Rust 代码在微秒级别执行的数学逻辑 (Avellaneda-Stoikov)。</p>
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
                    <div className="flex items-center"><div className="w-3 h-1 bg-hl-blue mr-2"></div>Mid Price</div>
                    <div className="flex items-center"><div className="w-3 h-1 bg-hl-accent mr-2"></div>Reservation Price (r)</div>
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
                      <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      <Line type="step" dataKey="reservation" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                      <Line type="step" dataKey="bid" stroke="#2ebd85" strokeWidth={1} dot={false} opacity={0.6} />
                      <Line type="step" dataKey="ask" stroke="#f6465d" strokeWidth={1} dot={false} opacity={0.6} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Control Panel */}
              <div className="space-y-6">
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
                        </div>
                    </div>
                </div>

                <div className="bg-hl-card border border-hl-border rounded-xl p-4">
                   <h4 className="text-xs font-bold text-gray-500 mb-3 uppercase flex items-center">
                       <Activity size={14} className="mr-2" /> 实时状态 (Real-time State)
                   </h4>
                   
                   <div className="grid grid-cols-2 gap-4 mb-4">
                       <div className="bg-[#0d0e11] p-2 rounded border border-hl-border text-center">
                           <div className="text-[10px] text-gray-500">Inventory (ETH)</div>
                           <div className={`text-lg font-mono font-bold ${simState.inventory === 0 ? 'text-gray-300' : simState.inventory > 0 ? 'text-hl-green' : 'text-hl-red'}`}>
                               {simState.inventory}
                           </div>
                       </div>
                       <div className="bg-[#0d0e11] p-2 rounded border border-hl-border text-center">
                           <div className="text-[10px] text-gray-500">Price Skew</div>
                           <div className="text-lg font-mono font-bold text-hl-accent">
                               {(simState.reservationPrice - simState.midPrice).toFixed(2)}
                           </div>
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
              <h1 className="text-3xl font-bold text-white mb-2">实战部署检查清单</h1>
              <p className="text-gray-400">代码写好后，如何部署才能确保你的 Rust 程序跑得飞快？</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                    { icon: Server, title: "AWS Local Zones", cost: "Latency < 1ms", desc: "必须选择离交易所最近的节点 (通常是 Tokyo 或 Virginia)。" },
                    { icon: Network, title: "专线网络", cost: "Direct Connect", desc: "确保你的网络包不走公网路由，而是走优化的金融专线。" },
                    { icon: BarChart3, title: "日志分级", cost: "Zero Overhead", desc: "生产环境只记录 ERROR 级别日志。Debug 日志会拖慢 I/O。" },
                    { icon: DollarSign, title: "资金管理", cost: "Risk Limits", desc: "在代码中硬编码 Max Position 限制，防止算法故障导致爆仓。" },
                ].map((item, idx) => (
                    <div key={idx} className="bg-hl-card border border-hl-border p-6 rounded-xl flex flex-col items-center text-center hover:border-hl-green/50 transition-colors">
                        <item.icon className="text-hl-green mb-4" size={32} />
                        <h3 className="text-white font-bold mb-1">{item.title}</h3>
                        <div className="text-hl-green font-mono text-sm mb-2">{item.cost}</div>
                        <p className="text-gray-500 text-xs">{item.desc}</p>
                    </div>
                ))}
            </div>

            <ContentCard title="安全警示：私钥管理">
                <div className="space-y-4">
                  <div className="flex items-start space-x-4 bg-hl-red/10 p-4 rounded-lg border border-hl-red/20">
                    <AlertTriangle className="text-hl-red shrink-0 mt-1" />
                    <div>
                      <h4 className="text-hl-red font-bold mb-1 text-sm">绝对不要在代码中硬编码私钥</h4>
                      <p className="text-xs text-gray-300">
                        Rust 程序在启动时应通过环境变量 (ENV VAR) 或专门的密钥管理服务 (AWS KMS) 读取私钥。编译后的二进制文件如果包含私钥字符串，可以被反编译窃取。
                      </p>
                    </div>
                  </div>
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
            <h1 className="text-white font-bold tracking-tight">Rust HFT</h1>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest">Hyperliquid 架构师</div>
          </div>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <div className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-4 px-3">理论与工具</div>
          <NavItem 
            active={activePhase === Phase.Theory} 
            onClick={() => setActivePhase(Phase.Theory)} 
            icon={BookOpen} 
            label="1. Rust 核心优势" 
            phase={Phase.Theory}
          />
           <NavItem 
            active={activePhase === Phase.Stack} 
            onClick={() => setActivePhase(Phase.Stack)} 
            icon={Layers} 
            label="2. 生产级 Crates" 
            phase={Phase.Stack}
          />
          <NavItem 
            active={activePhase === Phase.Code} 
            onClick={() => setActivePhase(Phase.Code)} 
            icon={Code} 
            label="3. 代码脚手架" 
            phase={Phase.Code}
          />
          
          <div className="my-4 border-t border-hl-border"></div>
          
          <div className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-4 px-3">核心逻辑</div>
          <NavItem 
            active={activePhase === Phase.Simulation} 
            onClick={() => setActivePhase(Phase.Simulation)} 
            icon={Terminal} 
            label="策略模拟 (Stoikov)" 
            phase={Phase.Simulation}
          />
          
          <div className="my-4 border-t border-hl-border"></div>
          
          <NavItem 
            active={activePhase === Phase.Reality} 
            onClick={() => setActivePhase(Phase.Reality)} 
            icon={Server} 
            label="部署与实战" 
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