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
  ShieldAlert,
  Terminal,
  ChevronRight,
  PauseCircle,
  RefreshCcw,
  Zap,
  Lock,
  Globe,
  Network,
  Workflow
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine 
} from 'recharts';
import { Phase, Order, MarketState, SimulationStats } from './types';

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
        ? 'bg-hl-accent/10 text-hl-accent border-l-4 border-hl-accent' 
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
      <span className="bg-gradient-to-r from-hl-blue to-hl-accent w-2 h-6 mr-3 rounded-sm"></span>
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

const RUST_CODE_SNIPPET = `// --- 全能网关适配器 (Universal Gateway Adapter) ---

// 1. 定义通用交易所接口 (Trait)
// 所有 DEX (Hyperliquid, dYdX, Uniswap) 必须实现此接口
#[async_trait]
pub trait ExchangeAdapter: Send + Sync {
    async fn subscribe_orderbook(&self, symbol: &str) -> Result<Receiver<OrderBookUpdate>>;
    async fn place_order(&self, order: Order) -> Result<OrderId>;
    async fn cancel_order(&self, id: OrderId) -> Result<()>;
    // 处理链上签名的通用方法
    fn sign_payload(&self, payload: &[u8]) -> Signature; 
}

// 2. 适配器实现：CLOB (订单簿) vs AMM (自动做市商)
pub struct HyperliquidAdapter { /* ... */ } // CLOB: 高频挂单
pub struct UniswapAdapter { /* ... */ }     // AMM: 需处理 Swap/Liquidity

// 3. 策略引擎逻辑 (与具体交易所解耦)
// 策略根本不知道自己在哪个交易所跑，它只针对 "抽象市场" 编程
async fn run_strategy(exchange: Box<dyn ExchangeAdapter>) {
    let mut rx = exchange.subscribe_orderbook("ETH-USD").await.unwrap();
    
    while let Some(update) = rx.recv().await {
        let signal = strategy.calculate(update);
        if let Some(order) = signal {
            // 无论是 Hyperliquid 还是 dYdX，统一调用
            exchange.place_order(order).await; 
        }
    }
}`;

// --- Main Application ---

const App: React.FC = () => {
  const [activePhase, setActivePhase] = useState<Phase>(Phase.Theory);
  
  // Simulation State
  const [simRunning, setSimRunning] = useState(false);
  const [marketData, setMarketData] = useState<MarketState[]>([]);
  const [currentPrice, setCurrentPrice] = useState(1000);
  const [stats, setStats] = useState<SimulationStats>({ pnl: 0, trades: 0, volume: 0, latency: 45 });
  const [inventory, setInventory] = useState(0);
  
  const maxDataPoints = 50;

  // Simulation Loop
  useEffect(() => {
    let interval: number | undefined;

    if (simRunning) {
      interval = window.setInterval(() => {
        const time = Date.now();
        
        // Random Walk Price
        const volatility = 0.8;
        const change = (Math.random() - 0.5) * volatility;
        const newPrice = Math.max(100, currentPrice + change);
        
        setCurrentPrice(newPrice);
        
        // Update Chart Data
        setMarketData(prev => {
          const newData = [...prev, { price: newPrice, timestamp: time }];
          if (newData.length > maxDataPoints) newData.shift();
          return newData;
        });

        // Simulate MM Logic
        // If price moves against inventory, lose money. If stable, make spread.
        const spread = 0.05; // captured spread
        const adverseSelection = Math.abs(change) > 0.3; // big move
        
        if (adverseSelection) {
           // Inventory hurt by sharp move
           setStats(s => ({
             ...s,
             pnl: s.pnl - (Math.abs(inventory) * Math.abs(change) * 5),
             latency: Math.floor(Math.random() * 20) + 30 // latency jitter
           }));
           // Bot panic sells/buys to neutralize
           setInventory(prev => prev * 0.5); 
        } else {
          // Capture spread
          const tradeHappened = Math.random() > 0.6;
          if (tradeHappened) {
            const side = Math.random() > 0.5 ? 1 : -1;
            setInventory(prev => {
                const newInv = prev + side;
                // If inventory gets too high, stop making markets on that side (simplified)
                if (Math.abs(newInv) > 10) return prev; 
                return newInv;
            });
            setStats(s => ({
              ...s,
              pnl: s.pnl + spread,
              trades: s.trades + 1,
              volume: s.volume + newPrice,
              latency: Math.floor(Math.random() * 5) + 5 // fast execution
            }));
          }
        }

      }, 100); // 100ms ticks
    }

    return () => clearInterval(interval);
  }, [simRunning, currentPrice, inventory]);


  const renderContent = () => {
    switch (activePhase) {
      case Phase.Theory:
        return (
          <div className="animate-fade-in">
            <div className="mb-8">
              <div className="flex items-center space-x-3 mb-2">
                <Globe className="text-hl-accent" size={32} />
                <h1 className="text-3xl font-bold text-white">DEX 通用连接理论</h1>
              </div>
              <p className="text-gray-400">接入所有去中心化交易所的秘诀在于：<span className="text-white font-bold">抽象化 (Abstraction)</span>。虽然 Hyperliquid, dYdX, Uniswap 底层协议不同，但对量化机器人来说，它们只是数据的生产者和订单的消费者。</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ContentCard title="交易所形态分类 (Taxonomy)">
                <ul className="space-y-4">
                  <li className="bg-hl-dark p-3 rounded border border-hl-border">
                    <div className="flex items-center mb-1">
                      <Layers className="text-hl-blue mr-2" size={16} />
                      <strong className="text-white text-sm">CLOB (中央限价订单簿)</strong>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">
                      代表：<span className="text-hl-blue">Hyperliquid, dYdX, Vertex</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      逻辑最接近币安/纳斯达克。高频策略通过 <code className="text-hl-accent">limit order</code> 提供流动性。核心是速度和库存管理。
                    </p>
                  </li>
                  <li className="bg-hl-dark p-3 rounded border border-hl-border">
                    <div className="flex items-center mb-1">
                      <RefreshCcw className="text-hl-green mr-2" size={16} />
                      <strong className="text-white text-sm">AMM (自动做市商)</strong>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">
                      代表：<span className="text-hl-green">Uniswap, Curve, Raydium</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      没有买卖单，只有流动性池。策略变成 "JIT Liquidity" (即时流动性) 或 "Sandwich Attacks" (三明治攻击)。<span className="text-hl-red">传统 HFT 做市策略需大幅修改。</span>
                    </p>
                  </li>
                </ul>
              </ContentCard>
              
              <ContentCard title="全链连接挑战">
                <div className="space-y-4">
                  <div className="flex items-start space-x-4 bg-hl-blue/10 p-4 rounded-lg border border-hl-blue/20">
                    <Network className="text-hl-blue shrink-0 mt-1" />
                    <div>
                      <h4 className="text-hl-blue font-bold mb-1 text-sm">RPC 节点瓶颈</h4>
                      <p className="text-xs text-gray-300">
                        不像 Hyperliquid 是专有 AppChain，连接 Uniswap 需要通过以太坊 RPC 节点。节点延迟通常在 50-200ms，这是 HFT 的噩梦。解决方案：运行自己的验证节点 (Validator Node)。
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-4 bg-hl-accent/10 p-4 rounded-lg border border-hl-accent/20">
                    <Lock className="text-hl-accent shrink-0 mt-1" />
                    <div>
                      <h4 className="text-hl-accent font-bold mb-1 text-sm">签名与 Gas 管理</h4>
                      <p className="text-xs text-gray-300">
                        每个 DEX 的签名算法不同 (EIP-712 vs Ed25519)。通用架构必须封装这些加密原语。同时，你必须监控不同链的 Gas 价格，防止 Gas 费吞噬利润。
                      </p>
                    </div>
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
              <h1 className="text-3xl font-bold text-white mb-2">阶段二：技术栈与极致优化</h1>
              <p className="text-gray-400">在高频领域，每一微秒（µs）的延迟都决定了你是吃肉还是买单。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-hl-card border border-hl-green/30 rounded-xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Cpu size={100} />
                </div>
                <h3 className="text-xl font-bold text-hl-green mb-2">Rust</h3>
                <div className="text-xs font-mono bg-hl-green/10 text-hl-green inline-block px-2 py-1 rounded mb-4">唯一推荐</div>
                <p className="text-sm text-gray-400">
                  内存安全 + 零成本抽象。Tokio 异步运行时提供了完美的并发模型。没有 GC 暂停意味着没有意外亏损。
                </p>
              </div>

              <div className="bg-hl-card border border-hl-border rounded-xl p-6 opacity-75">
                <h3 className="text-xl font-bold text-white mb-2">C++</h3>
                <div className="text-xs font-mono bg-gray-700 text-gray-300 inline-block px-2 py-1 rounded mb-4">传统之选</div>
                <p className="text-sm text-gray-400">
                  HFT 的老牌王者。控制力极强，但内存管理复杂，容易出现 Segfault。维护成本高于 Rust。
                </p>
              </div>
              
              <div className="bg-hl-card border border-hl-red/30 rounded-xl p-6 opacity-60">
                <h3 className="text-xl font-bold text-white mb-2">Python</h3>
                <div className="text-xs font-mono bg-hl-red/10 text-hl-red inline-block px-2 py-1 rounded mb-4">仅限原型</div>
                <p className="text-sm text-gray-400">
                  解释型语言太慢了。仅用于数据分析、回测逻辑验证或 REST API 交互。绝不上生产环境。
                </p>
              </div>
            </div>

            <ContentCard title="系统级调优 (System Tuning)">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="bg-[#0d0e11] p-4 rounded border border-hl-border">
                   <div className="flex items-center mb-2 text-hl-accent">
                      <Zap size={18} className="mr-2" />
                      <span className="font-bold text-sm">Kernel Bypass</span>
                   </div>
                   <p className="text-xs text-gray-400 leading-relaxed">
                     使用 DPDK 或 Solarflare OpenOnload。绕过操作系统笨重的 TCP/IP 协议栈，让网卡直接与用户空间程序交换数据。
                   </p>
                 </div>
                 
                 <div className="bg-[#0d0e11] p-4 rounded border border-hl-border">
                   <div className="flex items-center mb-2 text-hl-accent">
                      <Lock size={18} className="mr-2" />
                      <span className="font-bold text-sm">CPU Isolation</span>
                   </div>
                   <p className="text-xs text-gray-400 leading-relaxed">
                     使用 <code className="bg-gray-800 px-1 rounded">isolcpus</code> 和 <code className="bg-gray-800 px-1 rounded">taskset</code>。将策略线程“钉”在特定物理核心上，独占 L1/L2 缓存，杜绝上下文切换。
                   </p>
                 </div>

                 <div className="bg-[#0d0e11] p-4 rounded border border-hl-border">
                   <div className="flex items-center mb-2 text-hl-accent">
                      <Code size={18} className="mr-2" />
                      <span className="font-bold text-sm">SIMD Parsing</span>
                   </div>
                   <p className="text-xs text-gray-400 leading-relaxed">
                     使用 <code className="bg-gray-800 px-1 rounded">simd-json</code>。利用 CPU 的 AVX2/AVX-512 指令集并行解析 JSON 数据，比标准库快 2-3 倍。
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
              <h1 className="text-3xl font-bold text-white mb-2">通用网关架构 (Gateway Pattern)</h1>
              <p className="text-gray-400">如何用一套代码控制所有交易所？答案是：适配器模式。</p>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <CodeBlock code={RUST_CODE_SNIPPET} />
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-hl-card border-l-2 border-hl-blue rounded-r-lg">
                  <div className="flex items-center mb-2 text-hl-blue">
                    <Workflow size={18} className="mr-2" />
                    <h4 className="font-bold text-sm">策略解耦 (Decoupling)</h4>
                  </div>
                  <p className="text-xs text-gray-400">
                    策略层不应包含 <code className="font-mono">if exchange == "binance"</code> 这样的代码。所有差异化逻辑（API 端点、签名格式）都封装在 Adapter 中。
                  </p>
                </div>
                <div className="p-4 bg-hl-card border-l-2 border-hl-accent rounded-r-lg">
                  <div className="flex items-center mb-2 text-hl-accent">
                    <Globe size={18} className="mr-2" />
                    <h4 className="font-bold text-sm">多链支持</h4>
                  </div>
                  <p className="text-xs text-gray-400">
                    适配器还需管理不同链的 RPC 连接。例如 Solana 的适配器需要连接 gRPC 节点，而 Arbitrum 适配器连接 Websocket 节点。
                  </p>
                </div>
                <div className="p-4 bg-hl-card border-l-2 border-hl-green rounded-r-lg">
                  <div className="flex items-center mb-2 text-hl-green">
                    <Layers size={18} className="mr-2" />
                    <h4 className="font-bold text-sm">统一数据模型</h4>
                  </div>
                  <p className="text-xs text-gray-400">
                    所有适配器必须将交易所原始的 JSON 数据转换为内部统一的 <code className="font-mono">NormalizedOrderBook</code> 结构体。
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
                <h1 className="text-3xl font-bold text-white mb-1">策略模拟器</h1>
                <p className="text-gray-400 text-sm">可视化：库存风险与点差捕捉模型</p>
              </div>
              <div className="flex items-center space-x-4">
                 <div className="flex flex-col items-end mr-4">
                    <span className={`text-xs font-mono ${stats.pnl >= 0 ? 'text-hl-green' : 'text-hl-red'}`}>
                      盈亏: ${stats.pnl.toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-500 font-mono">
                      延迟: {stats.latency}ms
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
                    setStats({ pnl: 0, trades: 0, volume: 0, latency: 45 });
                    setMarketData([]);
                    setInventory(0);
                    setCurrentPrice(1000);
                  }}
                  className="p-2 rounded-full bg-hl-card text-gray-400 hover:text-white border border-hl-border"
                >
                  <RefreshCcw size={18} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[400px]">
              {/* Chart Area */}
              <div className="lg:col-span-2 bg-[#0d0e11] border border-hl-border rounded-xl p-4 flex flex-col">
                <h3 className="text-sm font-bold text-gray-400 mb-4 flex justify-between">
                  <span>市场微观结构</span>
                  <span className="font-mono text-white">${currentPrice.toFixed(2)}</span>
                </h3>
                <div className="flex-1 w-full h-full min-h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={marketData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="timestamp" hide />
                      <YAxis domain={['auto', 'auto']} orientation="right" stroke="#4b5563" tick={{fontSize: 12}} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#141519', borderColor: '#2a2d35', color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                        labelStyle={{ display: 'none' }}
                      />
                      <ReferenceLine y={currentPrice} stroke="#3b82f6" strokeDasharray="3 3" opacity={0.5} />
                      {/* Bot's Orders Visualized around price */}
                      {simRunning && (
                        <>
                           <ReferenceLine y={currentPrice * 1.0005} stroke="#f6465d" strokeOpacity={0.3} label={{position: 'insideRight', value: '卖单', fill: '#f6465d', fontSize: 10}} />
                           <ReferenceLine y={currentPrice * 0.9995} stroke="#2ebd85" strokeOpacity={0.3} label={{position: 'insideRight', value: '买单', fill: '#2ebd85', fontSize: 10}} />
                        </>
                      )}
                      <Line 
                        type="monotone" 
                        dataKey="price" 
                        stroke="#8b5cf6" 
                        strokeWidth={2} 
                        dot={false} 
                        animationDuration={300}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Order Book & Stats */}
              <div className="space-y-6">
                {/* Live Book Visualization */}
                <div className="bg-hl-card border border-hl-border rounded-xl p-4 overflow-hidden">
                   <h4 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">实时本地订单簿</h4>
                   <div className="space-y-1 font-mono text-sm">
                      {/* Asks */}
                      {[4, 3, 2, 1].map(i => (
                        <div key={`ask-${i}`} className="flex justify-between text-hl-red relative group cursor-pointer hover:bg-hl-red/5 px-1">
                           <span className="z-10 relative">{(currentPrice + (i * 0.05)).toFixed(2)}</span>
                           <span className="z-10 relative text-gray-500">{(Math.random() * 1000).toFixed(0)}</span>
                           <div className="absolute right-0 top-0 bottom-0 bg-hl-red/10" style={{width: `${Math.random() * 60}%`}}></div>
                           {i === 1 && simRunning && <div className="absolute left-[-10px] text-hl-accent text-[10px] flex items-center">你的挂单</div>}
                        </div>
                      ))}
                      
                      <div className="py-1 text-center text-lg font-bold text-white bg-[#0d0e11] my-2 border-y border-hl-border">
                        {currentPrice.toFixed(2)}
                      </div>

                      {/* Bids */}
                      {[1, 2, 3, 4].map(i => (
                        <div key={`bid-${i}`} className="flex justify-between text-hl-green relative group cursor-pointer hover:bg-hl-green/5 px-1">
                           <span className="z-10 relative">{(currentPrice - (i * 0.05)).toFixed(2)}</span>
                           <span className="z-10 relative text-gray-500">{(Math.random() * 1000).toFixed(0)}</span>
                           <div className="absolute right-0 top-0 bottom-0 bg-hl-green/10" style={{width: `${Math.random() * 60}%`}}></div>
                           {i === 1 && simRunning && <div className="absolute left-[-10px] text-hl-accent text-[10px] flex items-center">你的挂单</div>}
                        </div>
                      ))}
                   </div>
                </div>

                {/* Inventory Widget */}
                <div className="bg-hl-card border border-hl-border rounded-xl p-4">
                  <h4 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">库存风险 (Inventory Risk)</h4>
                  <div className="relative h-4 bg-[#0d0e11] rounded-full overflow-hidden border border-hl-border">
                     <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-600"></div>
                     <div 
                        className={`absolute top-0 bottom-0 transition-all duration-300 ${inventory > 0 ? 'bg-hl-green left-1/2' : 'bg-hl-red right-1/2'}`}
                        style={{ width: `${Math.min(Math.abs(inventory) * 5, 50)}%` }}
                     ></div>
                  </div>
                  <div className="flex justify-between mt-2 text-xs font-mono">
                    <span className="text-hl-red">-100 ETH</span>
                    <span className="text-white">{inventory > 0 ? '+' : ''}{inventory} ETH</span>
                    <span className="text-hl-green">+100 ETH</span>
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500 text-center">
                    目标: Delta Neutral (0)
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-hl-card p-3 rounded border border-hl-border">
                        <div className="text-gray-500 text-xs">交易次数</div>
                        <div className="text-white font-mono">{stats.trades}</div>
                    </div>
                     <div className="bg-hl-card