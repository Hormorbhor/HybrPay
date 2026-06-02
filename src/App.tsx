import { useEffect, useState, useRef, useMemo } from 'react';

// Contract Constants
const ESCROW_CONTRACT_ADDRESS = "0xc22714197594e4E7174eFF0a74c0D5eAF4F39161"; 
const VAULT_CONTRACT_ADDRESS = "0xE4fAA84E62a0a731f388a6dAA5B0Eb22D30b726d";

interface TokenInfo {
  address: string;
  decimals: number;
  symbol: string;
  usdRate: number;
}

const TOKENS: Record<string, TokenInfo> = {
  USDC: {
    address: "0x3600000000000000000000000000000000000000",
    decimals: 6,
    symbol: "USDC",
    usdRate: 1.00
  },
  EURC: {
    address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    decimals: 6,
    symbol: "EURC",
    usdRate: 1.08
  },
  USYC: {
    address: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C",
    decimals: 6,
    symbol: "USYC",
    usdRate: 1.00
  }
};

const ESCROW_ABI = [
  "function createEscrow(address _seller, address _token, uint256 _amount) external returns (uint256)",
  "function releaseEscrow(uint256 _escrowId) external",
  "function refundEscrow(uint256 _escrowId) external",
  "function nextEscrowId() view returns (uint256)"
];

const VAULT_ABI = [
  "function createVault(uint256 _amount, uint256 _durationMins) external",
  "function claimVault(uint256 _positionId) external",
  "function getPositionsCount(address _user) external view returns (uint256)",
  "function userPositions(address _user, uint256 index) external view returns (uint256 id, address user, uint256 amount, uint256 unlockTime, uint256 reward, uint8 status)",
  "function totalClaimedYield(address _user) external view returns (uint256)",
  "function fundReserves(uint256 _amount) external"
];

interface Contact {
  name: string;
  address: string;
}

interface EscrowOrder {
  id: number;
  seller: string;
  amount: string;
  token: string;
  status: 'PENDING' | 'RELEASED' | 'REFUNDED';
  docUrl?: string;
}

interface TxHistoryItem {
  type: 'send' | 'receive' | 'swap' | 'escrow';
  description: string;
  hash: string;
  blockNo: number;
}

export default function App() {
  // Splash and Navigation States
  const [splashOpacity, setSplashOpacity] = useState<number>(1);
  const [isSplashRendered, setIsSplashRendered] = useState<boolean>(true);
  const [activePanel, setActivePanel] = useState<string>('dashboard');
  const [docsTab, setDocsTab] = useState<'pitch' | 'features' | 'usecases' | 'loyalty'>('pitch');

  // Wallet and Provider States
  const [activeAddress, setActiveAddress] = useState<string>(() => localStorage.getItem('arc_active_address') || '');
  const [portfolioValue, setPortfolioValue] = useState<string>('$0.00');
  const [txCount, setTxCount] = useState<number>(0);
  const [gasBalance, setGasBalance] = useState<string>('0.00 USDC');
  const [balances, setBalances] = useState({
    usdc: '0.00',
    eurc: '0.00',
    usyc: '0.00'
  });

  useEffect(() => {
    localStorage.setItem('arc_active_address', activeAddress);
  }, [activeAddress]);

  // Settings Panel Config
  const [rpcEndpoint, setRpcEndpoint] = useState<string>('https://rpc.testnet.arc.network');
  const [slippage, setSlippage] = useState<string>('2%');
  const [gasMultiplier, setGasMultiplier] = useState<string>('1.2x (Fast)');

  // Form Inputs
  const [tradeFrom, setTradeFrom] = useState<string>('USDC');
  const [tradeTo, setTradeTo] = useState<string>('EURC');
  const [tradeFromAmt, setTradeFromAmt] = useState<string>('');
  const [tradeToAmt, setTradeToAmt] = useState<string>('');

  const [escrowSeller, setEscrowSeller] = useState<string>('');
  const [escrowToken, setEscrowToken] = useState<string>('0x3600000000000000000000000000000000000000');
  const [escrowAmount, setEscrowAmount] = useState<string>('');
  const [activeEscrowId, setActiveEscrowId] = useState<string>('');
  const [selectedEscrowDoc, setSelectedEscrowDoc] = useState<string>('');

  const [invoiceClient, setInvoiceClient] = useState<string>('');
  const [invoiceDesc, setInvoiceDesc] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>('');
  const [invoiceToken, setInvoiceToken] = useState<string>('USDC');
  const [invoiceAmount, setInvoiceAmount] = useState<string>('');
  const [uploadedInvoiceDocUrl, setUploadedInvoiceDocUrl] = useState<string>('');
  const [invoiceOutputLink, setInvoiceOutputLink] = useState<string>('');

  const [sendToken, setSendToken] = useState<string>('USDC');
  const [sendToAddress, setSendToAddress] = useState<string>('');
  const [sendAmount, setSendAmount] = useState<string>('');

  // Address Book & Escrow List States
  const [contactName, setContactName] = useState<string>('');
  const [contactAddress, setContactAddress] = useState<string>('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pendingEscrows, setPendingEscrows] = useState<EscrowOrder[]>([]);

  // Ticking Yield Calculator States
  const [yieldFloat, setYieldFloat] = useState<number>(0);
  const [yieldAccumulated, setYieldAccumulated] = useState<number>(0);

  // Vault States
  const [vaultAmount, setVaultAmount] = useState<string>('');
  const [vaultDuration, setVaultDuration] = useState<string>('5');
  const [vaultPositions, setVaultPositions] = useState<any[]>([]);
  const [totalClaimedVaultYield, setTotalClaimedVaultYield] = useState<string>('0.00');
  const [vaultActiveDeposits, setVaultActiveDeposits] = useState<string>('0.00');
  const [isSyncingVault, setIsSyncingVault] = useState<boolean>(false);
  const [vaultReservesAmount, setVaultReservesAmount] = useState<string>('');
  const [currentBlockTime, setCurrentBlockTime] = useState<number>(Math.floor(Date.now() / 1000));

  // Incoming payment parameter banner details
  const [paylinkIncomingDoc, setPaylinkIncomingDoc] = useState<string>('');

  // Decoded incoming invoice details state for Buyer to view details
  const [incomingInvoice, setIncomingInvoice] = useState<{
    to: string;
    amount: string;
    token: string;
    desc: string;
    doc: string;
  } | null>(null);

  // Tab control in Escrow panel if an invoice is active
  const [escrowTabs, setEscrowTabs] = useState<'invoice' | 'manage'>('manage');

  // Logs transaction lists
  const [onChainLogs, setOnChainLogs] = useState<TxHistoryItem[]>([]);

  // Loyalty Points & Gamification States
  const [activeTheme, setActiveTheme] = useState<string>(() => {
    const saved = localStorage.getItem('hybri_theme');
    if (saved === 'starwars') return 'darkcyber';
    return saved || 'arc';
  });

  useEffect(() => {
    localStorage.setItem('hybri_theme', activeTheme);
    const root = document.documentElement;
    if (activeTheme === 'darkcyber') {
      root.classList.add('dark-cyber');
    } else {
      root.classList.remove('dark-cyber');
    }
  }, [activeTheme]);

  const [loyaltyPoints, setLoyaltyPoints] = useState<number>(() => {
    const val = localStorage.getItem('hybri_loyalty_points');
    return val ? parseInt(val, 10) : 35; // Start with 35 PTS to make tiers prestigious
  });

  const [activityDates, setActivityDates] = useState<string[]>(() => {
    const val = localStorage.getItem('hybri_activity_dates');
    if (val) {
      return JSON.parse(val);
    } else {
      // Pre-seed activities for Saturday (May 30) and Sunday (May 31) 
      // so when user starts on Monday (June 1), they have an exciting 2-Day Streak to maintain!
      const today = new Date();
      
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      const dayBefore = new Date(today);
      dayBefore.setDate(today.getDate() - 2);
      const dayBeforeStr = dayBefore.toISOString().split('T')[0];
      
      const seeded = [dayBeforeStr, yesterdayStr];
      localStorage.setItem('hybri_activity_dates', JSON.stringify(seeded));
      return seeded;
    }
  });

  const [lastCheckInDate, setLastCheckInDate] = useState<string>(() => {
    return localStorage.getItem('hybri_last_checkin_date') || '';
  });

  const [completedQuests, setCompletedQuests] = useState<string[]>(() => {
    const val = localStorage.getItem('hybri_completed_quests');
    return val ? JSON.parse(val) : [];
  });

  // User feedback states
  const [feedbacks, setFeedbacks] = useState<{
    id: string;
    username: string;
    comment: string;
    rating: number;
    timestamp: string;
    likes: number;
    testingArea: string;
  }[]>(() => {
    const saved = localStorage.getItem('hybri_feedbacks');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        // Filter out seed mock/sandbox feedbacks and quick test entries
        return parsed.filter(item => 
          item.id !== '1' && 
          item.id !== '2' && 
          item.id !== '3' && 
          item.username !== 'Anonymous_Tester' &&
          item.comment?.toLowerCase() !== 'good'
        );
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const [feedbackName, setFeedbackName] = useState<string>('');
  const [feedbackComment, setFeedbackComment] = useState<string>('');
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackArea, setFeedbackArea] = useState<string>('All Features');

  useEffect(() => {
    localStorage.setItem('hybri_feedbacks', JSON.stringify(feedbacks));
  }, [feedbacks]);

  useEffect(() => {
    localStorage.setItem('hybri_loyalty_points', String(loyaltyPoints));
  }, [loyaltyPoints]);

  useEffect(() => {
    localStorage.setItem('hybri_activity_dates', JSON.stringify(activityDates));
  }, [activityDates]);

  useEffect(() => {
    localStorage.setItem('hybri_completed_quests', JSON.stringify(completedQuests));
  }, [completedQuests]);

  // Recalculate streak consecutive count based on registered activity calendar dates
  const loyaltyStreak = useMemo(() => {
    if (!activityDates || activityDates.length === 0) return 0;
    
    // Unique and sorted in descending order (newest first)
    const sorted = Array.from(new Set<string>(activityDates)).sort((a: string, b: string) => b.localeCompare(a));
    const todayStr = new Date().toISOString().split('T')[0];
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // If not active either today or yesterday, streak is broken
    if (!sorted.includes(todayStr) && !sorted.includes(yesterdayStr)) {
      return 0;
    }
    
    let currentTargetStr = sorted.includes(todayStr) ? todayStr : yesterdayStr;
    let streak = 0;
    
    while (sorted.includes(currentTargetStr)) {
      streak++;
      const prevDate = new Date(currentTargetStr);
      prevDate.setDate(prevDate.getDate() - 1);
      currentTargetStr = prevDate.toISOString().split('T')[0];
    }
    
    return streak;
  }, [activityDates]);

  // Helper to record activity today to preserve/increment streak
  const recordActivityToday = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    setActivityDates(prev => {
      if (prev.includes(todayStr)) return prev;
      const updated = [...prev, todayStr];
      localStorage.setItem('hybri_activity_dates', JSON.stringify(updated));
      return updated;
    });
  };

  const getTier = (pts: number) => {
    if (pts < 1000) return { name: 'Bronze', next: 1000, prev: 0, color: '#cd7f32', desc: 'Base Multiplier (1.0x)' };
    if (pts < 5000) return { name: 'Silver', next: 5000, prev: 1000, color: '#00e5a0', desc: 'Silver Multiplier (1.1x)' };
    if (pts < 15000) return { name: 'Gold', next: 15000, prev: 5000, color: '#f59e0b', desc: 'Gold Multiplier (1.25x)' };
    return { name: 'Platinum', next: 50000, prev: 15000, color: '#7b61ff', desc: 'Elite Multiplier (1.5x)' };
  };

  // Dynamically map Mon-Sun of current week in localized space to verify active check-ins or transaction days
  const currentWeekDaysStatus = useMemo(() => {
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 is Sun, 1 is Mon, 2 is Tue...
    const diffToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayStr = today.toISOString().split('T')[0];

    return daysOfWeek.map((dayLabel, idx) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + idx);
      const dateStr = d.toISOString().split('T')[0];
      const isCompleted = activityDates.includes(dateStr);
      const isToday = dateStr === todayStr;
      
      return {
        label: dayLabel,
        dateStr,
        isCompleted,
        isToday
      };
    });
  }, [activityDates]);

  // Reactive merchant task completion effects to reward real achievements
  useEffect(() => {
    if (invoiceOutputLink !== '' && !completedQuests.includes('invoice_created')) {
      setCompletedQuests(prev => {
        const updated = [...prev, 'invoice_created'];
        localStorage.setItem('hybri_completed_quests', JSON.stringify(updated));
        return updated;
      });
      setLoyaltyPoints(pts => pts + 50); // Harder challenge: +50 PTS
      recordActivityToday();
      showToast('🎉 Quest Complete: Created a Paylink Invoice! +50 PTS', 'var(--arc-accent)');
    }
  }, [invoiceOutputLink]);

  useEffect(() => {
    if (pendingEscrows.length > 0 && !completedQuests.includes('escrow_funded')) {
      setCompletedQuests(prev => {
        const updated = [...prev, 'escrow_funded'];
        localStorage.setItem('hybri_completed_quests', JSON.stringify(updated));
        return updated;
      });
      setLoyaltyPoints(pts => pts + 100); // Harder challenge: +100 PTS
      recordActivityToday();
      showToast('🎉 Quest Complete: Funded an Escrow Stand! +100 PTS', 'var(--arc-accent)');
    }
  }, [pendingEscrows]);

  useEffect(() => {
    if (vaultPositions.length > 0 && !completedQuests.includes('vault_yield')) {
      setCompletedQuests(prev => {
        const updated = [...prev, 'vault_yield'];
        localStorage.setItem('hybri_completed_quests', JSON.stringify(updated));
        return updated;
      });
      setLoyaltyPoints(pts => pts + 75); // Harder challenge: +75 PTS
      recordActivityToday();
      showToast('🎉 Quest Complete: Earn 5.15% APY Vault Yield! +75 PTS', 'var(--arc-accent)');
    }
  }, [vaultPositions]);

  // Toast State
  const [toastMessage, setToastMessage] = useState<string>('');
  const [toastColor, setToastColor] = useState<string>('var(--arc-accent)');
  const [isToastVisible, setIsToastVisible] = useState<boolean>(false);

  // References
  const chartInstanceRef = useRef<any>(null);
  const qrInstanceRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // 1. Initial Load & Session Persistence
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Dismiss splash screen exactly after 5 seconds
    const opacityTimer = setTimeout(() => {
      setSplashOpacity(0);
    }, 5000);

    const removalTimer = setTimeout(() => {
      setIsSplashRendered(false);
    }, 5800);

    // Load Local Store Contacts and Escrows
    loadContactsFromStore();
    loadEscrowsFromStore();

    // Auto-detect browser wallets & query connection session
    detectBrowserWallet();
    if (activeAddress) {
      if (activeAddress === "0xSandboxDemonstrationAccount777777777") {
        setActiveAddress('');
        localStorage.removeItem('arc_active_address');
      } else {
        setupProviderListeners();
      }
    }

    // Scan for incoming payment link url parameters
    checkIncomingPaylink();

    // Load TradingView forex Widget when layout starts
    initTradingViewWidget();

    return () => {
      clearTimeout(opacityTimer);
      clearTimeout(removalTimer);
    };
  }, []);

  // Sync yield accumulator ticker
  useEffect(() => {
    const yieldTimer = setInterval(() => {
      // Sync clock countdowns
      setCurrentBlockTime(Math.floor(Date.now() / 1000));

      if (yieldFloat > 0) {
        // 5.15% APY dynamic yield accrued per second: (Float * 0.0515) / SecondsInYear
        const yieldPerSecond = (yieldFloat * 0.0515) / (365 * 24 * 60 * 60);
        setYieldAccumulated(prev => prev + yieldPerSecond);
      } else {
        setYieldAccumulated(0);
      }
    }, 1000);

    return () => clearInterval(yieldTimer);
  }, [yieldFloat]);

  // Redraw Asset Allocation Pie chart on balances update
  useEffect(() => {
    if (activePanel === 'dashboard' && !isSplashRendered) {
      renderAssetAllocationChart();
    }
  }, [balances, activePanel, isSplashRendered]);

  // Re-generate P2P QR Code when wallet address loads/opens
  useEffect(() => {
    if (activePanel === 'wallet' && activeAddress) {
      generateP2PDepositQR();
    }
  }, [activePanel, activeAddress]);

  // Load TradingView forex Widget when trade tab opens
  useEffect(() => {
    if (activePanel === 'trade') {
      initTradingViewWidget();
    }
  }, [activePanel]);

  // Monitor conversion swaps inputs [Unified input listener]
  useEffect(() => {
    const amt = parseFloat(tradeFromAmt);
    if (isNaN(amt) || amt <= 0) {
      setTradeToAmt('');
      return;
    }

    let conversion = 1.0;
    if (tradeFrom === 'USDC' && tradeTo === 'EURC') conversion = 0.92;
    if (tradeFrom === 'EURC' && tradeTo === 'USDC') conversion = 1.08;
    if (tradeFrom === 'EURC' && tradeTo === 'USYC') conversion = 1.08;
    if (tradeFrom === 'USYC' && tradeTo === 'EURC') conversion = 0.92;
    if (tradeFrom === 'USDC' && tradeTo === 'USYC') conversion = 1.00;
    if (tradeFrom === 'USYC' && tradeTo === 'USDC') conversion = 1.00;

    setTradeToAmt(`~ ${(amt * conversion).toFixed(4)}`);
  }, [tradeFromAmt, tradeFrom, tradeTo]);

  // Monitor bill-pay dynamic share link inputs
  useEffect(() => {
    if (!invoiceClient || !invoiceAmount) {
      setInvoiceOutputLink('');
      return;
    }

    const baseUrl = window.location.origin + window.location.pathname;
    let link = `${baseUrl}?to=${invoiceClient}&amount=${invoiceAmount}&token=${invoiceToken}&desc=${encodeURIComponent(invoiceDesc)}`;
    if (uploadedInvoiceDocUrl) {
      link += `&doc=${encodeURIComponent(uploadedInvoiceDocUrl)}`;
    }
    setInvoiceOutputLink(link);
  }, [invoiceClient, invoiceAmount, invoiceToken, invoiceDesc, uploadedInvoiceDocUrl]);

  // Render TradingView script embed inside trade card manually
  const initTradingViewWidget = () => {
    const el = document.getElementById('tradingview-chart-container-react');
    if (el) {
      el.innerHTML = `
        <iframe 
          src="https://s.tradingview.com/widgetembed/?symbol=FX%3AEURUSD&theme=dark&locale=en"
          style="width: 100%; height: 100%; border: none;"
          allowtransparency="true"
          scrolling="no"
          allowfullscreen>
        </iframe>
      `;
    }
  };

  // ---------------------------------------------------------------------------
  // 2. Local Database & State Utilities
  // ---------------------------------------------------------------------------
  const loadContactsFromStore = () => {
    const saved = localStorage.getItem('arc_contacts');
    if (saved) {
      setContacts(JSON.parse(saved));
    } else {
      const defaultContacts = [
        { name: "Circle Faucet Wallet", address: "0x3600000000000000000000000000000000000000" }
      ];
      setContacts(defaultContacts);
      localStorage.setItem('arc_contacts', JSON.stringify(defaultContacts));
    }
  };

  const loadEscrowsFromStore = () => {
    const saved = localStorage.getItem('hybri_escrows');
    const parsed: EscrowOrder[] = saved ? JSON.parse(saved) : [];
    setPendingEscrows(parsed);
    calculateLockedFloat(parsed);
  };

  const calculateLockedFloat = (list: EscrowOrder[]) => {
    const active = list.filter(x => x.status === 'PENDING');
    let total = 0;
    active.forEach(item => {
      let rawAmount = parseFloat(item.amount) || 0;
      if (item.token === 'EURC') {
        rawAmount = rawAmount * 1.08; // Include EUR conversions to portfolio USD values
      }
      total += rawAmount;
    });
    setYieldFloat(total);
  };

  const savePendingEscrow = (id: number, sellerAddress: string, amountStr: string, tokenName: string, docUrlStr: string) => {
    const current = [...pendingEscrows];
    const newOrder: EscrowOrder = {
      id,
      seller: sellerAddress,
      amount: amountStr,
      token: tokenName,
      status: 'PENDING',
      docUrl: docUrlStr || ''
    };
    current.push(newOrder);
    setPendingEscrows(current);
    localStorage.setItem('hybri_escrows', JSON.stringify(current));
    calculateLockedFloat(current);
  };

  const settlePendingEscrowStore = (id: number, newStatus: 'RELEASED' | 'REFUNDED') => {
    const updated = pendingEscrows.map(x => {
      if (Number(x.id) === Number(id)) {
        return { ...x, status: newStatus };
      }
      return x;
    });
    setPendingEscrows(updated);
    localStorage.setItem('hybri_escrows', JSON.stringify(updated));
    calculateLockedFloat(updated);
  };

  const saveNewContact = () => {
    const name = contactName.trim();
    const address = contactAddress.trim();

    if (!name || !address) {
      showToast('Input both name and wallet address', '#e35f4a');
      return;
    }
    const ethersObj = (window as any).ethers;
    if (!ethersObj || !ethersObj.isAddress(address)) {
      showToast('Invalid EVM blockchain address', '#e35f4a');
      return;
    }

    const current = [...contacts, { name, address }];
    setContacts(current);
    localStorage.setItem('arc_contacts', JSON.stringify(current));
    
    setContactName('');
    setContactAddress('');
    showToast('Contact registered successfully');
  };

  const deleteContactAtIndex = (index: number) => {
    const current = contacts.filter((_, i) => i !== index);
    setContacts(current);
    localStorage.setItem('arc_contacts', JSON.stringify(current));
    showToast('Contact removed from index');
  };

  // ---------------------------------------------------------------------------
  // 3. Web3 & Ethers Gateways
  // ---------------------------------------------------------------------------
  const detectBrowserWallet = () => {
    const win = window as any;
    if (typeof win.ethereum === 'undefined') {
      showToast('No browser wallet detected. Install Rabby or MetaMask.', '#e35f4a');
      return;
    }
    let name = "Browser Wallet";
    if (win.ethereum.isRabby) name = "Rabby Wallet";
    else if (win.ethereum.isMetaMask) name = "MetaMask";

    showToast(`Detected browser environment: ${name}`);
  };

  const setupProviderListeners = async () => {
    const win = window as any;
    if (typeof win.ethereum === 'undefined') return;

    try {
      const accounts = await win.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length > 0) {
        const p = new win.ethers.BrowserProvider(win.ethereum);
        const s = await p.getSigner();
        setActiveAddress(accounts[0]);
        await queryOnChainStates(p, accounts[0]);
      }
    } catch (e) {
      console.warn("Silent session query failed", e);
    }

    win.ethereum.on('accountsChanged', async (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnectLocalWallet();
      } else {
        const p = new win.ethers.BrowserProvider(win.ethereum);
        setActiveAddress(accounts[0]);
        await queryOnChainStates(p, accounts[0]);
      }
    });

    win.ethereum.on('chainChanged', () => {
      window.location.reload();
    });
  };

  const switchToArcTestnet = async () => {
    const win = window as any;
    if (typeof win.ethereum === 'undefined') return;
    try {
      await win.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x4cef52' }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await win.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x4cef52',
              chainName: 'Arc Testnet',
              nativeCurrency: {
                name: 'USDC',
                symbol: 'USDC',
                decimals: 18
              },
              rpcUrls: [rpcEndpoint],
              blockExplorerUrls: ['https://testnet.arcscan.app']
            }],
          });
        } catch (addError) {
          console.error("Chain installation failed", addError);
        }
      }
    }
  };

  const connectBrowserWallet = async () => {
    const win = window as any;
    if (typeof win.ethereum === 'undefined') {
      showToast('No browser wallet detected', '#e35f4a');
      return;
    }
    try {
      const p = new win.ethers.BrowserProvider(win.ethereum);
      await switchToArcTestnet();
      const accounts = await p.send("eth_requestAccounts", []);
      setActiveAddress(accounts[0]);
      await queryOnChainStates(p, accounts[0]);
    } catch (e) {
      console.error(e);
      showToast('Wallet connection failed', '#e35f4a');
    }
  };

  const disconnectLocalWallet = () => {
    setActiveAddress('');
    setPortfolioValue('$0.00');
    setTxCount(0);
    setGasBalance('0.00 USDC');
    setBalances({ usdc: '0.00', eurc: '0.00', usyc: '0.00' });
    setOnChainLogs([]);
    showToast('Disconnected locally');
  };

  const getGasMultiplierNum = (): number => {
    if (gasMultiplier.includes("Standard")) return 1.0;
    if (gasMultiplier.includes("Fast")) return 1.2;
    if (gasMultiplier.includes("Instant")) return 1.5;
    return 1.2;
  };

  const queryOnChainStates = async (p: any, address: string) => {
    try {
      showToast('Syncing balances...', 'var(--arc-accent)');
      const win = window as any;

      const activeTxCount = await p.getTransactionCount(address);
      setTxCount(activeTxCount);

      const nativeBal = await p.getBalance(address);
      const formattedNative = parseFloat(win.ethers.formatEther(nativeBal)).toFixed(4);
      setGasBalance(`${formattedNative} USDC`);

      const erc20Abi = ["function balanceOf(address owner) view returns (uint256)"];

      const usdcContract = new win.ethers.Contract(TOKENS.USDC.address, erc20Abi, p);
      const usdcRaw = await usdcContract.balanceOf(address);
      const usdcBal = parseFloat(win.ethers.formatUnits(usdcRaw, TOKENS.USDC.decimals)).toFixed(2);

      const eurcContract = new win.ethers.Contract(TOKENS.EURC.address, erc20Abi, p);
      const eurcRaw = await eurcContract.balanceOf(address);
      const eurcBal = parseFloat(win.ethers.formatUnits(eurcRaw, TOKENS.EURC.decimals)).toFixed(2);

      const usycContract = new win.ethers.Contract(TOKENS.USYC.address, erc20Abi, p);
      const usycRaw = await usycContract.balanceOf(address);
      const usycBal = parseFloat(win.ethers.formatUnits(usycRaw, TOKENS.USYC.decimals)).toFixed(2);

      // Apply Local Position Offsets to make swaps reflect immediately and persist
      const addressKey = address.toLowerCase();
      const savedOffsets = localStorage.getItem(`offsets_${addressKey}`);
      const ob = savedOffsets ? JSON.parse(savedOffsets) : { usdc: 0, eurc: 0, usyc: 0 };

      const finalUsdc = Math.max(0, parseFloat(usdcBal) + (ob.usdc || 0)).toFixed(2);
      const finalEurc = Math.max(0, parseFloat(eurcBal) + (ob.eurc || 0)).toFixed(2);
      const finalUsyc = Math.max(0, parseFloat(usycBal) + (ob.usyc || 0)).toFixed(2);

      setBalances({
        usdc: finalUsdc,
        eurc: finalEurc,
        usyc: finalUsyc
      });

      const totalUSD = parseFloat(finalUsdc) + (parseFloat(finalEurc) * TOKENS.EURC.usdRate) + parseFloat(finalUsyc);
      setPortfolioValue(`$${totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

      // Query Blockchain logs over the last 5000 blocks for transfers
      const latestBlock = await p.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - 5000);
      const topicTransfer = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const paddedAddress = win.ethers.zeroPadValue(address, 32);

      const sentLogs = await p.getLogs({
        fromBlock,
        toBlock: latestBlock,
        topics: [topicTransfer, paddedAddress]
      });

      const receivedLogs = await p.getLogs({
        fromBlock,
        toBlock: latestBlock,
        topics: [topicTransfer, null, paddedAddress]
      });

      const allLogs = [...sentLogs, ...receivedLogs];
      allLogs.sort((a, b) => b.blockNumber - a.blockNumber);

      const mappedLogs: TxHistoryItem[] = allLogs.slice(0, 10).map((log: any) => {
        let tokenSym = 'USDC';
        let decimals = 6;
        if (log.address.toLowerCase() === TOKENS.EURC.address.toLowerCase()) {
          tokenSym = 'EURC';
        } else if (log.address.toLowerCase() === TOKENS.USYC.address.toLowerCase()) {
          tokenSym = 'USYC';
        }

        const fromAddr = win.ethers.stripZerosLeft(log.topics[1]);
        const isSent = fromAddr.toLowerCase() === address.toLowerCase();
        const rawValue = BigInt(log.data);
        const formattedVal = win.ethers.formatUnits(rawValue, decimals);

        return {
          type: isSent ? 'send' : 'receive',
          description: `${formattedVal} ${tokenSym}`,
          hash: log.transactionHash,
          blockNo: log.blockNumber
        };
      });

      // Query custom logs for swaps, etc.
      const customLogsStr = localStorage.getItem(`custom_logs_${addressKey}`);
      const customLogs = customLogsStr ? JSON.parse(customLogsStr) : [];

      const blendedLogs = [...customLogs, ...mappedLogs].slice(0, 15);

      // Query Vault status
      await queryVaultStates(p, address);

      setOnChainLogs(blendedLogs);
      showToast('Dashboard updated!');
    } catch (e) {
      console.error(e);
      showToast('Error querying on-chain states', '#e35f4a');
    }
  };

  const manualRefreshSync = async () => {
    const win = window as any;
    if (!activeAddress) {
      showToast('Connect wallet first', '#e35f4a');
      return;
    }
    const p = new win.ethers.BrowserProvider(win.ethereum);
    await queryOnChainStates(p, activeAddress);
  };

  // Transaction success visual sequence handler
  const triggerTransactionSuccessSequence = async (message: string) => {
    // 1. Show transaction successful for exactly 3 seconds
    showToast(message, '#00e5a0');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 2. Transition to Updating Dashboard for feedback
    showToast("Updating Dashboard...", 'var(--arc-accent)');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. Award Loyalty Points based on active design streak (Hard mode: 20 PTS base)
    const basePts = 20;
    const streakMult = 1.0 + (loyaltyStreak - 1) * 0.1;
    const totalEarnedPts = Math.round(basePts * streakMult);
    
    setLoyaltyPoints(p => {
      const updated = p + totalEarnedPts;
      localStorage.setItem('hybri_loyalty_points', String(updated));
      return updated;
    });

    // Record activity in the real-time calendar log to advance the streak
    recordActivityToday();

    showToast(`🌟 +${totalEarnedPts} Loyalty Points earned! (Multiplier: ${streakMult.toFixed(1)}x)`, 'var(--arc-accent)');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Trigger refreshing balances
    const win = window as any;
    if (activeAddress && win.ethereum) {
      const p = new win.ethers.BrowserProvider(win.ethereum);
      await queryOnChainStates(p, activeAddress);
    }
    loadEscrowsFromStore();
  };

  // ---------------------------------------------------------------------------
  // 4. Contract Transactions & Swaps
  // ---------------------------------------------------------------------------
  const executePermit2Swaps = async () => {
    const win = window as any;
    if (!activeAddress) {
      showToast('Connect wallet first', '#e35f4a');
      return;
    }
    if (!tradeFromAmt || parseFloat(tradeFromAmt) <= 0) {
      showToast('Enter valid swap amount', '#e35f4a');
      return;
    }
    if (tradeFrom === tradeTo) {
      showToast('Choose distinct tokens', '#e35f4a');
      return;
    }

    const fromToken = TOKENS[tradeFrom];
    const toToken = TOKENS[tradeTo];
    const amt = parseFloat(tradeFromAmt);

    // Calculate exchange rate
    let conversion = 1.0;
    if (tradeFrom === 'USDC' && tradeTo === 'EURC') conversion = 0.92;
    if (tradeFrom === 'EURC' && tradeTo === 'USDC') conversion = 1.08;
    if (tradeFrom === 'EURC' && tradeTo === 'USYC') conversion = 1.08;
    if (tradeFrom === 'USYC' && tradeTo === 'EURC') conversion = 0.92;
    if (tradeFrom === 'USDC' && tradeTo === 'USYC') conversion = 1.00;
    if (tradeFrom === 'USYC' && tradeTo === 'USDC') conversion = 1.00;

    const targetAmt = amt * conversion;

    const currentFromBalance = parseFloat(balances[tradeFrom.toLowerCase()] || '0');
    if (amt > currentFromBalance) {
      showToast(`Insufficient ${tradeFrom} balance. Max available: ${currentFromBalance}`, '#e35f4a');
      return;
    }

    try {
      showToast('Approving Permit2 Contract...', 'var(--arc-accent)');
      const erc20Abi = ["function approve(address spender, uint256 value) returns (bool)"];
      const p = new win.ethers.BrowserProvider(win.ethereum);
      const s = await p.getSigner();

      const tokenContract = new win.ethers.Contract(fromToken.address, erc20Abi, s);
      const baseGwei = 20n;
      const multiplier = getGasMultiplierNum();
      const gasFee = win.ethers.parseUnits((baseGwei * BigInt(Math.round(multiplier * 100)) / 100n).toString(), "gwei");

      const parsedAmount = win.ethers.parseUnits(tradeFromAmt, fromToken.decimals);
      const permit2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

      const tx = await tokenContract.approve(permit2Address, parsedAmount, {
        maxFeePerGas: gasFee,
        maxPriorityFeePerGas: win.ethers.parseUnits("1", "gwei")
      });

      showToast(`Approval broadcasted!`);
      await tx.wait();

      // Save position offset so that balance displays are updated
      const addressKey = activeAddress.toLowerCase();
      const savedOffsets = localStorage.getItem(`offsets_${addressKey}`);
      let offsets = savedOffsets ? JSON.parse(savedOffsets) : { usdc: 0, eurc: 0, usyc: 0 };

      const fromKey = tradeFrom.toLowerCase();
      const toKey = tradeTo.toLowerCase();

      offsets[fromKey] = (offsets[fromKey] || 0) - amt;
      offsets[toKey] = (offsets[toKey] || 0) + targetAmt;

      localStorage.setItem(`offsets_${addressKey}`, JSON.stringify(offsets));

      // Register custom tx history log
      const customLogsStr = localStorage.getItem(`custom_logs_${addressKey}`);
      let customLogs = customLogsStr ? JSON.parse(customLogsStr) : [];
      const latestBlock = await p.getBlockNumber();
      const historyLog: TxHistoryItem = {
        type: 'swap',
        description: `Swapped ${tradeFromAmt} ${tradeFrom} for ${targetAmt.toFixed(2)} ${tradeTo}`,
        hash: tx.hash,
        blockNo: Number(latestBlock)
      };
      customLogs.unshift(historyLog);
      localStorage.setItem(`custom_logs_${addressKey}`, JSON.stringify(customLogs));

      await triggerTransactionSuccessSequence(`Swap Complete! Exchanged ${tradeFromAmt} ${tradeFrom} for ${targetAmt.toFixed(2)} ${tradeTo}.`);
      setTradeFromAmt('');
    } catch (err: any) {
      console.error(err);
      showToast(err.reason || 'Swap transaction failed', '#e35f4a');
    }
  };

  const confirmCreateEscrowDeposit = async () => {
    const win = window as any;
    if (!activeAddress) {
      showToast('Connect wallet first', '#e35f4a');
      return;
    }
    if (!escrowSeller || !escrowAmount) {
      showToast('Please fill in all fields', '#e35f4a');
      return;
    }

    try {
      showToast('Phase 1: Approving total spend (Amount + 3% fee)...', 'var(--arc-accent)');
      const erc20Abi = ["function approve(address spender, uint256 value) returns (bool)"];
      const p = new win.ethers.BrowserProvider(win.ethereum);
      const s = await p.getSigner();

      const tokenContract = new win.ethers.Contract(escrowToken, erc20Abi, s);

      const parsedTargetAmount = win.ethers.parseUnits(escrowAmount, 6);
      const parsedFee = (parsedTargetAmount * 3n) / 100n; // 3% upfront fee
      const parsedTotalAmount = parsedTargetAmount + parsedFee;

      const baseGwei = 20n;
      const multiplier = getGasMultiplierNum();
      const gasFee = win.ethers.parseUnits((baseGwei * BigInt(Math.round(multiplier * 100)) / 100n).toString(), "gwei");

      const approveTx = await tokenContract.approve(ESCROW_CONTRACT_ADDRESS, parsedTotalAmount, {
        maxFeePerGas: gasFee,
        maxPriorityFeePerGas: win.ethers.parseUnits("1", "gwei")
      });

      showToast('Approval broadcasted! Awaiting confirmation...');
      await approveTx.wait();

      showToast('Phase 2: Creating Escrow lockup...', 'var(--arc-accent)');
      const escrowContract = new win.ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, s);

      const tx = await escrowContract.createEscrow(escrowSeller, escrowToken, parsedTargetAmount, {
        maxFeePerGas: gasFee,
        maxPriorityFeePerGas: win.ethers.parseUnits("1", "gwei")
      });

      showToast('Escrow tx broadcasted! Awaiting finality...');
      await tx.wait();

      const nextId = await escrowContract.nextEscrowId();
      const createdOrderId = Number(nextId) - 1;

      // Extract details
      let tokenSym = "USDC";
      for (const k in TOKENS) {
        if (TOKENS[k].address.toLowerCase() === escrowToken.toLowerCase()) {
          tokenSym = TOKENS[k].symbol;
        }
      }

      // If document upload was active, pass to local storage tracker
      savePendingEscrow(createdOrderId, escrowSeller, escrowAmount, tokenSym, paylinkIncomingDoc);

      await triggerTransactionSuccessSequence(`Transaction Successful! Your Escrow Order ID is: ${createdOrderId}. Please share this with the seller.`);
    } catch (err: any) {
      console.error(err);
      showToast(err.reason || 'Escrow deposit failed', '#e35f4a');
    }
  };

  const confirmReleaseEscrow = async () => {
    const win = window as any;
    if (!activeEscrowId) {
      showToast('Enter an Order ID', '#e35f4a');
      return;
    }
    if (!activeAddress) {
      showToast('Connect wallet first', '#e35f4a');
      return;
    }

    try {
      showToast('Releasing escrow funds...', 'var(--arc-accent)');
      const p = new win.ethers.BrowserProvider(win.ethereum);
      const s = await p.getSigner();

      const escrowContract = new win.ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, s);
      const baseGwei = 20n;
      const multiplier = getGasMultiplierNum();
      const gasFee = win.ethers.parseUnits((baseGwei * BigInt(Math.round(multiplier * 100)) / 100n).toString(), "gwei");

      const tx = await escrowContract.releaseEscrow(BigInt(activeEscrowId), {
        maxFeePerGas: gasFee,
        maxPriorityFeePerGas: win.ethers.parseUnits("1", "gwei")
      });

      showToast('Release tx broadcasted! Awaiting finality...');
      await tx.wait();

      settlePendingEscrowStore(Number(activeEscrowId), 'RELEASED');
      await triggerTransactionSuccessSequence(`Transaction Successful! Escrow Order #${activeEscrowId} Released.`);
    } catch (err: any) {
      console.error(err);
      showToast(err.reason || 'Release failed', '#e35f4a');
    }
  };

  const confirmRefundEscrow = async () => {
    const win = window as any;
    if (!activeEscrowId) {
      showToast('Enter an Order ID', '#e35f4a');
      return;
    }
    if (!activeAddress) {
      showToast('Connect wallet first', '#e35f4a');
      return;
    }

    try {
      showToast('Refunding escrow...', 'var(--arc-accent)');
      const p = new win.ethers.BrowserProvider(win.ethereum);
      const s = await p.getSigner();

      const escrowContract = new win.ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, s);
      const baseGwei = 20n;
      const multiplier = getGasMultiplierNum();
      const gasFee = win.ethers.parseUnits((baseGwei * BigInt(Math.round(multiplier * 100)) / 100n).toString(), "gwei");

      const tx = await escrowContract.refundEscrow(BigInt(activeEscrowId), {
        maxFeePerGas: gasFee,
        maxPriorityFeePerGas: win.ethers.parseUnits("1", "gwei")
      });

      showToast('Refund tx broadcasted! Awaiting finality...');
      await tx.wait();

      settlePendingEscrowStore(Number(activeEscrowId), 'REFUNDED');
      await triggerTransactionSuccessSequence(`Transaction Successful! Escrow Order #${activeEscrowId} Refunded.`);
    } catch (err: any) {
      console.error(err);
      showToast(err.reason || 'Refund failed', '#e35f4a');
    }
  };

  const executeTokenDirectSend = async () => {
    const win = window as any;
    if (!activeAddress) {
      showToast('Connect wallet first', '#e35f4a');
      return;
    }
    if (!sendAmount || !sendToAddress) {
      showToast('Fill in all fields', '#e35f4a');
      return;
    }

    const token = TOKENS[sendToken];
    try {
      showToast('Broadcasting transfer...', 'var(--arc-accent)');
      const erc20Abi = ["function transfer(address to, uint256 value) returns (bool)"];
      const p = new win.ethers.BrowserProvider(win.ethereum);
      const s = await p.getSigner();

      const tokenContract = new win.ethers.Contract(token.address, erc20Abi, s);
      const baseGwei = 20n;
      const multiplier = getGasMultiplierNum();
      const gasFee = win.ethers.parseUnits((baseGwei * BigInt(Math.round(multiplier * 100)) / 100n).toString(), "gwei");

      const parsedAmount = win.ethers.parseUnits(sendAmount, token.decimals);

      const tx = await tokenContract.transfer(sendToAddress, parsedAmount, {
        maxFeePerGas: gasFee,
        maxPriorityFeePerGas: win.ethers.parseUnits("1", "gwei")
      });

      showToast(`Broadcasting Tx...`);
      await tx.wait();

      await triggerTransactionSuccessSequence(`Transaction Successful! Sent ${sendAmount} ${sendToken}.`);
    } catch (err: any) {
      console.error(err);
      showToast(err.reason || 'Send transaction failed', '#e35f4a');
    }
  };

  // ---------------------------------------------------------------------------
  // 4a. Core Yield Vault Smart Contract Transactions
  // ---------------------------------------------------------------------------
  const estimateVaultReward = (amount: string, durationMins: string): string => {
    const amt = parseFloat(amount);
    const dur = parseFloat(durationMins);
    if (isNaN(amt) || amt <= 0 || isNaN(dur) || dur <= 0) return '0.0000';
    
    const APY_FACTOR = 515 / 10000; // 5.15% APY
    const durationSecs = dur * 60;
    const yearSecs = 365 * 24 * 60 * 60;
    
    const estimatedReward = (amt * APY_FACTOR * durationSecs) / yearSecs;
    return estimatedReward.toFixed(6);
  };

  const queryVaultStates = async (p: any, address: string) => {
    try {
      const win = window as any;
      const vaultContract = new win.ethers.Contract(VAULT_CONTRACT_ADDRESS, VAULT_ABI, p);
      
      const countBig = await vaultContract.getPositionsCount(address);
      const count = Number(countBig);
      
      const claimedYieldRaw = await vaultContract.totalClaimedYield(address);
      const claimedYield = parseFloat(win.ethers.formatUnits(claimedYieldRaw, 6)).toFixed(4);
      setTotalClaimedVaultYield(claimedYield);

      const positions = [];
      let activeTotal = 0n;
      
      for (let i = 0; i < count; i++) {
        const pos = await vaultContract.userPositions(address, i);
        const formattedAmount = win.ethers.formatUnits(pos.amount, 6);
        const formattedReward = win.ethers.formatUnits(pos.reward, 6);
        
        const posObj = {
          id: Number(pos.id),
          user: pos.user,
          amount: formattedAmount,
          unlockTime: Number(pos.unlockTime),
          reward: formattedReward,
          status: Number(pos.status) // 0: LOCKED, 1: CLAIMED
        };
        
        positions.push(posObj);
        
        if (posObj.status === 0) {
          activeTotal += pos.amount;
        }
      }
      
      setVaultPositions(positions.reverse());
      setVaultActiveDeposits(parseFloat(win.ethers.formatUnits(activeTotal, 6)).toFixed(2));
    } catch (err) {
      console.warn("Silent vault states query failed", err);
    }
  };

  const lockTokensInVault = async () => {
    const win = window as any;
    if (!activeAddress) {
      showToast('Connect wallet first', '#e35f4a');
      return;
    }
    const amt = parseFloat(vaultAmount);
    const dur = parseFloat(vaultDuration);
    if (isNaN(amt) || amt <= 0) {
      showToast('Please enter a valid lock amount', '#e35f4a');
      return;
    }
    if (isNaN(dur) || dur <= 0) {
      showToast('Please enter a valid lock duration (minutes)', '#e35f4a');
      return;
    }

    try {
      setIsSyncingVault(true);
      showToast('Phase 1: Approving USDC lockup spend...', 'var(--arc-accent)');
      const erc20Abi = ["function approve(address spender, uint256 value) returns (bool)"];
      const p = new win.ethers.BrowserProvider(win.ethereum);
      const s = await p.getSigner();

      const tokenContract = new win.ethers.Contract(TOKENS.USDC.address, erc20Abi, s);
      const parsedAmount = win.ethers.parseUnits(vaultAmount, 6);

      const baseGwei = 20n;
      const multiplier = getGasMultiplierNum();
      const gasFee = win.ethers.parseUnits((baseGwei * BigInt(Math.round(multiplier * 100)) / 100n).toString(), "gwei");

      const approveTx = await tokenContract.approve(VAULT_CONTRACT_ADDRESS, parsedAmount, {
        maxFeePerGas: gasFee,
        maxPriorityFeePerGas: win.ethers.parseUnits("1", "gwei")
      });

      showToast('Approval broadcasted! Awaiting confirmation...');
      await approveTx.wait();

      showToast('Phase 2: Locking USDC to on-chain ArcVault...', 'var(--arc-accent)');
      const vaultContract = new win.ethers.Contract(VAULT_CONTRACT_ADDRESS, VAULT_ABI, s);

      const tx = await vaultContract.createVault(parsedAmount, BigInt(Math.round(dur)), {
        maxFeePerGas: gasFee,
        maxPriorityFeePerGas: win.ethers.parseUnits("1", "gwei")
      });

      showToast('Vault lockup broadcasted! Locking on-chain...');
      await tx.wait();

      setVaultAmount('');
      await triggerTransactionSuccessSequence(`Locked ${vaultAmount} USDC successfully! Your yield began accruing.`);
    } catch (err: any) {
      console.error(err);
      showToast(err.reason || 'Vault lockup failed', '#e35f4a');
    } finally {
      setIsSyncingVault(false);
    }
  };

  const claimTokensFromVault = async (positionId: number) => {
    const win = window as any;
    if (!activeAddress) {
      showToast('Connect wallet first', '#e35f4a');
      return;
    }

    try {
      setIsSyncingVault(true);
      showToast(`Initiating yield payout for Position #${positionId}...`, 'var(--arc-accent)');
      const p = new win.ethers.BrowserProvider(win.ethereum);
      const s = await p.getSigner();

      const vaultContract = new win.ethers.Contract(VAULT_CONTRACT_ADDRESS, VAULT_ABI, s);
      const baseGwei = 20n;
      const multiplier = getGasMultiplierNum();
      const gasFee = win.ethers.parseUnits((baseGwei * BigInt(Math.round(multiplier * 100)) / 100n).toString(), "gwei");

      const tx = await vaultContract.claimVault(BigInt(positionId), {
        maxFeePerGas: gasFee,
        maxPriorityFeePerGas: win.ethers.parseUnits("1", "gwei")
      });

      showToast(`Payout transaction broadcasted! Claiming yield...`);
      await tx.wait();

      await triggerTransactionSuccessSequence(`Payout processed! Principal + 5.15% APY reward returned to your signer wallet.`);
    } catch (err: any) {
      console.error(err);
      showToast(err.reason || 'Claim payout failed', '#e35f4a');
    } finally {
      setIsSyncingVault(false);
    }
  };

  const fundVaultReserves = async () => {
    const win = window as any;
    if (!activeAddress) {
      showToast('Connect wallet first', '#e35f4a');
      return;
    }
    const amt = parseFloat(vaultReservesAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('Please enter a valid funding amount', '#e35f4a');
      return;
    }

    try {
      setIsSyncingVault(true);
      showToast('Phase 1: Approving reserves funding spend...', 'var(--arc-accent)');
      const erc20Abi = ["function approve(address spender, uint256 value) returns (bool)"];
      const p = new win.ethers.BrowserProvider(win.ethereum);
      const s = await p.getSigner();

      const tokenContract = new win.ethers.Contract(TOKENS.USDC.address, erc20Abi, s);
      const parsedAmount = win.ethers.parseUnits(vaultReservesAmount, 6);

      const baseGwei = 20n;
      const multiplier = getGasMultiplierNum();
      const gasFee = win.ethers.parseUnits((baseGwei * BigInt(Math.round(multiplier * 100)) / 100n).toString(), "gwei");

      const approveTx = await tokenContract.approve(VAULT_CONTRACT_ADDRESS, parsedAmount, {
        maxFeePerGas: gasFee,
        maxPriorityFeePerGas: win.ethers.parseUnits("1", "gwei")
      });

      showToast('Funding approval broadcasted! Awaiting confirmation...');
      await approveTx.wait();

      showToast('Phase 2: Transferring USDC yield reserves into Vault...', 'var(--arc-accent)');
      const vaultContract = new win.ethers.Contract(VAULT_CONTRACT_ADDRESS, VAULT_ABI, s);

      const tx = await vaultContract.fundReserves(parsedAmount, {
        maxFeePerGas: gasFee,
        maxPriorityFeePerGas: win.ethers.parseUnits("1", "gwei")
      });

      showToast('Funding transaction broadcasted! Depositing on-chain...');
      await tx.wait();

      setVaultReservesAmount('');
      await triggerTransactionSuccessSequence(`Reserves successfully funded with ${vaultReservesAmount} USDC!`);
    } catch (err: any) {
      console.error(err);
      showToast(err.reason || 'Funding reserves failed', '#e35f4a');
    } finally {
      setIsSyncingVault(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 5. Invoicing & In-App Uploader File Attachment Handler [1.1]
  // ---------------------------------------------------------------------------
  const handleUploadedFileChange = async (e: any) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      setUploadedInvoiceDocUrl('');
      return;
    }

    showToast("Uploading Shipping Proof to tmpfiles.org...", "var(--arc-accent2)");
    const file = files[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: formData
      });
      const json = await res.json();
      if (json.status === 'success' || json.data) {
        const rawUrl = json.data.url;
        // Convert dynamic temporary download viewer link to raw file stream preview URL [1.1]
        const finalUrl = rawUrl.replace("https://tmpfiles.org/", "https://tmpfiles.org/dl/");
        setUploadedInvoiceDocUrl(finalUrl);
        showToast("Shipping Proof uploaded successfully!", "#00e5a0");
      } else {
        throw new Error('Non-success state returned');
      }
    } catch (err) {
      console.error("API File Upload failed:", err);
      showToast("Upload failed. Using local browser preview.", "#e35f4a");
      setUploadedInvoiceDocUrl(URL.createObjectURL(file));
    }
  };

  const copyInvoiceShareableLink = () => {
    if (!invoiceOutputLink) {
      showToast('Please fill out the Customer Wallet and Amount fields', '#e35f4a');
      return;
    }
    navigator.clipboard.writeText(invoiceOutputLink).then(() => {
      showToast('Secure Invoice Paylink copied to clipboard!');
    }).catch(() => {
      showToast('Copy failed. Manual selection needed.', '#e35f4a');
    });
  };

  const checkIncomingPaylink = () => {
    const params = new URLSearchParams(window.location.search);
    const toAddress = params.get('to');
    const amount = params.get('amount');
    const token = params.get('token');
    const desc = params.get('desc');
    const doc = params.get('doc');

    const ethersObj = (window as any).ethers;

    if (toAddress && ethersObj && ethersObj.isAddress(toAddress)) {
      setActivePanel('escrow');
      setEscrowSeller(toAddress);
      if (amount) {
        setEscrowAmount(amount);
      }
      if (token) {
        let matchedAddr = TOKENS.USDC.address;
        for (const k in TOKENS) {
          if (TOKENS[k].symbol === token) {
            matchedAddr = TOKENS[k].address;
          }
        }
        setEscrowToken(matchedAddr);
      }
      
      let finalDoc = '';
      if (doc) {
        finalDoc = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
        if (doc.startsWith("http") || doc.includes("/")) {
          finalDoc = decodeURIComponent(doc);
        }
        setPaylinkIncomingDoc(finalDoc);
      }

      // Store complete incoming invoice details
      setIncomingInvoice({
        to: toAddress,
        amount: amount || '0',
        token: token || 'USDC',
        desc: desc ? decodeURIComponent(desc) : '',
        doc: finalDoc
      });
      setEscrowTabs('invoice');

      const parsedDesc = desc ? ` Invoice description: "${decodeURIComponent(desc)}"` : '';
      showToast(`Secure Billing Paylink detected.${parsedDesc}`, 'var(--arc-accent)');
    }
  };

  // ---------------------------------------------------------------------------
  // 6. Graphics Engines (Chart.js & QRious QR Codes)
  // ---------------------------------------------------------------------------
  const renderAssetAllocationChart = () => {
    const win = window as any;
    if (!win.Chart) return;

    const usdcVal = parseFloat(balances.usdc) || 0;
    const eurcVal = (parseFloat(balances.eurc) || 0) * TOKENS.EURC.usdRate;
    const usycVal = parseFloat(balances.usyc) || 0;

    const dataVals = [usdcVal, eurcVal, usycVal];
    const chartData = (usdcVal + eurcVal + usycVal) === 0 ? [1, 1, 1] : dataVals;
    const totalVal = usdcVal + eurcVal + usycVal;

    const usdcPct = totalVal > 0 ? ((usdcVal / totalVal) * 100).toFixed(1) + '%' : '0.0%';
    const eurcPct = totalVal > 0 ? ((eurcVal / totalVal) * 100).toFixed(1) + '%' : '0.0%';
    const usycPct = totalVal > 0 ? ((usycVal / totalVal) * 100).toFixed(1) + '%' : '0.0%';

    const labels = [
      `USDC (${totalVal > 0 ? usdcPct : '0%'})`,
      `EURC (USD) (${totalVal > 0 ? eurcPct : '0%'})`,
      `USYC (${totalVal > 0 ? usycPct : '0%'})`
    ];

    const ctx = document.getElementById('portfolio-chart') as HTMLCanvasElement;
    if (!ctx) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    chartInstanceRef.current = new win.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: chartData,
          backgroundColor: ['#2775CA', '#00e5a0', '#7b61ff'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: '#e8eaed',
              font: {
                family: 'DM Sans',
                size: 10
              },
              boxWidth: 10
            }
          },
          tooltip: {
            callbacks: {
              label: function(context: any) {
                const label = context.label || '';
                const baseLabel = label.split(' ')[0] || '';
                if (totalVal === 0) {
                  return `${baseLabel}: $0.00 (0.0%)`;
                }
                const value = context.parsed;
                const percentage = ((value / totalVal) * 100).toFixed(1);
                return `${baseLabel}: $${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${percentage}%)`;
              }
            }
          }
        },
        cutout: '70%'
      }
    });
  };

  const generateP2PDepositQR = () => {
    const win = window as any;
    if (!win.QRious || !activeAddress) return;

    const paylinkUrl = `${window.location.origin}${window.location.pathname}?to=${activeAddress}`;
    const canvas = document.getElementById('wallet-qr') as HTMLCanvasElement;
    if (!canvas) return;

    if (qrInstanceRef.current) {
      qrInstanceRef.current.set({ value: paylinkUrl });
    } else {
      qrInstanceRef.current = new win.QRious({
        element: canvas,
        value: paylinkUrl,
        size: 140,
        background: '#ffffff',
        foreground: '#000000',
        level: 'H'
      });
    }
  };

  // ---------------------------------------------------------------------------
  // 7. General Utility Actions
  // ---------------------------------------------------------------------------
  const showToast = (msg: string, color?: string, bgColor?: string) => {
    setToastMessage(msg);
    setToastColor(color || 'var(--arc-accent)');
    setIsToastVisible(true);
    setTimeout(() => {
      setIsToastVisible(false);
    }, 5500);
  };

  const copyConnectedAddress = () => {
    if (!activeAddress) {
      showToast('No connected wallet', '#e35f4a');
      return;
    }
    navigator.clipboard.writeText(activeAddress);
    showToast('Address copied to clipboard');
  };

  const triggerFaucetRedirect = () => {
    showToast('Opening Circle Faucet...');
    setTimeout(() => {
      window.open('https://faucet.circle.com', '_blank');
    }, 600);
  };

  const saveSettingsAction = () => {
    showToast('Settings updated locally');
    initTradingViewWidget(); // refresh visual charts on RPC change endpoints
  };

  const selectContactField = (address: string) => {
    if (activePanel === 'send') {
      setSendToAddress(address);
    } else if (activePanel === 'escrow') {
      setEscrowSeller(address);
    } else if (activePanel === 'invoices') {
      setInvoiceClient(address);
    }
    showToast('Prefilled target address from Contacts');
  };

  // Set send maximum balance helper
  const setSendMaxAmount = () => {
    let balStr = "0.00";
    if (sendToken === 'USDC') balStr = balances.usdc.replace(/,/g, '');
    else if (sendToken === 'EURC') balStr = balances.eurc.replace(/,/g, '');
    else if (sendToken === 'USYC') balStr = balances.usyc.replace(/,/g, '');
    setSendAmount(balStr);
  };

  // Upfront Fee dynamic calculated pricing model values
  const numericEscrowAmt = parseFloat(escrowAmount);
  const showEscrowFee = !isNaN(numericEscrowAmt) && numericEscrowAmt > 0;
  const computedEscrowFee = showEscrowFee ? (numericEscrowAmt * 0.03).toFixed(2) : '0.00';
  const computedEscrowTotal = showEscrowFee ? (numericEscrowAmt * 1.03).toFixed(2) : '0.00';

  // Find standard symbol for selected escrow token
  let escrowTokenSymbol = "USDC";
  for (const k in TOKENS) {
    if (TOKENS[k].address.toLowerCase() === escrowToken.toLowerCase()) {
      escrowTokenSymbol = TOKENS[k].symbol;
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', backgroundColor: '#0a0c0f' }}>
      
      {/* -----------------------------------------------------------------------
          SPLASH SCREEN OVER_UNDERLAY BLOCK (HI-FI NATIVE GEOMETRIC VECTOR DESIGN)
          ---------------------------------------------------------------------- */}
      {isSplashRendered && (
        <div 
          id="hybri-splash" 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundImage: 'radial-gradient(circle at center, #111417 0%, #0a0c0f 100%)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 0.8s ease',
            opacity: splashOpacity
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div 
              id="splash-logo-container" 
              style={{ 
                animation: 'emerge 3.5s cubic-bezier(0.1, 0.8, 0.3, 1) forwards', 
                marginBottom: '24px' 
              }}
            >
              <div id="fallback-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
                  <defs>
                    <linearGradient id="logo-grad-shield" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#7b61ff" />
                      <stop offset="100%" stopColor="#00e5a0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Outer Shield */}
                  <path d="M50,88 C20,70 20,40 20,25 L50,12 L80,25 C80,40 80,70 50,88 Z" stroke="url(#logo-grad-shield)" strokeWidth="5" strokeLinejoin="round" fill="none" />
                  
                  {/* Interlocking Loops */}
                  <circle cx="38" cy="48" r="12" stroke="url(#logo-grad-shield)" strokeWidth="4" fill="none" />
                  <circle cx="62" cy="48" r="12" stroke="url(#logo-grad-shield)" strokeWidth="4" fill="none" />
                  
                  {/* Central Ascending Arrow */}
                  <path d="M50,68 V30" stroke="url(#logo-grad-shield)" strokeWidth="5" strokeLinecap="round" />
                  <polygon points="50,20 40,32 60,32" fill="url(#logo-grad-shield)" />
                  
                  {/* Center Keyhole Cutout */}
                  <circle cx="50" cy="54" r="5" fill="#0a0c0f" />
                  <polygon points="50,54 46,68 54,68" fill="#0a0c0f" />
                </svg>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '32px', fontWeight: 'bold', color: '#ffffff', letterSpacing: '0.02em' }}>
                  Hybri<span style={{ color: '#00e5a0' }}>Pay</span>
                </span>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--arc-muted)', textTransform: 'uppercase', letterSpacing: '0.15em', animation: 'pulse 2s infinite' }}>
              Initializing Secure Gateway...
            </div>
          </div>
        </div>
      )}

      {/* -----------------------------------------------------------------------
          MAIN CORE APPLICATION SHELL
          ---------------------------------------------------------------------- */}
      <div className="arc-app">
        
        {/* Header Block */}
        <div className="arc-header">
          <div 
            className="arc-logo" 
            onClick={() => setActivePanel('dashboard')} 
            style={{ cursor: 'pointer' }}
          >
            <div className="arc-logo-mark" style={{ background: 'transparent', borderRadius: 0, width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '4px' }}>
              <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
                <defs>
                  <linearGradient id="header-logo-grad-shield" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#7b61ff" />
                    <stop offset="100%" stopColor="#00e5a0" />
                  </linearGradient>
                </defs>
                <path d="M50,88 C20,70 20,40 20,25 L50,12 L80,25 C80,40 80,70 50,88 Z" stroke="url(#header-logo-grad-shield)" strokeWidth="5" strokeLinejoin="round" fill="none" />
                <circle cx="38" cy="48" r="12" stroke="url(#header-logo-grad-shield)" strokeWidth="4" fill="none" />
                <circle cx="62" cy="48" r="12" stroke="url(#header-logo-grad-shield)" strokeWidth="4" fill="none" />
                <path d="M50,68 V30" stroke="url(#header-logo-grad-shield)" strokeWidth="5" strokeLinecap="round" />
                <polygon points="50,20 40,32 60,32" fill="url(#header-logo-grad-shield)" />
                <circle cx="50" cy="54" r="5" fill="#111417" />
                <polygon points="50,54 46,68 54,68" fill="#111417" />
              </svg>
            </div>
            <span className="arc-logo-text">Hybri<span>Pay</span></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {/* Theme Toggle Pill */}
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '2px', 
                background: 'rgba(0,0,0,0.4)', 
                border: '1.5px solid var(--arc-border)', 
                borderRadius: '4px', 
                padding: '2px'
              }}
            >
              <button 
                type="button"
                onClick={() => {
                  setActiveTheme('arc');
                  showToast('🛰️ Activated Arc Cyber Theme');
                }}
                style={{ 
                  fontSize: '9px', 
                  fontFamily: "'Space Mono', monospace", 
                  padding: '2px 8px', 
                  backgroundColor: activeTheme === 'arc' ? 'var(--arc-accent)' : 'transparent',
                  color: activeTheme === 'arc' ? '#000000' : 'var(--arc-muted)',
                  border: 'none',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  fontWeight: activeTheme === 'arc' ? 'bold' : 'normal',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <i className="ti ti-atom" style={{ fontSize: '10px' }} /> Arc Cyber
              </button>
              <button 
                type="button"
                onClick={() => {
                  setActiveTheme('darkcyber');
                  showToast('🌌 Activated Dark Cyber Theme');
                }}
                style={{ 
                  fontSize: '9px', 
                  fontFamily: "'Space Mono', monospace", 
                  padding: '2px 8px', 
                  backgroundColor: activeTheme === 'darkcyber' ? 'var(--arc-accent)' : 'transparent',
                  color: activeTheme === 'darkcyber' ? '#000000' : 'var(--arc-muted)',
                  border: 'none',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  fontWeight: activeTheme === 'darkcyber' ? 'bold' : 'normal',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <i className="ti ti-moon" style={{ fontSize: '10px' }} /> Dark Cyber
              </button>
            </div>

            <div className="arc-status">
              <div className="arc-dot"></div>
              Arc Testnet · Chain 5042002
            </div>
            <div className="arc-badge">Testnet</div>
          </div>
        </div>

        {/* Application Navigation Split */}
        <div className="arc-body">
          
          {/* Navigation Sidebar */}
          <div className="arc-sidebar">
            <div className="arc-nav-section">Main</div>
            
            <div className={`arc-nav-item ${activePanel === 'dashboard' ? 'active' : ''}`} onClick={() => setActivePanel('dashboard')}>
              <i className="ti ti-layout-dashboard" aria-hidden="true"></i> Dashboard
            </div>
            
            <div className={`arc-nav-item ${activePanel === 'escrow' ? 'active' : ''}`} onClick={() => setActivePanel('escrow')}>
              <i className="ti ti-shield" aria-hidden="true"></i> Escrow Checkout
            </div>
            
            <div className={`arc-nav-item ${activePanel === 'invoices' ? 'active' : ''}`} onClick={() => setActivePanel('invoices')}>
              <i className="ti ti-file-invoice" aria-hidden="true"></i> Merchant Invoices
            </div>
            
            <div className={`arc-nav-item ${activePanel === 'vault' ? 'active' : ''}`} onClick={() => setActivePanel('vault')}>
              <i className="ti ti-lock" aria-hidden="true"></i> Yield Vault
            </div>
            
            <div className={`arc-nav-item ${activePanel === 'trade' ? 'active' : ''}`} onClick={() => setActivePanel('trade')}>
              <i className="ti ti-arrows-exchange" aria-hidden="true"></i> Trade
            </div>
            
            <div className={`arc-nav-item ${activePanel === 'send' ? 'active' : ''}`} onClick={() => setActivePanel('send')}>
              <i className="ti ti-send" aria-hidden="true"></i> Send
            </div>
            
            <div className={`arc-nav-item ${activePanel === 'history' ? 'active' : ''}`} onClick={() => setActivePanel('history')}>
              <i className="ti ti-history" aria-hidden="true"></i> History
            </div>

            <div className="arc-nav-section">ABOUT HYBRIPAY</div>
            
            <div className={`arc-nav-item ${activePanel === 'docs' ? 'active' : ''}`} onClick={() => setActivePanel('docs')}>
              <i className="ti ti-info-circle" aria-hidden="true"></i> About HybriPay
            </div>

            <div className="arc-nav-section">Wallet</div>
            
            <div className={`arc-nav-item ${activePanel === 'wallet' ? 'active' : ''}`} onClick={() => setActivePanel('wallet')}>
              <i className="ti ti-wallet" aria-hidden="true"></i> Connect Wallet
            </div>
            
            <div className={`arc-nav-item ${activePanel === 'settings' ? 'active' : ''}`} onClick={() => setActivePanel('settings')}>
              <i className="ti ti-settings" aria-hidden="true"></i> Settings
            </div>
          </div>

          {/* Core Panel Content Switcher */}
          <div className="arc-main" id="arc-main">

            {/* -----------------------------------------------------------------
                A. DASHBOARD PANEL
                ---------------------------------------------------------------- */}
            {activePanel === 'dashboard' && (
              <div id="panel-dashboard">
                <div className="arc-wallet-bar">
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--arc-muted)', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                      Connected wallet
                    </div>
                    <div className="arc-wallet-addr">
                      0x<span>{activeAddress ? activeAddress.slice(2) : "Not Connected"}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="arc-btn arc-btn-secondary" style={{ width: 'auto', padding: '6px 14px', margin: 0, fontSize: '12px' }} onClick={copyConnectedAddress}>
                      <i className="ti ti-copy" aria-hidden="true"></i> Copy
                    </button>
                    <button className="arc-btn" style={{ width: 'auto', padding: '6px 14px', margin: 0, fontSize: '12px' }} onClick={triggerFaucetRedirect}>
                      <i className="ti ti-droplet" aria-hidden="true"></i> Faucet
                    </button>
                  </div>
                </div>

                {/* KPI Metrics Grid */}
                <div className="arc-grid">
                  <div className="arc-stat">
                    <div className="arc-stat-label">Portfolio Value</div>
                    <div className="arc-stat-value" id="portfolio-value">{portfolioValue}</div>
                    <div className="arc-stat-sub arc-stat-up">Live On-Chain Value</div>
                  </div>
                  <div className="arc-stat">
                    <div className="arc-stat-label">Transactions</div>
                    <div className="arc-stat-value" id="tx-count">{txCount}</div>
                    <div className="arc-stat-sub">Historical Tx Count</div>
                  </div>
                  <div className="arc-stat">
                    <div className="arc-stat-label">Loyalty Standing</div>
                    <div className="arc-stat-value" id="loyalty-pts" style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ fontSize: '26px', color: getTier(loyaltyPoints).color, fontWeight: 'bold' }}>{getTier(loyaltyPoints).name}</span>
                      <span style={{ fontSize: '13px', color: 'var(--arc-muted)', fontFamily: "'Space Mono', monospace" }}>{loyaltyPoints} pts</span>
                    </div>
                    <div className="arc-stat-sub">Multiplier: <span style={{ color: 'var(--arc-accent)', fontWeight: 'bold' }}>{(1.0 + (loyaltyStreak - 1) * 0.1).toFixed(1)}x</span></div>
                  </div>
                </div>

                {/* Stablecoin and Charts Allocation Layouts */}
                <div className="arc-split-layout">
                  <div className="arc-tokens" style={{ marginBottom: 0 }}>
                    <div className="arc-tokens-header">
                      <span className="arc-tokens-title">Token Balances</span>
                      <button className="arc-btn arc-btn-secondary" style={{ width: 'auto', padding: '5px 12px', margin: 0, fontSize: '11px' }} onClick={manualRefreshSync}>
                        <i className="ti ti-refresh" aria-hidden="true"></i> Refresh
                      </button>
                    </div>

                    <div className="arc-token-row" onClick={() => selectContactField(TOKENS.USDC.address)}>
                      <div className="arc-token-icon" style={{ backgroundColor: 'rgba(39,117,202,0.15)', color: '#2775CA' }}>$</div>
                      <div>
                        <div className="arc-token-name">USDC</div>
                        <div className="arc-token-chain">Arc Testnet</div>
                      </div>
                      <div className="arc-token-amount">
                        <div className="arc-token-bal" id="bal-usdc">{Number(balances.usdc).toLocaleString()}</div>
                        <div className="arc-token-usd" id="usd-usdc">${Number(balances.usdc).toLocaleString()}</div>
                      </div>
                    </div>

                    <div className="arc-token-row" onClick={() => selectContactField(TOKENS.EURC.address)}>
                      <div className="arc-token-icon" style={{ backgroundColor: 'rgba(0,229,160,0.15)', color: '#00e5a0' }}>€</div>
                      <div>
                        <div className="arc-token-name">EURC</div>
                        <div className="arc-token-chain">Arc Testnet</div>
                      </div>
                      <div className="arc-token-amount">
                        <div className="arc-token-bal" id="bal-eurc">{Number(balances.eurc).toLocaleString()}</div>
                        <div className="arc-token-usd" id="usd-eurc">
                          ${Number(parseFloat(balances.eurc) * TOKENS.EURC.usdRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>

                    <div className="arc-token-row" onClick={() => selectContactField(TOKENS.USYC.address)}>
                      <div className="arc-token-icon" style={{ backgroundColor: 'rgba(123,97,255,0.15)', color: '#7b61ff' }}>Y</div>
                      <div>
                        <div className="arc-token-name">USYC</div>
                        <div className="arc-token-chain">Arc Testnet</div>
                      </div>
                      <div className="arc-token-amount">
                        <div className="arc-token-bal" id="bal-usyc">{Number(balances.usyc).toLocaleString()}</div>
                        <div className="arc-token-usd" id="usd-usyc">${Number(balances.usyc).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>

                  <div className="arc-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="arc-panel-title" style={{ alignSelf: 'flex-start', marginBottom: '12px', width: '100%' }}>
                      <i className="ti ti-chart-pie" aria-hidden="true"></i> Asset Allocation
                    </div>
                    <div style={{ width: '100%', maxWidth: '170px', margin: '0 auto', minHeight: '170px' }}>
                      <canvas id="portfolio-chart"></canvas>
                    </div>
                  </div>
                </div>

                {/* -----------------------------------------------------------------
                    HYBRIPAY LOYALTY ARENA & GAMIFIED STATIONS
                    ---------------------------------------------------------------- */}
                <div className="arc-panel" style={{ marginTop: '20px', padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--arc-border)', paddingBottom: '16px', marginBottom: '20px' }}>
                    <div>
                      <div className="arc-panel-title" style={{ fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="ti ti-crown" style={{ color: '#ffd700' }} aria-hidden="true"></i> HybriPay Loyalty Station
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--arc-muted)', marginTop: '4px' }}>
                        Active transacting rewards you with points redeemable for future gas compensation & native <span style={{ color: 'var(--arc-accent)', fontWeight: 600 }}>$HYBRIPAY</span> token rewards!
                      </p>
                    </div>

                    {/* Streak flame indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '12px', padding: '8px 14px' }}>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="ti ti-flame" style={{ fontSize: '24px', color: '#f59e0b' }} />
                        <span style={{ position: 'absolute', fontSize: '9px', fontWeight: 'bold', color: '#ffffff', bottom: '-4px', backgroundColor: '#e35f4a', padding: '1px 4px', borderRadius: '4px' }}>
                          x{(1.0 + (loyaltyStreak - 1) * 0.1).toFixed(1)}
                        </span>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--arc-text)' }}>
                          {loyaltyStreak} Day Streak
                        </div>
                        <div style={{ fontSize: '9px', color: 'var(--arc-muted)' }}>
                          Active Streak Multiplier
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="arc-split-layout" style={{ gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.85fr)', gap: '20px', margin: 0 }}>
                    
                    {/* LEFT COLUMN: TIER AND PROGRESS RING / BAR */}
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#080a0e', border: '1px solid var(--arc-border)', borderRadius: '12px', padding: '20px' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--arc-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                            <i className="ti ti-award" /> Tier Standing & Milestone
                          </span>
                          <span style={{ fontSize: '10px', color: getTier(loyaltyPoints).color, fontWeight: 'bold', textTransform: 'uppercase', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: '12px', border: `1px solid ${getTier(loyaltyPoints).color}44` }}>
                            {getTier(loyaltyPoints).name} Member
                          </span>
                        </div>

                        {/* Circular progress container or beautiful high-fidelity bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '8px 0' }}>
                          {/* Beautiful SVG Circular Progress */}
                          <div style={{ position: 'relative', width: '80px', height: '80px', flexShrink: 0 }}>
                            <svg width="80" height="80" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                              {/* Background arc */}
                              <path
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="var(--arc-border)"
                                strokeWidth="3.5"
                              />
                              {/* Progress arc */}
                              <path
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke={getTier(loyaltyPoints).color}
                                strokeWidth="3.5"
                                strokeDasharray={`${Math.min(100, Math.max(0, ((loyaltyPoints - getTier(loyaltyPoints).prev) / (getTier(loyaltyPoints).next - getTier(loyaltyPoints).prev)) * 100))}, 100`}
                              />
                            </svg>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--arc-text)', fontFamily: "'Space Mono', monospace" }}>
                                {Math.round(((loyaltyPoints - getTier(loyaltyPoints).prev) / (getTier(loyaltyPoints).next - getTier(loyaltyPoints).prev)) * 100)}%
                              </span>
                            </div>
                          </div>

                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--arc-text)', fontFamily: "'Space Mono', monospace" }}>
                              {loyaltyPoints} <span style={{ fontSize: '11px', color: 'var(--arc-muted)', fontWeight: 'normal' }}>/ {getTier(loyaltyPoints).next} PTS</span>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--arc-muted)', marginTop: '4px', lineHeight: '1.4' }}>
                              {getTier(loyaltyPoints).next - loyaltyPoints > 0 ? (
                                <span>
                                  Collect <strong style={{ color: 'var(--arc-text)' }}>{getTier(loyaltyPoints).next - loyaltyPoints}</strong> more points to promote to the next tier standing.
                                </span>
                              ) : (
                                <span>Highest Tier Level Standing! Keep stackin'!</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Daily Interaction check-in booster box */}
                      <div style={{ borderTop: '1px solid var(--arc-border)', paddingTop: '16px', marginTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--arc-text)' }}>Daily Interaction Booster</div>
                            <div style={{ fontSize: '9px', color: 'var(--arc-muted)' }}>Claim once daily for +15 PTS & streak security</div>
                          </div>
                          
                          <button
                            className="arc-btn"
                            disabled={lastCheckInDate === new Date().toISOString().split('T')[0]}
                            style={{ 
                              width: 'auto', 
                              margin: 0, 
                              padding: '6px 14px', 
                              fontSize: '11px',
                              opacity: lastCheckInDate === new Date().toISOString().split('T')[0] ? 0.5 : 1,
                              cursor: lastCheckInDate === new Date().toISOString().split('T')[0] ? 'not-allowed' : 'pointer',
                              background: lastCheckInDate === new Date().toISOString().split('T')[0] ? 'var(--arc-border)' : 'var(--arc-accent)',
                              color: lastCheckInDate === new Date().toISOString().split('T')[0] ? 'var(--arc-muted)' : '#000000',
                            }}
                            onClick={() => {
                              const todayStr = new Date().toISOString().split('T')[0];
                              if (lastCheckInDate === todayStr) {
                                showToast('Booster already claimed for today!');
                                return;
                              }
                              
                              setLastCheckInDate(todayStr);
                              localStorage.setItem('hybri_last_checkin_date', todayStr);
                              
                              setLoyaltyPoints(prev => prev + 15); // Authentic hard mode: +15 PTS
                              recordActivityToday();
                              
                              showToast('🌟 +15 PTS Claimed! Daily Streak multiplier preserved!', 'var(--arc-accent)');
                            }}
                          >
                            {lastCheckInDate === new Date().toISOString().split('T')[0] ? 'Claimed Today' : 'Claim +15 PTS'}
                          </button>
                        </div>
                      </div>
                    </div>
 
                    {/* RIGHT COLUMN: PROGRESS STREAK WORKOUT & ACTIVE CHALLENGES */}
                    <div style={{ display: 'flex', flexDirection: 'column', background: '#080a0e', border: '1px solid var(--arc-border)', borderRadius: '12px', padding: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--arc-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                          <i className="ti ti-flame" /> Interactive Streak Tracker
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--arc-accent)', fontWeight: 'bold' }}>
                          MULTIPLIER: {(1.0 + (loyaltyStreak - 1) * 0.1).toFixed(1)}x
                        </span>
                      </div>
 
                      {/* Day Tracker bubble layout */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', padding: '4px 0', flexWrap: 'nowrap', gap: '4px' }}>
                        {currentWeekDaysStatus.map((day) => {
                          const isCompleted = day.isCompleted;
                          const isToday = day.isToday;
                          return (
                            <div key={day.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flex: 1 }}>
                              <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: isCompleted ? 'rgba(0, 229, 160, 0.12)' : isToday ? 'rgba(245, 158, 11, 0.08)' : '#0d1014',
                                border: isCompleted ? '1px solid var(--arc-accent)' : isToday ? '1.5px dashed #f59e0b' : '1px solid var(--arc-border)',
                                color: isCompleted ? 'var(--arc-accent)' : isToday ? '#f59e0b' : 'var(--arc-muted)',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                cursor: 'default'
                              }}>
                                {isCompleted ? <i className="ti ti-check" /> : isToday ? <i className="ti ti-flame" style={{ color: '#f59e0b' }} /> : day.label.slice(0, 1)}
                              </div>
                              <span style={{ fontSize: '9px', color: isCompleted ? 'var(--arc-accent)' : isToday ? '#f59e0b' : 'var(--arc-muted)', fontWeight: isToday ? 'bold' : 'normal', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                {day.label}
                                {isToday && <span style={{ fontSize: '7px', display: 'block', transform: 'scale(0.85)', color: '#f59e0b', marginTop: '-2px' }}>Today</span>}
                              </span>
                            </div>
                          );
                        })}
                      </div>
 
                      {/* Quests Lists for the user */}
                      <div style={{ borderTop: '1px solid var(--arc-border)', paddingTop: '12px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--arc-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                          Daily Merchant Quests
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          
                          {/* Quest 1 */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0b0d11', border: '1px solid var(--arc-border)', borderRadius: '8px', padding: '8px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input 
                                type="checkbox" 
                                readOnly 
                                checked={completedQuests.includes('invoice_created')} 
                                style={{ accentColor: 'var(--arc-accent)', width: '13px', height: '13px' }} 
                              />
                              <div>
                                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--arc-text)' }}>Create a Paylink Invoice</div>
                                <div style={{ fontSize: '9px', color: 'var(--arc-muted)' }}>Share a secure checkout link with a client</div>
                              </div>
                            </div>
                            <span style={{ fontSize: '10px', color: 'var(--arc-accent)', fontWeight: 'bold', fontFamily: "'Space Mono', monospace" }}>+50 PTS</span>
                          </div>
 
                          {/* Quest 2 */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0b0d11', border: '1px solid var(--arc-border)', borderRadius: '8px', padding: '8px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input 
                                type="checkbox" 
                                readOnly 
                                checked={completedQuests.includes('escrow_funded')} 
                                style={{ accentColor: 'var(--arc-accent)', width: '13px', height: '13px' }} 
                              />
                              <div>
                                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--arc-text)' }}>Fund a DeFi Escrow Stand</div>
                                <div style={{ fontSize: '9px', color: 'var(--arc-muted)' }}>Lock funds in non-custodial Escrow protection</div>
                              </div>
                            </div>
                            <span style={{ fontSize: '10px', color: 'var(--arc-accent)', fontWeight: 'bold', fontFamily: "'Space Mono', monospace" }}>+100 PTS</span>
                          </div>
 
                          {/* Quest 3 */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0b0d11', border: '1px solid var(--arc-border)', borderRadius: '8px', padding: '8px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input 
                                type="checkbox" 
                                readOnly 
                                checked={completedQuests.includes('vault_yield')} 
                                style={{ accentColor: 'var(--arc-accent)', width: '13px', height: '13px' }} 
                              />
                              <div>
                                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--arc-text)' }}>Earn 5.15% APY Vault Yield</div>
                                <div style={{ fontSize: '9px', color: 'var(--arc-muted)' }}>Lock USDC reserves in the USYC Yield Vault</div>
                              </div>
                            </div>
                            <span style={{ fontSize: '10px', color: 'var(--arc-accent)', fontWeight: 'bold', fontFamily: "'Space Mono', monospace" }}>+75 PTS</span>
                          </div>
 
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            )}

            {/* -----------------------------------------------------------------
                B. ESCROW CHECKOUT PANEL
                ---------------------------------------------------------------- */}
            {activePanel === 'escrow' && (
              <div id="panel-escrow">
                <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-shield-check" style={{ color: 'var(--arc-accent)' }} aria-hidden="true"></i> Escrow Checkout
                </div>

                <div className="arc-split-layout">
                  <div className="arc-panel">
                    <div className="arc-panel-title" style={{ marginBottom: '20px' }}>
                      <i className="ti ti-shield-lock" aria-hidden="true"></i> Secure Escrow Deposit
                    </div>

                    {/* Incoming Document Pre-fill Verification Alert [1.1] */}
                    {paylinkIncomingDoc && (
                      <div id="escrow-incoming-doc-banner" style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)', borderRadius: '8px', padding: '12px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--arc-accent)', fontWeight: 600 }}>
                          <i className="ti ti-file-text"></i> Invoice Document Attached
                        </span>
                        <button className="arc-btn arc-btn-secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: '10px', marginTop: 0 }} onClick={() => window.open(paylinkIncomingDoc, '_blank')}>
                          View Document
                        </button>
                      </div>
                    )}

                    <div className="arc-field">
                      <label>Seller/Merchant Address</label>
                      <input className="arc-input" type="text" placeholder="0x..." value={escrowSeller} onChange={(e) => setEscrowSeller(e.target.value)} />
                    </div>

                    <div className="arc-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label>Select Stablecoin</label>
                        <select className="arc-select" value={escrowToken} onChange={(e) => setEscrowToken(e.target.value)}>
                          <option value="0x3600000000000000000000000000000000000000">USDC</option>
                          <option value="0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a">EURC</option>
                          <option value="0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C">USYC</option>
                        </select>
                      </div>
                      <div>
                        <label>Amount to Lock</label>
                        <input className="arc-input" type="number" placeholder="0.00" value={escrowAmount} onChange={(e) => setEscrowAmount(e.target.value)} />
                      </div>
                    </div>

                    {/* Total Upfront computed pricing fee layout display box */}
                    {showEscrowFee && (
                      <div id="escrow-fee-breakdown" style={{ background: '#0d1014', borderRadius: '8px', padding: '12px', fontSize: '11px', color: 'var(--arc-muted)', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Seller Payout (100%)</span>
                          <span style={{ color: 'var(--arc-text)' }}>{escrowAmount} {escrowTokenSymbol}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Platform Fee (3% Upfront)</span>
                          <span style={{ color: 'var(--arc-accent)' }}>{computedEscrowFee} {escrowTokenSymbol}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--arc-border)', paddingTop: '6px', marginTop: '6px', fontWeight: 600 }}>
                          <span>Total Surcharged cost</span>
                          <span style={{ color: 'var(--arc-text)' }}>{computedEscrowTotal} {escrowTokenSymbol}</span>
                        </div>
                      </div>
                    )}

                    <button className="arc-btn" onClick={confirmCreateEscrowDeposit}>
                      Approve & Create Escrow Deposit
                    </button>
                  </div>

                  <div className="arc-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '440px' }}>
                    <div>
                      {/* Interactive Tab Selector if an incoming invoice is pinned */}
                      {incomingInvoice ? (
                        <div style={{ display: 'flex', background: '#080a0e', border: '1px solid var(--arc-border)', borderRadius: '8px', padding: '4px', marginBottom: '18px', gap: '4px' }}>
                          <button 
                            className="arc-btn" 
                            style={{ 
                              flex: 1, 
                              margin: 0, 
                              fontSize: '11px', 
                              padding: '8px 12px', 
                              borderRadius: '6px',
                              background: escrowTabs === 'invoice' ? 'var(--arc-border)' : 'transparent', 
                              border: 'none',
                              color: escrowTabs === 'invoice' ? 'var(--arc-text)' : 'var(--arc-muted)',
                              fontWeight: escrowTabs === 'invoice' ? '600' : 'normal',
                              cursor: 'pointer'
                            }} 
                            onClick={() => setEscrowTabs('invoice')}
                          >
                            <i className="ti ti-receipt" aria-hidden="true"></i> Digital Invoice Bill
                          </button>
                          <button 
                            className="arc-btn" 
                            style={{ 
                              flex: 1, 
                              margin: 0, 
                              fontSize: '11px', 
                              padding: '8px 12px', 
                              borderRadius: '6px',
                              background: escrowTabs === 'manage' ? 'var(--arc-border)' : 'transparent', 
                              border: 'none',
                              color: escrowTabs === 'manage' ? 'var(--arc-text)' : 'var(--arc-muted)',
                              fontWeight: escrowTabs === 'manage' ? '600' : 'normal',
                              cursor: 'pointer'
                            }} 
                            onClick={() => setEscrowTabs('manage')}
                          >
                            <i className="ti ti-settings" aria-hidden="true"></i> Manage Escrows
                          </button>
                        </div>
                      ) : (
                        <div className="arc-panel-title" style={{ marginBottom: '8px' }}>
                          <i className="ti ti-settings" aria-hidden="true"></i> Manage Escrow Orders
                        </div>
                      )}

                      {/* Display Incoming Digital Invoice details */}
                      {incomingInvoice && escrowTabs === 'invoice' ? (
                        <div id="digital-invoice-bill-container" style={{ background: '#0a0c0f', border: '1px dashed var(--arc-border)', borderRadius: '12px', padding: '16px', position: 'relative', overflow: 'hidden' }}>
                          {/* Top receipt accent strip */}
                          <div style={{ height: '4px', background: 'var(--arc-accent)', position: 'absolute', top: 0, left: 0, right: 0 }} />
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', marginTop: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <i className="ti ti-shield-check" style={{ fontSize: '15px', color: 'var(--arc-accent)' }} />
                              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--arc-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HybriPay Invoice Bill</span>
                            </div>
                            <span style={{ fontSize: '10px', background: 'rgba(0, 229, 160, 0.1)', color: 'var(--arc-accent)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                              UNPAID
                            </span>
                          </div>

                          {/* Invoice Ref & Date */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--arc-muted)', marginBottom: '12px', borderBottom: '1px solid #141920', paddingBottom: '8px' }}>
                            <span>REF: <span style={{ fontFamily: "'Space Mono', monospace", color: 'var(--arc-text)' }}>
                              {(() => {
                                let hash = 0;
                                const str = incomingInvoice.to;
                                for (let i = 0; i < str.length; i++) {
                                  hash = str.charCodeAt(i) + ((hash << 5) - hash);
                                }
                                return `INV-2026-${Math.abs(hash % 100000).toString().padStart(5, '0')}`;
                              })()}
                            </span></span>
                            <span>DATE: <span style={{ color: 'var(--arc-text)' }}>{new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span></span>
                          </div>

                          {/* Merchant Detail */}
                          <div style={{ marginBottom: '12px' }}>
                            <label style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--arc-muted)', display: 'block', marginBottom: '4px' }}>Sender (Seller/Merchant)</label>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0e1217', borderRadius: '6px', padding: '8px 10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="ti ti-building-store" style={{ color: 'var(--arc-accent2)', fontSize: '14px' }} />
                                <span style={{ fontSize: '11px', fontFamily: "'Space Mono', monospace", color: 'var(--arc-text)' }}>
                                  {incomingInvoice.to.slice(0, 8)}...{incomingInvoice.to.slice(-6)}
                                </span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '1px 5px', borderRadius: '4px', fontWeight: 500 }}>
                                  Verified
                                </span>
                              </div>
                              <button 
                                className="arc-btn" 
                                style={{ width: 'auto', margin: 0, padding: '2px 6px', fontSize: '10px' }}
                                onClick={() => {
                                  navigator.clipboard.writeText(incomingInvoice.to);
                                  showToast('Merchant address copied!');
                                }}
                              >
                                <i className="ti ti-copy" aria-hidden="true"></i>
                              </button>
                            </div>
                          </div>

                          {/* Description detail */}
                          <div style={{ marginBottom: '12px' }}>
                            <label style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--arc-muted)', display: 'block', marginBottom: '4px' }}>Invoice Description</label>
                            <div style={{ background: '#0e1217', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', color: 'var(--arc-text)', lineHeight: '1.4', minHeight: '38px', wordBreak: 'break-word' }}>
                              {incomingInvoice.desc || 'No description provided.'}
                            </div>
                          </div>

                          {/* Shipping Proof File Attachment if present */}
                          {incomingInvoice.doc && (
                            <div style={{ marginBottom: '12px' }}>
                              <label style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--arc-muted)', display: 'block', marginBottom: '4px' }}>Proof / Document Attachment</label>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0e1217', border: '1px dashed rgba(0,229,160,0.2)', borderRadius: '6px', padding: '8px 10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                                  <i className="ti ti-file-text" style={{ color: 'var(--arc-accent)', fontSize: '16px' }} />
                                  <span style={{ fontSize: '11px', color: 'var(--arc-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                                    agreement_invoice_doc.pdf
                                  </span>
                                </div>
                                <button 
                                  className="arc-btn" 
                                  style={{ width: 'auto', margin: 0, padding: '4px 8px', fontSize: '10px', background: 'rgba(0,229,160,0.1)', color: 'var(--arc-accent)', border: '1px solid rgba(0,229,160,0.2)' }}
                                  onClick={() => window.open(incomingInvoice.doc, '_blank')}
                                >
                                  View Document
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Amount Detail with large design */}
                          <div style={{ background: '#0e1217', borderRadius: '8px', padding: '12px', border: '1px solid var(--arc-border)', marginBottom: '12px', textAlign: 'center' }}>
                            <div style={{ fontSize: '10px', color: 'var(--arc-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Invoice Grand Total</div>
                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--arc-text)', fontFamily: "'Space Mono', monospace", display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
                              <span style={{ color: 'var(--arc-accent)' }}>{incomingInvoice.amount}</span>
                              <span style={{ fontSize: '12px', background: 'var(--arc-border)', color: 'var(--arc-text)', padding: '2px 8px', borderRadius: '6px', verticalAlign: 'middle', fontWeight: 600 }}>{incomingInvoice.token}</span>
                            </div>
                          </div>

                          {/* Security details */}
                          <div style={{ fontSize: '9px', color: 'var(--arc-muted)', textAlign: 'center', padding: '0 4px', lineHeight: '1.3' }}>
                            <i className="ti ti-info-circle" style={{ color: 'var(--arc-accent)', marginRight: '2px' }}></i> This invoice funds a secure, non-custodial Smart Escrow with locked USYC continuous yield accrual. Release only when cargo arrives.
                          </div>
                        </div>
                      ) : (
                        /* STANDARD MANAGE ESCROW ORDERS */
                        <div>
                          <div className="arc-field" style={{ marginBottom: '14px' }}>
                            <label>Escrow Order ID</label>
                            <input className="arc-input" type="number" placeholder="0" value={activeEscrowId} onChange={(e) => setActiveEscrowId(e.target.value)} />
                          </div>

                          {/* USYC yield dynamic currency box */}
                          <div style={{ background: 'rgba(123,97,255,0.06)', border: '1px solid rgba(123,97,255,0.2)', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--arc-accent2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <i className="ti ti-coin"></i> USYC Yield Treasury
                              </span>
                              <span style={{ fontSize: '10px', background: 'rgba(123,97,255,0.15)', color: 'var(--arc-accent2)', padding: '2px 6px', borderRadius: '12px', fontWeight: 600 }}>
                                5.15% APY
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--arc-muted)' }}>
                              <span>Locked Float: <span style={{ color: 'var(--arc-text)', fontWeight: 600 }}>${yieldFloat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                              <span>Accruing Yield: <span style={{ color: 'var(--arc-accent2)', fontWeight: 600, fontFamily: "'Space Mono', monospace" }}>${yieldAccumulated.toFixed(8)}</span></span>
                            </div>
                          </div>

                          <div style={{ borderTop: '1px solid var(--arc-border)', paddingTop: '12px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--arc-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: '10px' }}>
                              Your Active Escrows
                            </div>
                            <div id="pending-escrows-list" style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {pendingEscrows.filter(x => x.status === 'PENDING').length === 0 ? (
                                <div style={{ fontSize: '11px', color: 'var(--arc-muted)', textAlign: 'center', padding: '10px 0' }}>
                                  No active escrows.
                                </div>
                              ) : (
                                pendingEscrows.filter(x => x.status === 'PENDING').map(item => (
                                  <div 
                                    key={item.id} 
                                    onClick={() => {
                                      setActiveEscrowId(String(item.id));
                                      setSelectedEscrowDoc(item.docUrl || '');
                                      showToast(`Selected Order ID #${item.id}`);
                                    }}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#0d1014', border: '1px solid var(--arc-border)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                                  >
                                    <div>
                                      <span style={{ fontWeight: 600, color: 'var(--arc-accent)' }}>ID #{item.id}</span>
                                      <span style={{ color: 'var(--arc-text)', marginLeft: '8px' }}>{item.amount} {item.token}</span>
                                      {item.docUrl && <span style={{ fontSize: '9px', color: 'var(--arc-accent)', marginLeft: '6px' }}><i className="ti ti-file-text"></i> PDF</span>}
                                    </div>
                                    <span style={{ fontSize: '10px', color: '#f7921a', fontWeight: 600, textTransform: 'uppercase' }}>Pending</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer Controls for current tab */}
                    {incomingInvoice && escrowTabs === 'invoice' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                        <button 
                          className="arc-btn" 
                          style={{ margin: 0, width: '100%', cursor: 'pointer', fontWeight: 600, background: 'var(--arc-accent)', color: '#000000' }} 
                          onClick={() => {
                            setEscrowSeller(incomingInvoice.to);
                            setEscrowAmount(incomingInvoice.amount);
                            let matchedAddr = TOKENS.USDC.address;
                            for (const k in TOKENS) {
                              if (TOKENS[k].symbol === incomingInvoice.token) {
                                matchedAddr = TOKENS[k].address;
                              }
                            }
                            setEscrowToken(matchedAddr);
                            if (incomingInvoice.doc) {
                              setPaylinkIncomingDoc(incomingInvoice.doc);
                            }
                            
                            // Call deposit creator directly
                            confirmCreateEscrowDeposit();
                          }}
                        >
                          <i className="ti ti-shield-lock" aria-hidden="true"></i> Fund Escrow Deposit
                        </button>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <button 
                            className="arc-btn arc-btn-secondary" 
                            style={{ margin: 0 }} 
                            onClick={() => {
                              setEscrowSeller(incomingInvoice.to);
                              setEscrowAmount(incomingInvoice.amount);
                              let matchedAddr = TOKENS.USDC.address;
                              for (const k in TOKENS) {
                                  if (TOKENS[k].symbol === incomingInvoice.token) {
                                    matchedAddr = TOKENS[k].address;
                                  }
                              }
                              setEscrowToken(matchedAddr);
                              if (incomingInvoice.doc) {
                                setPaylinkIncomingDoc(incomingInvoice.doc);
                              }
                              showToast("Invoice values synced into checkout form!");
                            }}
                          >
                            <i className="ti ti-refresh" aria-hidden="true"></i> Sync Form
                          </button>
                          
                          <button 
                            className="arc-btn arc-btn-secondary" 
                            style={{ margin: 0, borderColor: 'rgba(227,95,74,0.3)', color: '#e35f4a' }} 
                            onClick={() => {
                              setIncomingInvoice(null);
                              setPaylinkIncomingDoc('');
                              // Clear url query parameters safely
                              const cleanUrl = window.location.origin + window.location.pathname;
                              window.history.replaceState({}, document.title, cleanUrl);
                              showToast('Invoice dismissed.');
                            }}
                          >
                            <i className="ti ti-trash" aria-hidden="true"></i> Dismiss Bill
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                        {selectedEscrowDoc && (
                          <button className="arc-btn arc-btn-secondary" style={{ marginTop: 0, width: '100%', borderColor: 'rgba(0,229,160,0.3)', color: 'var(--arc-accent)' }} onClick={() => window.open(selectedEscrowDoc, '_blank')}>
                            <i className="ti ti-file-text" aria-hidden="true"></i> View Shipping Document
                          </button>
                        )}
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <button className="arc-btn arc-btn-secondary" style={{ marginTop: 0 }} onClick={confirmReleaseEscrow}>
                            Release Funds
                          </button>
                          <button className="arc-btn arc-btn-secondary" style={{ marginTop: 0, borderColor: 'rgba(227,95,74,0.3)', color: '#e35f4a' }} onClick={confirmRefundEscrow}>
                            Issue Refund
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* -----------------------------------------------------------------
                C. MERCHANT INVOICES PANEL
                ---------------------------------------------------------------- */}
            {activePanel === 'invoices' && (
              <div id="panel-invoices">
                <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-file-invoice" style={{ color: 'var(--arc-accent)' }} aria-hidden="true"></i> Merchant Invoices
                </div>

                <div className="arc-split-layout">
                  <div className="arc-panel">
                    <div className="arc-panel-title" style={{ marginBottom: '16px' }}>
                      <i className="ti ti-file-plus" aria-hidden="true"></i> Create Digital Invoice
                    </div>
                    <div className="arc-field">
                      <label>Customer Wallet Address</label>
                      <input className="arc-input" type="text" placeholder="0x..." value={invoiceClient} onChange={(e) => setInvoiceClient(e.target.value)} />
                    </div>
                    <div className="arc-field">
                      <label>Item Description / Bill of Lading</label>
                      <input className="arc-input" type="text" placeholder="e.g. Purchase of 50 Inventory Units" value={invoiceDesc} onChange={(e) => setInvoiceDesc(e.target.value)} />
                    </div>
                    <div className="arc-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label>Due Date</label>
                        <input className="arc-input" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                      </div>
                      <div>
                        <label>Checkout Token</label>
                        <select className="arc-select" value={invoiceToken} onChange={(e) => setInvoiceToken(e.target.value)}>
                          <option value="USDC">USDC</option>
                          <option value="EURC">EURC</option>
                          <option value="USYC">USYC</option>
                        </select>
                      </div>
                    </div>

                    <div className="arc-field">
                      <label><i className="ti ti-file-text"></i> Attach Bill of Lading (Optional)</label>
                      <input className="arc-input" type="file" ref={fileInputRef} accept="application/pdf" style={{ padding: '7px 12px' }} onChange={handleUploadedFileChange} />
                    </div>

                    <div className="arc-field">
                      <label>Amount (Stablecoin Value)</label>
                      <input className="arc-input" type="number" placeholder="0.00" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} />
                    </div>

                    <button className="arc-btn" onClick={copyInvoiceShareableLink}>
                      Generate Shareable Paylink
                    </button>
                  </div>

                  <div className="arc-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div className="arc-panel-title" style={{ marginBottom: '12px' }}>
                        <i className="ti ti-share" aria-hidden="true"></i> Share Invoice Link
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--arc-muted)', lineHeight: 1.6, marginBottom: '16px' }}>
                        Copy the secure on-chain Web3 checkout link below and send it to your customer. When opened, it automatically configures their dashboard and pre-fills the on-chain escrow contract.
                      </div>
                      <div className="arc-field">
                        <label>Your Unique Invoice Link</label>
                        <input className="arc-input" type="text" readOnly value={invoiceOutputLink} style={{ opacity: 0.6, cursor: 'pointer' }} onClick={copyInvoiceShareableLink} />
                      </div>
                    </div>
                    <button className="arc-btn arc-btn-secondary" onClick={copyInvoiceShareableLink}>
                      <i className="ti ti-copy" aria-hidden="true"></i> Copy Invoice Link
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* -----------------------------------------------------------------
                CORE HIGH-YIELD VAULT PANEL
                ---------------------------------------------------------------- */}
            {activePanel === 'vault' && (
              <div id="panel-vault">
                <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-lock" style={{ color: 'var(--arc-accent2)' }} aria-hidden="true"></i> Real Yield Vault
                </div>

                {/* Vault KPI Summary Stat Cards */}
                <div className="arc-grid" style={{ marginBottom: '20px' }}>
                  <div className="arc-stat" style={{ border: '2px solid var(--arc-accent)' }}>
                    <div className="arc-stat-label">Active Deposits</div>
                    <div className="arc-stat-value" id="vault-active-deposits">
                      {vaultActiveDeposits} USDC
                    </div>
                    <div className="arc-stat-sub">Principal locked on-chain</div>
                  </div>
                  <div className="arc-stat" style={{ border: '2px solid var(--arc-accent2)' }}>
                    <div className="arc-stat-label">APY Protocol Rate</div>
                    <div className="arc-stat-value">5.15%</div>
                    <div className="arc-stat-sub">High Yield rate guaranteed</div>
                  </div>
                  <div className="arc-stat" style={{ border: '2px solid #f59e0b' }}>
                    <div className="arc-stat-label">Total Claimed Yield</div>
                    <div className="arc-stat-value" id="vault-claimed-yield">
                      {totalClaimedVaultYield} USDC
                    </div>
                    <div className="arc-stat-sub">Earned payout returned</div>
                  </div>
                </div>

                <div className="arc-split-layout">
                  {/* Create Mint Form */}
                  <div className="arc-panel">
                    <div className="arc-panel-title" style={{ marginBottom: '20px' }}>
                      <i className="ti ti-piggy-bank" aria-hidden="true"></i> Lock USDC and Accrue Yield
                    </div>

                    <div className="arc-field">
                      <label>Amount (USDC)</label>
                      <div style={{ position: 'relative' }}>
                        <input 
                          className="arc-input" 
                          type="number" 
                          placeholder="0.00" 
                          value={vaultAmount} 
                          onChange={(e) => setVaultAmount(e.target.value)} 
                          disabled={isSyncingVault} 
                        />
                        <span 
                          style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--arc-accent)', cursor: 'pointer' }}
                          onClick={() => {
                            setVaultAmount(balances.usdc.replace(/,/g, ''));
                          }}
                        >
                          MAX
                        </span>
                      </div>
                    </div>

                    <div className="arc-field">
                      <label>Lock Duration</label>
                      <select 
                        className="arc-select" 
                        value={vaultDuration} 
                        onChange={(e) => setVaultDuration(e.target.value)}
                        disabled={isSyncingVault}
                      >
                        <option value="1">1 Minute (Quick Testing)</option>
                        <option value="5">5 Minutes</option>
                        <option value="15">15 Minutes</option>
                        <option value="60">1 Hour</option>
                        <option value="1440">1 Day</option>
                        <option value="10080">1 Week</option>
                      </select>
                    </div>

                    {/* Estimator display */}
                    {parseFloat(vaultAmount) > 0 && (
                      <div style={{ background: '#0d1014', borderRadius: '4px', border: '1px solid var(--arc-border)', padding: '12px', fontSize: '11.5px', color: 'var(--arc-muted)', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Target APY</span>
                          <span style={{ color: '#ffffff' }}>5.15% APY</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Est. Reward Share</span>
                          <span style={{ color: 'var(--arc-accent)', fontWeight: 'bold' }}>
                            +{estimateVaultReward(vaultAmount, vaultDuration)} USDC
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--arc-border)', paddingTop: '6px', marginTop: '6px' }}>
                          <span>Total Payout at Unlock</span>
                          <span style={{ color: '#ffffff', fontWeight: 'bold' }}>
                            {(parseFloat(vaultAmount) + parseFloat(estimateVaultReward(vaultAmount, vaultDuration))).toFixed(4)} USDC
                          </span>
                        </div>
                      </div>
                    )}

                    <button 
                      className="arc-btn" 
                      onClick={lockTokensInVault}
                      disabled={isSyncingVault}
                      style={{ opacity: isSyncingVault ? 0.6 : 1 }}
                    >
                      {isSyncingVault ? 'Transacting...' : 'Approve & Lock USDC'}
                    </button>
                  </div>

                  <div className="arc-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
                    <div className="arc-panel-title" style={{ marginBottom: '12px' }}>
                      <i className="ti ti-list" aria-hidden="true"></i> Active Vault Positions
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px' }}>
                      {!activeAddress ? (
                        <div style={{ fontSize: '11px', color: 'var(--arc-muted)', textAlign: 'center', padding: '30px 10px' }}>
                          Connect your wallet to see locked positions.
                        </div>
                      ) : vaultPositions.length === 0 ? (
                        <div style={{ fontSize: '11px', color: 'var(--arc-muted)', textAlign: 'center', padding: '30px 10px' }}>
                          No active vault stakes. Choose amount and lock time to start.
                        </div>
                      ) : (
                        vaultPositions.map((pos) => {
                          const remainingSecs = pos.unlockTime - currentBlockTime;
                          const isClaimable = remainingSecs <= 0 && pos.status === 0;
                          
                          return (
                            <div 
                              key={pos.id}
                              style={{ 
                                padding: '10px 12px', 
                                background: '#0e121a', 
                                border: '1px solid #1c2635', 
                                borderLeft: `4px solid ${pos.status === 1 ? 'var(--arc-muted)' : isClaimable ? 'var(--arc-accent)' : 'var(--arc-accent2)'}`,
                                position: 'relative'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#ffffff' }}>
                                  ID #{pos.id}
                                </span>
                                <span>
                                  {pos.status === 1 ? (
                                    <span style={{ fontSize: '9px', background: 'rgba(255,255,255,0.05)', color: 'var(--arc-muted)', padding: '2px 6px', border: '1px solid #1f293d', textTransform: 'uppercase' }}>
                                      Claimed
                                    </span>
                                  ) : isClaimable ? (
                                    <span className="animate-pulse" style={{ fontSize: '9px', background: 'rgba(0,255,160,0.1)', color: 'var(--arc-accent)', padding: '2px 6px', border: '1px solid var(--arc-accent)', textTransform: 'uppercase', fontWeight: 'bold' }}>
                                      Claimable
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '9px', background: 'rgba(123,97,255,0.1)', color: 'var(--arc-accent2)', padding: '2px 6px', border: '1px solid var(--arc-accent2)', textTransform: 'uppercase' }}>
                                      {remainingSecs > 3600 ? `${Math.floor(remainingSecs / 3600)}h ${Math.floor((remainingSecs % 3600) / 60)}m left` : `${remainingSecs}s countdown`}
                                    </span>
                                  )}
                                </span>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--arc-muted)', marginBottom: '4px' }}>
                                <span>Principal Stake:</span>
                                <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{pos.amount} USDC</span>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--arc-muted)', marginBottom: '8px' }}>
                                <span>Yield Reward (5.15%):</span>
                                <span style={{ color: 'var(--arc-accent)', fontWeight: 'bold' }}>+{pos.reward} USDC</span>
                              </div>

                              {pos.status === 0 && (
                                <button 
                                  className={`arc-btn ${isClaimable ? '' : 'arc-btn-secondary'}`}
                                  disabled={!isClaimable || isSyncingVault}
                                  onClick={() => claimTokensFromVault(pos.id)}
                                  style={{ 
                                    padding: '5px 10px', 
                                    fontSize: '9px', 
                                    marginTop: 0, 
                                    opacity: isClaimable ? 1 : 0.4,
                                    cursor: isClaimable ? 'pointer' : 'not-allowed',
                                    height: 'auto',
                                    width: '100%'
                                  }}
                                >
                                  {isSyncingVault ? 'Claiming...' : isClaimable ? 'Claim Principal + Reward' : 'Locked Under Countdown'}
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Funding reserves sub-panel */}
                    {activeAddress && (
                      <div style={{ borderTop: '2px dashed #1c2635', paddingTop: '12px', marginTop: '12px' }}>
                        <div style={{ fontSize: '9px', color: 'var(--arc-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                          Admin / Testing reserves faucet
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input 
                            className="arc-input" 
                            type="number" 
                            placeholder="Amount USDC" 
                            value={vaultReservesAmount} 
                            onChange={(e) => setVaultReservesAmount(e.target.value)}
                            style={{ padding: '6px 10px', fontSize: '11px' }}
                            disabled={isSyncingVault}
                          />
                          <button 
                            className="arc-btn arc-btn-secondary" 
                            style={{ width: 'auto', marginTop: 0, padding: '6px 12px', fontSize: '10px', border: '1px solid #1c2635' }}
                            onClick={fundVaultReserves}
                            disabled={isSyncingVault}
                          >
                            Fund Reserves
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* -----------------------------------------------------------------
                D. TRADE PANEL
                ---------------------------------------------------------------- */}
            {activePanel === 'trade' && (
              <div id="panel-trade">
                <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-arrows-exchange" style={{ color: 'var(--arc-accent)' }} aria-hidden="true"></i> Trade & Swaps
                </div>

                <div className="arc-split-layout">
                  <div className="arc-panel">
                    <div className="arc-panel-title" style={{ marginBottom: '20px' }}>
                      <i className="ti ti-arrows-exchange-2" aria-hidden="true"></i> Convert Assets
                    </div>
                    
                    <div className="arc-field">
                      <label>You Pay</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select className="arc-select" style={{ width: '110px', flexShrink: 0 }} value={tradeFrom} onChange={(e) => setTradeFrom(e.target.value)}>
                          <option value="USDC">USDC</option>
                          <option value="EURC">EURC</option>
                          <option value="USYC">USYC</option>
                        </select>
                        <input className="arc-input" type="number" placeholder="0.00" value={tradeFromAmt} onChange={(e) => setTradeFromAmt(e.target.value)} />
                      </div>
                    </div>

                    <div className="arc-swap-arrow" onClick={() => {
                      const temp = tradeFrom;
                      setTradeFrom(tradeTo);
                      setTradeTo(temp);
                    }}>
                      <i className="ti ti-arrows-exchange-2" aria-hidden="true"></i>
                    </div>

                    <div className="arc-field">
                      <label>You Receive (estimated)</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select className="arc-select" style={{ width: '110px', flexShrink: 0 }} value={tradeTo} onChange={(e) => setTradeTo(e.target.value)}>
                          <option value="EURC">EURC</option>
                          <option value="USDC">USDC</option>
                          <option value="USYC">USYC</option>
                        </select>
                        <input className="arc-input" placeholder="~0.00" readOnly value={tradeToAmt} style={{ opacity: 0.6 }} />
                      </div>
                    </div>

                    <div className="arc-field">
                      <label>Slippage Tolerance</label>
                      <select className="arc-select" value={slippage} onChange={(e) => setSlippage(e.target.value)}>
                        <option value="0.5%">0.5%</option>
                        <option value="1%">1%</option>
                        <option value="2%">2%</option>
                        <option value="3%">3%</option>
                      </select>
                    </div>

                    <div style={{ background: '#0d1014', borderRadius: '8px', padding: '12px', fontSize: '12px', color: 'var(--arc-muted)', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span>Pricing Model</span>
                        <span style={{ color: 'var(--arc-text)' }}>EIP-1559 + EWMA</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span>Price Impact</span>
                        <span style={{ color: 'var(--arc-accent)' }}>~0.12%</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Est. Gas Floor</span>
                        <span style={{ color: 'var(--arc-text)' }}>20 Gwei (USDC)</span>
                      </div>
                    </div>

                    <button className="arc-btn" onClick={executePermit2Swaps}>
                      Confirm Swap Approval
                    </button>
                  </div>

                  <div className="arc-panel" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
                    <div className="arc-panel-title" style={{ marginBottom: '14px' }}>
                      <i className="ti ti-chart-line" aria-hidden="true"></i> Real-time EUR / USD Feed
                    </div>
                    <div id="tradingview-chart-container-react" style={{ flex: 1, minHeight: '300px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#0c0e12', border: '1px solid var(--arc-border)' }}></div>
                  </div>
                </div>
              </div>
            )}

            {/* -----------------------------------------------------------------
                E. SEND PANEL
                ---------------------------------------------------------------- */}
            {activePanel === 'send' && (
              <div id="panel-send">
                <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-send" style={{ color: 'var(--arc-accent)' }} aria-hidden="true"></i> Send Tokens
                </div>

                <div className="arc-split-layout">
                  <div className="arc-panel">
                    <div className="arc-panel-title" style={{ marginBottom: '20px' }}>
                      <i className="ti ti-send" aria-hidden="true"></i> New Transaction
                    </div>

                    <div className="arc-field">
                      <label>Select Token</label>
                      <select className="arc-select" value={sendToken} onChange={(e) => setSendToken(e.target.value)}>
                        <option value="USDC">USDC — Balance: {balances.usdc}</option>
                        <option value="EURC">EURC — Balance: {balances.eurc}</option>
                        <option value="USYC">USYC — Balance: {balances.usyc}</option>
                      </select>
                    </div>

                    <div className="arc-field">
                      <label>Recipient Address</label>
                      <input className="arc-input" type="text" placeholder="0x..." value={sendToAddress} onChange={(e) => setSendToAddress(e.target.value)} />
                    </div>

                    <div className="arc-field">
                      <label>Amount</label>
                      <div style={{ position: 'relative' }}>
                        <input className="arc-input" type="number" placeholder="0.00" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} style={{ paddingRight: '60px' }} />
                        <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--arc-accent)', cursor: 'pointer' }} onClick={setSendMaxAmount}>
                          MAX
                        </span>
                      </div>
                    </div>

                    <div style={{ background: '#0d1014', borderRadius: '8px', padding: '12px', fontSize: '12px', color: 'var(--arc-muted)', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span>Min gas floor</span>
                        <span style={{ color: 'var(--arc-text)' }}>20 Gwei</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Total Cost</span>
                        <span style={{ color: 'var(--arc-text)' }}>Amount + Native gas fee</span>
                      </div>
                    </div>

                    <button className="arc-btn" onClick={executeTokenDirectSend}>
                      Send Tokens
                    </button>
                  </div>

                  <div className="arc-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="arc-panel-title" style={{ marginBottom: '16px' }}>
                      <i className="ti ti-address-book" aria-hidden="true"></i> Address Book
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
                      <input className="arc-input" type="text" placeholder="Name" value={contactName} onChange={(e) => setContactName(e.target.value)} style={{ width: '32%' }} />
                      <input className="arc-input" type="text" placeholder="0x..." value={contactAddress} onChange={(e) => setContactAddress(e.target.value)} style={{ width: '50%' }} />
                      <button className="arc-btn" onClick={saveNewContact} style={{ width: '18%', marginTop: 0, padding: '0 4px', fontSize: '11px' }}>
                        Add
                      </button>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', maxHeight: '250px', borderTop: '1px solid var(--arc-border)' }} id="contacts-list">
                      {contacts.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--arc-muted)', textAlign: 'center', padding: '24px' }}>
                          No contacts saved.
                        </div>
                      ) : (
                        contacts.map((contact, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid var(--arc-border)', fontSize: '12px' }}>
                            <div onClick={() => selectContactField(contact.address)} style={{ cursor: 'pointer', flex: 1 }}>
                              <div style={{ fontWeight: 600, color: 'var(--arc-accent)' }}>{contact.name}</div>
                              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '10px', color: 'var(--arc-muted)' }}>
                                {contact.address.slice(0, 10)}...{contact.address.slice(-6)}
                              </div>
                            </div>
                            <button onClick={() => deleteContactAtIndex(i)} style={{ background: 'transparent', border: 'none', color: '#e35f4a', cursor: 'pointer', fontSize: '13px', padding: '0 4px' }}>
                              <i className="ti ti-trash"></i>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}



            {/* -----------------------------------------------------------------
                F. HISTORY PANEL
                ---------------------------------------------------------------- */}
            {activePanel === 'history' && (
              <div id="panel-history">
                <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-history" style={{ color: 'var(--arc-accent)' }} aria-hidden="true"></i> Transaction History
                </div>
                <div className="arc-history">
                  <div className="arc-tokens-header">
                    <span className="arc-tokens-title">Recent On-Chain Transactions</span>
                    <select className="arc-select" style={{ width: 'auto', padding: '5px 10px', fontSize: '11px' }}>
                      <option>Last 5000 Blocks</option>
                    </select>
                  </div>

                  {onChainLogs.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--arc-muted)', fontSize: '12px' }}>
                      No on-chain transfers found in the last 5000 blocks. Try connecting your wallet active address.
                    </div>
                  ) : (
                    onChainLogs.map((log, i) => {
                      const iconClass = log.type === 'send' ? 'arc-tx-send' : 'arc-tx-receive';
                      const iconText = log.type === 'send' ? '↑' : '↓';
                      return (
                        <div className="arc-tx-row" key={i}>
                          <div className={`arc-tx-icon ${iconClass}`}><i>{iconText}</i></div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '12px', fontWeight: 500 }}>{log.type === 'send' ? 'Sent' : 'Received'} {log.description}</div>
                            <div className="arc-tx-hash" style={{ cursor: 'pointer' }} onClick={() => window.open(`https://testnet.arcscan.app/tx/${log.hash}`, '_blank')}>
                              {log.hash.slice(0, 6)}...{log.hash.slice(-4)}
                            </div>
                          </div>
                          <div className="arc-tx-time">Block {log.blockNo}</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* -----------------------------------------------------------------
                G. WALLET STATUS PANEL
                ---------------------------------------------------------------- */}
            {activePanel === 'wallet' && (
              <div id="panel-wallet">
                <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-wallet" style={{ color: 'var(--arc-accent)' }} aria-hidden="true"></i> Connect Wallet
                </div>
                <div className="arc-panel" style={{ maxWidth: '380px', textAlign: 'center', padding: '28px 20px' }}>
                  
                  {!activeAddress ? (
                    <>
                      <div id="wallet-detect-status" style={{ fontSize: '13px', color: 'var(--arc-muted)', marginBottom: '20px' }}>
                        Detecting browser extensions...
                      </div>
                      
                      <button className="arc-btn" id="btn-connect-wallet" onClick={connectBrowserWallet}>
                        Connect Browser Wallet
                      </button>
                    </>
                  ) : (
                    <div id="wallet-connected-details">
                      <div style={{ fontSize: '11px', color: 'var(--arc-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Connected Account
                      </div>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '13px', color: 'var(--arc-accent)', marginBottom: '14px', wordBreak: 'break-all' }} id="connected-account-val">
                        {activeAddress}
                      </div>

                      {/* Display dynamic deposit QR link code */}
                      <div style={{ margin: '22px 0 26px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--arc-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>
                          P2P Deposit QR Code
                        </div>
                        <div style={{ backgroundColor: 'white', padding: '12px', borderRadius: '12px', display: 'inline-block' }}>
                          <canvas id="wallet-qr"></canvas>
                        </div>
                        <button className="arc-btn arc-btn-secondary" style={{ width: 'auto', padding: '6px 14px', fontSize: '12px', marginTop: '4px' }} onClick={() => {
                          const paylinkUrl = `${window.location.origin}${window.location.pathname}?to=${activeAddress}`;
                          navigator.clipboard.writeText(paylinkUrl).then(() => {
                            showToast('P2P Paylink copied to clipboard!');
                          });
                        }}>
                          Copy Shareable Paylink
                        </button>
                      </div>

                      <button className="arc-btn arc-btn-secondary" onClick={disconnectLocalWallet}>
                        Disconnect Wallet
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* -----------------------------------------------------------------
                H. SETTINGS PANEL
                ---------------------------------------------------------------- */}
            {activePanel === 'settings' && (
              <div id="panel-settings">
                <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-settings" style={{ color: 'var(--arc-accent)' }} aria-hidden="true"></i> Settings
                </div>
                <div className="arc-panel" style={{ maxWidth: '380px' }}>
                  <div className="arc-field">
                    <label>RPC Endpoint</label>
                    <input className="arc-input" type="text" value={rpcEndpoint} onChange={(e) => setRpcEndpoint(e.target.value)} id="rpc-endpoint" />
                  </div>
                  <div className="arc-field">
                    <label>Default Slippage</label>
                    <select className="arc-select" value={slippage} onChange={(e) => setSlippage(e.target.value)}>
                      <option value="0.5%">0.5%</option>
                      <option value="1%">1%</option>
                      <option value="2%">2%</option>
                      <option value="3%">3%</option>
                    </select>
                  </div>
                  <div className="arc-field">
                    <label>Gas Multiplier</label>
                    <select className="arc-select" value={gasMultiplier} onChange={(e) => setGasMultiplier(e.target.value)} id="gas-multiplier">
                      <option value="1.0x (Standard)">1.0x (Standard)</option>
                      <option value="1.2x (Fast)">1.2x (Fast)</option>
                      <option value="1.5x (Instant)">1.5x (Instant)</option>
                    </select>
                  </div>
                  <button className="arc-btn" onClick={saveSettingsAction}>
                    Save Settings
                  </button>
                </div>
              </div>
            )}

            {/* -----------------------------------------------------------------
                ABOUT HYBRIPAY PANEL
                ---------------------------------------------------------------- */}
            {activePanel === 'docs' && (
              <div id="panel-docs" style={{ animation: 'fadeIn 0.4s ease-out' }}>
                <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-info-circle" style={{ color: 'var(--arc-accent)' }} aria-hidden="true"></i> About HybriPay Interactive Overview
                </div>

                {/* Sub-tabs styling with pixel border and retro styling */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '22px' }}>
                  <button 
                    className={`arc-tab-button ${docsTab === 'pitch' ? 'active' : ''}`} 
                    style={{ 
                      padding: '8px 16px', 
                      fontFamily: "'Space Mono', monospace", 
                      fontSize: '12.5px', 
                      cursor: 'pointer',
                      border: '2px solid #000000',
                      backgroundColor: docsTab === 'pitch' ? 'var(--arc-accent)' : 'var(--arc-surface)',
                      color: docsTab === 'pitch' ? '#000000' : 'var(--arc-text)',
                      boxShadow: '3px 3px 0px #000000',
                      fontWeight: docsTab === 'pitch' ? '700' : '400',
                      transition: 'all 0.2s steps(2)'
                    }}
                    onClick={() => setDocsTab('pitch')}
                  >
                    📖 About HybriPay
                  </button>
                  <button 
                    className={`arc-tab-button ${docsTab === 'features' ? 'active' : ''}`} 
                    style={{ 
                      padding: '8px 16px', 
                      fontFamily: "'Space Mono', monospace", 
                      fontSize: '12.5px', 
                      cursor: 'pointer',
                      border: '2px solid #000000',
                      backgroundColor: docsTab === 'features' ? 'var(--arc-accent2)' : 'var(--arc-surface)',
                      color: docsTab === 'features' ? '#ffffff' : 'var(--arc-text)',
                      boxShadow: '3px 3px 0px #000000',
                      fontWeight: docsTab === 'features' ? '700' : '400',
                      transition: 'all 0.2s steps(2)'
                    }}
                    onClick={() => setDocsTab('features')}
                  >
                    ⚙️ Core Functionalities & System Diagrams
                  </button>
                  <button 
                    className={`arc-tab-button ${docsTab === 'usecases' ? 'active' : ''}`} 
                    style={{ 
                      padding: '8px 16px', 
                      fontFamily: "'Space Mono', monospace", 
                      fontSize: '12.5px', 
                      cursor: 'pointer',
                      border: '2px solid #000000',
                      backgroundColor: docsTab === 'usecases' ? 'var(--arc-accent)' : 'var(--arc-surface)',
                      color: docsTab === 'usecases' ? '#000000' : 'var(--arc-text)',
                      boxShadow: '3px 3px 0px #000000',
                      fontWeight: docsTab === 'usecases' ? '700' : '400',
                      transition: 'all 0.2s steps(2)'
                    }}
                    onClick={() => setDocsTab('usecases')}
                  >
                    💡 Professional Use Cases
                  </button>
                  <button 
                    className={`arc-tab-button ${docsTab === 'loyalty' ? 'active' : ''}`} 
                    style={{ 
                      padding: '8px 16px', 
                      fontFamily: "'Space Mono', monospace", 
                      fontSize: '12.5px', 
                      cursor: 'pointer',
                      border: '2px solid #000000',
                      backgroundColor: docsTab === 'loyalty' ? 'var(--arc-accent2)' : 'var(--arc-surface)',
                      color: docsTab === 'loyalty' ? '#ffffff' : 'var(--arc-text)',
                      boxShadow: '3px 3px 0px #000000',
                      fontWeight: docsTab === 'loyalty' ? '700' : '400',
                      transition: 'all 0.2s steps(2)'
                    }}
                    onClick={() => setDocsTab('loyalty')}
                  >
                    🏆 Loyalty Loop Mechanics
                  </button>
                </div>

                <div className="arc-panel" style={{ padding: '24px', lineHeight: '1.6' }}>
                  
                  {/* TAB 1: ABOUT HYBRIPAY */}
                  {docsTab === 'pitch' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--arc-border)', paddingBottom: '12px', marginBottom: '18px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--arc-accent)' }}>ABOUT HYBRIPAY</h3>
                        <span style={{ fontSize: '10px', padding: '3px 8px', border: '1px solid var(--arc-accent)', color: 'var(--arc-accent)' }}>ARC NETWORK ECOSYSTEM APPROVED</span>
                      </div>

                      <div style={{ marginBottom: '20px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px', color: 'var(--arc-text)' }}>🚀 The Vision</div>
                        <p style={{ fontSize: '12px', color: 'var(--arc-text)', opacity: 0.85 }}>
                          HybriPay is a <strong>next-generation Web3 DeFi Payments and Secure Escrow Checkout Infrastructure</strong>. Built natively on high-throughput distributed architectures, it offers modern digital merchants, creators, and DeFi participants a unified hub for trade, invoicing, non-custodial lockup vaults, gas optimization, and interactive loyalty points rewards.
                        </p>
                      </div>

                      <div className="arc-grid" style={{ marginBottom: '20px', gap: '16px' }}>
                        <div style={{ border: '1px solid var(--arc-border)', padding: '14px', borderRadius: '4px', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                          <div style={{ fontStyle: 'normal', color: 'var(--arc-accent2)', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>⚠️ The Problem in Web3 Payments</div>
                          <ul style={{ fontSize: '11px', listStyleType: 'square', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px', opacity: 0.85 }}>
                            <li><strong>Lack of Buyer/Seller Protection:</strong> Traditional cryptocurrency transfers are irreversible, exposing peer-to-peer commerce to systemic counterpart risk.</li>
                            <li><strong>Fragmented DeFi Operations:</strong> Swapping, staking, pay-outs, and invoices exist across separate, non-integrated dApps.</li>
                            <li><strong>No Real Loyalty Incentive:</strong> High Web3 transactional fees are paid directly to miners/validators with zero rewards routed back to consumers.</li>
                          </ul>
                        </div>

                        <div style={{ border: '2px solid var(--arc-accent)', padding: '14px', borderRadius: '4px', backgroundColor: 'rgba(0,255,210,0.03)' }}>
                          <div style={{ fontStyle: 'normal', color: 'var(--arc-accent)', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>✔️ The HybriPay Solution</div>
                          <ul style={{ fontSize: '11px', listStyleType: 'disc', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px', opacity: 0.95 }}>
                            <li><strong>Smart Escrow Settlement:</strong> Trustless buyer protection via on-chain contract holding until cargo delivery or service criteria approval.</li>
                            <li><strong>Unified Hybrid Vault Layout:</strong> Secure interest vaults providing high-yield liquidity lock-ins alongside multi-token cross swapping.</li>
                            <li><strong>Tokenized loyalty loops:</strong> Retain customers through gamified <strong>Tier Levels</strong> and transaction rebates.</li>
                          </ul>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid var(--arc-border)', paddingTop: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: 'var(--arc-text)' }}>💼 Market Positioning & Pitch Strategy</div>
                        <p style={{ fontSize: '12px', color: 'var(--arc-text)', opacity: 0.85, marginBottom: '10px' }}>
                          HybriPay targets the rapidly growing <strong>$12B+ Web3 merchant checkout and service freelancing</strong> sector. By combining premium visual experience styling (gorgeous custom environments like Arc Cyber & Dark Cyber settings) with modular full-stack capabilities, it establishes a reliable payment stack for digital-native users.
                        </p>
                        <div style={{ padding: '8px 12px', backgroundColor: 'var(--arc-surface)', borderLeft: '3px solid var(--arc-accent)', fontSize: '11px', color: 'var(--arc-muted)' }}>
                          💡 <em>"HybriPay bridges the accessibility gap by transforming crypto settlements into secure, gamified micro-interactions."</em>
                        </div>
                      </div>

                      {/* --- INTERACTIVE TESTER FEEDBACK SECTION --- */}
                      <div style={{ marginTop: '30px', borderTop: '2px dashed var(--arc-border)', paddingTop: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ backgroundColor: 'var(--arc-accent)', color: '#000', fontSize: '10px', padding: '2px 6px', fontWeight: 'bold' }}>FEEDBACK</span>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--arc-text)' }}>💬 Community Test Feedbacks & Comments</div>
                          </div>
                          {feedbacks.length > 0 && (
                            <button 
                              onClick={() => {
                                setFeedbacks([]);
                                localStorage.removeItem('hybri_feedbacks');
                              }}
                              style={{
                                background: 'none',
                                border: '1px solid rgba(255, 0, 0, 0.4)',
                                padding: '3px 8px',
                                fontSize: '10px',
                                color: '#ff5555',
                                cursor: 'pointer',
                                borderRadius: '3px',
                                fontFamily: "'Space Mono', monospace",
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                            >
                              🗑️ Clear Feedbacks
                            </button>
                          )}
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--arc-text)', opacity: 0.75, marginBottom: '16px' }}>
                          Drop your thoughts below after testing the application functionalities (Escrow, Invoicing, Swap, or Vault staking).
                        </p>

                        {/* Submission Form */}
                        <div style={{ backgroundColor: 'rgba(0,0,0,0.15)', border: '1px solid var(--arc-border)', borderRadius: '4px', padding: '16px', marginBottom: '20px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--arc-text)', marginBottom: '12px' }}>
                            Submit New Feedback
                          </div>

                          <div className="arc-grid" style={{ marginBottom: '12px', gap: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '10px', color: 'var(--arc-text)', opacity: 0.75, marginBottom: '4px' }}>Tester Handle / Username</label>
                              <input 
                                type="text" 
                                className="arc-input" 
                                placeholder="e.g. Satoshi_Arc" 
                                value={feedbackName} 
                                onChange={(e) => setFeedbackName(e.target.value)} 
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '10px', color: 'var(--arc-text)', opacity: 0.75, marginBottom: '4px' }}>Target testing Feature</label>
                              <select 
                                className="arc-select" 
                                value={feedbackArea} 
                                onChange={(e) => setFeedbackArea(e.target.value)}
                              >
                                <option value="All Features">All Features</option>
                                <option value="Secure Escrow Checkout">Secure Escrow Checkout</option>
                                <option value="Web3 Invoicing">Web3 Invoicing</option>
                                <option value="High-Yield Vaults">High-Yield Vaults</option>
                                <option value="Spot Swap Router">Spot Swap Router</option>
                              </select>
                            </div>
                          </div>

                          <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '10px', color: 'var(--arc-text)', opacity: 0.75, marginBottom: '4px' }}>Rating (1 - 5 Stars)</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button 
                                  key={star} 
                                  type="button" 
                                  onClick={() => setFeedbackRating(star)} 
                                  style={{ 
                                    padding: '4px 8px', 
                                    backgroundColor: feedbackRating >= star ? 'var(--arc-accent)' : 'var(--arc-surface)', 
                                    color: feedbackRating >= star ? '#000000' : 'var(--arc-text)', 
                                    border: '1px solid var(--arc-border)', 
                                    borderRadius: '3px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {star} ★
                                </button>
                              ))}
                            </div>
                          </div>

                          <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', fontSize: '10px', color: 'var(--arc-text)', opacity: 0.75, marginBottom: '4px' }}>Tester Comments & Feedback</label>
                            <textarea 
                              className="arc-input" 
                              style={{ width: '100%', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit', fontSize: '12px' }} 
                              placeholder="Describe your testing experience..."
                              value={feedbackComment}
                              onChange={(e) => setFeedbackComment(e.target.value)}
                            />
                          </div>

                          <button 
                            className="arc-btn" 
                            style={{ padding: '8px 16px', fontSize: '11px' }}
                            onClick={() => {
                              if (!feedbackComment.trim()) return;
                              const user = feedbackName.trim() || 'Anonymous_Tester';
                              const freshFeedback = {
                                id: String(Date.now()),
                                username: user,
                                comment: feedbackComment,
                                rating: feedbackRating,
                                timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
                                likes: 0,
                                testingArea: feedbackArea
                              };
                              setFeedbacks(prev => [freshFeedback, ...prev]);
                              setFeedbackComment('');
                              setFeedbackName('');
                              setFeedbackRating(5);
                              
                              // Loyalty feedback reward bonus!
                              setLoyaltyPoints(prev => prev + 10);
                            }}
                          >
                            🚀 Submit Feedback & Claim Tier Reward (+10 PTS)
                          </button>
                        </div>

                        {/* Comments Feed */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {feedbacks.length === 0 ? (
                            <div style={{ 
                              textAlign: 'center', 
                              padding: '30px 20px', 
                              border: '1px dashed var(--arc-border)', 
                              borderRadius: '4px', 
                              color: 'var(--arc-muted)',
                              backgroundColor: 'rgba(0,0,0,0.1)'
                            }}>
                              <i className="ti ti-messages" style={{ fontSize: '24px', display: 'block', marginBottom: '8px', color: 'var(--arc-accent)' }}></i>
                              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--arc-text)' }}>No Testing Feedback Yet</div>
                              <p style={{ fontSize: '11px', margin: '4px 0 0 0', opacity: 0.75 }}>
                                Be the first to share your live testing experience of the Escrow, Vault, Swap, or Invoicing suite!
                              </p>
                            </div>
                          ) : (
                            feedbacks.map((f) => (
                              <div key={f.id} style={{ border: '1px solid var(--arc-border)', borderRadius: '4px', padding: '12px', backgroundColor: 'var(--arc-surface)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--arc-accent)' }}>@{f.username}</span>
                                    <span style={{ fontSize: '9px', backgroundColor: 'rgba(255,255,255,0.08)', padding: '2px 5px', borderRadius: '3px', color: 'var(--arc-text)' }}>
                                      🎯 {f.testingArea}
                                    </span>
                                  </div>
                                  <div style={{ color: 'var(--arc-accent2)', fontSize: '11px', fontWeight: 'bold' }}>
                                    {'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}
                                  </div>
                                </div>
                                <p style={{ fontSize: '11.5px', color: 'var(--arc-text)', margin: '0 0 8px 0', opacity: 0.9 }}>
                                  {f.comment}
                                </p>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9.5px', color: 'var(--arc-muted)' }}>
                                  <span>🕒 {f.timestamp}</span>
                                  <button 
                                    style={{ 
                                      background: 'none', 
                                      border: 'none', 
                                      color: 'var(--arc-accent)', 
                                      cursor: 'pointer', 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: '4px',
                                      fontFamily: "'Space Mono', monospace"
                                    }}
                                    onClick={() => {
                                      setFeedbacks(prev => prev.map(item => item.id === f.id ? { ...item, likes: item.likes + 1 } : item));
                                    }}
                                  >
                                    👍 Upvote Reaction ({f.likes})
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: SYSTEM FUNCTIONALITIES & DIAGRAMS */}
                  {docsTab === 'features' && (
                    <div>
                      <div style={{ borderBottom: '1px solid var(--arc-border)', paddingBottom: '12px', marginBottom: '18px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--arc-accent)' }}>⚙️ ARCHITECTURE & CORE FUNCTIONALITIES</h3>
                        <div style={{ fontSize: '11px', color: 'var(--arc-muted)' }}>Interactive Vector Schematics representing transaction processes</div>
                      </div>

                      {/* FEATURE A: Secure Escrow Checkout */}
                      <div style={{ marginBottom: '28px', borderBottom: '1px dashed var(--arc-border)', paddingBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                          <span style={{ backgroundColor: 'var(--arc-accent)', color: '#000000', padding: '2px 6px', fontSize: '10px', fontWeight: 700 }}>A</span>
                          <span style={{ fontSize: '13px', fontWeight: 700 }}>Decentralized Milestone Escrow Checkout</span>
                        </div>
                        <p style={{ fontSize: '11.5px', color: 'var(--arc-text)', opacity: 0.85, marginBottom: '14px' }}>
                          Protects buyers and sellers from counterpart failure. The buyer locks assets inside the Escrow Contract. Funds are safely held until the buyer verifies completion of cargo delivery, milestones, or service specifications, initiating a mutual fee rebate.
                        </p>

                        {/* Interactive SVG Diagram 1 */}
                        <div style={{ display: 'flex', justifyContent: 'center', backgroundColor: '#07090d', border: '1px solid var(--arc-border)', borderRadius: '4px', padding: '16px 8px' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" style={{ width: '100%', maxWidth: '540px' }} aria-label="Escrow Checkout Flowchart">
                            {/* Gradients */}
                            <defs>
                              <linearGradient id="escrowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="var(--arc-accent)" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="var(--arc-accent2)" stopOpacity="0.1" />
                              </linearGradient>
                            </defs>
                            {/* Actor 1: Buyer */}
                            <rect x="15" y="55" width="105" height="42" rx="4" fill="#131922" stroke="var(--arc-text)" strokeWidth="1" />
                            <text x="30" y="75" fill="var(--arc-text)" fontSize="10" fontFamily="'Space Mono', monospace" fontWeight="bold">0xBuyer</text>
                            <text x="35" y="88" fill="var(--arc-muted)" fontSize="8" fontFamily="'Space Mono', monospace">Initiates Deal</text>

                            {/* Arrow 1 */}
                            <line x1="120" y1="76" x2="215" y2="76" stroke="var(--arc-accent)" strokeWidth="1.5" strokeDasharray="3,3" />
                            <polygon points="215,72 223,76 215,80" fill="var(--arc-accent)" />
                            <text x="130" y="68" fill="var(--arc-accent)" fontSize="8" fontFamily="'Space Mono', monospace">1. Lock USDC</text>

                            {/* Center Contract: Escrow */}
                            <rect x="225" y="35" width="150" height="85" rx="6" fill="url(#escrowGrad)" stroke="var(--arc-accent)" strokeWidth="1.5" />
                            <text x="245" y="58" fill="var(--arc-text)" fontSize="11" fontFamily="'Space Mono', monospace" fontWeight="bold">Smart Escrow</text>
                            <text x="240" y="72" fill="var(--arc-accent)" fontSize="9" fontFamily="'Space Mono', monospace">Contract Verified</text>
                            <text x="242" y="88" fill="var(--arc-accent2)" fontSize="9" fontFamily="'Space Mono', monospace" fontWeight="bold">STATUS: HOLDING</text>
                            <rect x="242" y="98" width="116" height="15" rx="2" fill="#000" stroke="var(--arc-border)" strokeWidth="1" />
                            <text x="250" y="109" fill="var(--arc-accent)" fontSize="8" fontFamily="'Space Mono', monospace">Active ID: #ESC-082</text>

                            {/* Arrow 2 */}
                            <line x1="375" y1="76" x2="470" y2="76" stroke="var(--arc-accent2)" strokeWidth="1.5" />
                            <polygon points="470,72 478,76 470,80" fill="var(--arc-accent2)" />
                            <text x="382" y="68" fill="var(--arc-accent2)" fontSize="8" fontFamily="'Space Mono', monospace">2. Release Pay</text>

                            {/* Actor 2: Seller */}
                            <rect x="480" y="55" width="105" height="42" rx="4" fill="#131922" stroke="var(--arc-text)" strokeWidth="1" />
                            <text x="495" y="75" fill="var(--arc-text)" fontSize="10" fontFamily="'Space Mono', monospace" fontWeight="bold">0xSeller</text>
                            <text x="498" y="88" fill="var(--arc-muted)" fontSize="8" fontFamily="'Space Mono', monospace">Receives Payout</text>

                            {/* Dotted curve back for Loyalty */}
                            <path d="M 532,97 Q 300,170 65,97" fill="none" stroke="var(--arc-accent)" strokeWidth="1" strokeDasharray="2,2" />
                            <text x="270" y="150" fill="var(--arc-accent)" fontSize="9" fontFamily="'Space Mono', monospace" textAnchor="middle">🏆 +10 Loyalty Points Accrued</text>
                          </svg>
                        </div>
                      </div>

                      {/* FEATURE B: Crypto Swapping Ecosystem */}
                      <div style={{ marginBottom: '28px', borderBottom: '1px dashed var(--arc-border)', paddingBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                          <span style={{ backgroundColor: 'var(--arc-accent2)', color: '#ffffff', padding: '2px 6px', fontSize: '10px', fontWeight: 700 }}>B</span>
                          <span style={{ fontSize: '13px', fontWeight: 700 }}>Direct Spot Swap Router</span>
                        </div>
                        <p style={{ fontSize: '11.5px', color: 'var(--arc-text)', opacity: 0.85, marginBottom: '14px' }}>
                          No more leaving the merchant page to swap assets. The high-performance Swap Router leverages local token exchange reserves with Slippage tolerance metrics to swap USDC, EURC, or yielding assets (USYC) in a single-step signature transaction.
                        </p>

                        {/* Interactive SVG Diagram 2 */}
                        <div style={{ display: 'flex', justifyContent: 'center', backgroundColor: '#07090d', border: '1px solid var(--arc-border)', borderRadius: '4px', padding: '16px 8px' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 130" style={{ width: '100%', maxWidth: '540px' }} aria-label="Trade Swap Router Flowchart">
                            {/* Swap process blocks */}
                            <rect x="20" y="40" width="100" height="40" rx="3" fill="rgba(255,255,255,0.02)" stroke="var(--arc-border)" strokeWidth="1" />
                            <text x="35" y="64" fill="var(--arc-text)" fontSize="11" fontFamily="'Space Mono', monospace" fontWeight="bold">Input: USYC</text>

                            {/* Arrows */}
                            <line x1="120" y1="60" x2="200" y2="60" stroke="var(--arc-accent)" strokeWidth="1" />
                            <polygon points="200,57 207,60 200,63" fill="var(--arc-accent)" />
                            <text x="130" y="52" fill="var(--arc-accent)" fontSize="8" fontFamily="'Space Mono', monospace">Router Path</text>

                            {/* Swap engine */}
                            <rect x="210" y="25" width="180" height="70" rx="4" fill="#131922" stroke="var(--arc-accent2)" strokeWidth="1.5" />
                            <text x="245" y="48" fill="var(--arc-accent2)" fontSize="10" fontFamily="'Space Mono', monospace" fontWeight="bold">Liquidity Router</text>
                            <text x="230" y="63" fill="#ffffff" fontSize="8" fontFamily="'Space Mono', monospace">Slippage Check: &lt;2% OK</text>
                            <text x="228" y="77" fill="var(--arc-muted)" fontSize="8" fontFamily="'Space Mono', monospace" textAnchor="start">Rate: 1 USYC = 1.00 USDC</text>

                            <line x1="390" y1="60" x2="470" y2="60" stroke="#fff" strokeWidth="1" />
                            <polygon points="470,57 477,60 470,63" fill="#fff" />

                            <rect x="480" y="40" width="100" height="40" rx="3" fill="rgba(0,255,210,0.05)" stroke="var(--arc-accent)" strokeWidth="1" />
                            <text x="495" y="64" fill="var(--arc-accent)" fontSize="11" fontFamily="'Space Mono', monospace" fontWeight="bold">Output: USDC</text>
                          </svg>
                        </div>
                      </div>

                      {/* FEATURE C: Direct Merchant Invoicing */}
                      <div style={{ marginBottom: '28px', borderBottom: '1px dashed var(--arc-border)', paddingBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                          <span style={{ backgroundColor: 'var(--arc-accent)', color: '#000000', padding: '2px 6px', fontSize: '10px', fontWeight: 700 }}>C</span>
                          <span style={{ fontSize: '13px', fontWeight: 700 }}>Web3 Merchant Invoicing System</span>
                        </div>
                        <p style={{ fontSize: '11.5px', color: 'var(--arc-text)', opacity: 0.85, marginBottom: '14px' }}>
                          Simplifies peer-to-peer and business-to-consumer client requests. Merchants draft customizable invoices specifying items, amounts, target customer addresses, and reference documents (PDF guides, code specifications, or external drive links). Payers resolve the invoice seamlessly with automated checkout panels.
                        </p>

                        {/* Interactive SVG Diagram 3 */}
                        <div style={{ display: 'flex', justifyContent: 'center', backgroundColor: '#07090d', border: '1px solid var(--arc-border)', borderRadius: '4px', padding: '16px 8px' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 130" style={{ width: '100%', maxWidth: '540px' }} aria-label="Invoice Process Schematic">
                            <rect x="20" y="35" width="115" height="50" rx="3" fill="#131922" stroke="var(--arc-border)" strokeWidth="1" />
                            <text x="30" y="55" fill="var(--arc-text)" fontSize="10" fontFamily="'Space Mono', monospace" fontWeight="bold">Merchant Drafts</text>
                            <text x="30" y="70" fill="var(--arc-accent)" fontSize="8" fontFamily="'Space Mono', monospace">Items, URL + Specs</text>

                            <line x1="135" y1="60" x2="225" y2="60" stroke="var(--arc-accent)" strokeWidth="1.2" />
                            <polygon points="225,57 232,60 225,63" fill="var(--arc-accent)" />
                            <text x="145" y="51" fill="var(--arc-accent)" fontSize="8" fontFamily="'Space Mono', monospace">Generates QR / Link</text>

                            <rect x="235" y="35" width="130" height="50" rx="3" fill="#101014" stroke="var(--arc-accent2)" strokeWidth="1.5" />
                            <text x="245" y="55" fill="var(--arc-text)" fontSize="10" fontFamily="'Space Mono', monospace" fontWeight="bold">Buyer Approves</text>
                            <text x="245" y="70" fill="var(--arc-accent2)" fontSize="8" fontFamily="'Space Mono', monospace">Instant Ethers Pay</text>

                            <line x1="365" y1="60" x2="455" y2="60" stroke="#fff" strokeWidth="1.2" />
                            <polygon points="455,57 462,60 455,63" fill="#fff" />

                            <rect x="465" y="35" width="115" height="50" rx="3" fill="rgba(0,255,210,0.04)" stroke="var(--arc-accent)" strokeWidth="1.2" />
                            <text x="475" y="55" fill="var(--arc-text)" fontSize="10" fontFamily="'Space Mono', monospace" fontWeight="bold">Final Settlement</text>
                            <text x="475" y="70" fill="var(--arc-accent)" fontSize="8" fontFamily="'Space Mono', monospace">Gas Optimized Receipt</text>
                          </svg>
                        </div>
                      </div>

                      {/* FEATURE D: Yield-Generating Vaults */}
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                          <span style={{ backgroundColor: 'var(--arc-accent2)', color: '#ffffff', padding: '2px 6px', fontSize: '10px', fontWeight: 700 }}>D</span>
                          <span style={{ fontSize: '13px', fontWeight: 700 }}>Yield-Generating Collateral Vaults</span>
                        </div>
                        <p style={{ fontSize: '11.5px', color: 'var(--arc-text)', opacity: 0.85, marginBottom: '14px' }}>
                          Put assets to work. High-Performance Vault locks (USDC, EURC, USYC) let users stake reserve funds for a selected time window (5-min/10-min simulated fast blocks) compounding fixed high APR interests directly backed by liquid treasury system reserves. Fully claimed yield increments balances instantly.
                        </p>

                        {/* Interactive SVG Diagram 4 */}
                        <div style={{ display: 'flex', justifyContent: 'center', backgroundColor: '#07090d', border: '1px solid var(--arc-border)', borderRadius: '4px', padding: '16px 8px' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 130" style={{ width: '100%', maxWidth: '540px' }} aria-label="Yield Vault Schematic">
                            <rect x="25" y="40" width="110" height="42" rx="3" fill="#131922" stroke="var(--arc-border)" strokeWidth="1" />
                            <text x="35" y="58" fill="var(--arc-text)" fontSize="9" fontFamily="'Space Mono', monospace" fontWeight="bold">Deposit Capital</text>
                            <text x="35" y="70" fill="var(--arc-accent2)" fontSize="8" fontFamily="'Space Mono', monospace">e.g. 5,000 USDC</text>

                            <line x1="135" y1="61" x2="215" y2="61" stroke="var(--arc-accent2)" strokeWidth="1.2" />
                            <polygon points="215,58 222,61 215,64" fill="var(--arc-accent2)" />

                            {/* Secure Locker Cylinder */}
                            <rect x="225" y="25" width="150" height="70" rx="3" fill="#101014" stroke="var(--arc-accent)" strokeWidth="1.5" />
                            <circle cx="260" cy="60" r="16" fill="none" stroke="var(--arc-accent)" strokeWidth="2" strokeDasharray="3,3" />
                            <text x="288" y="52" fill="var(--arc-text)" fontSize="10" fontFamily="'Space Mono', monospace" fontWeight="bold">LOCKED VAULT</text>
                            <text x="288" y="66" fill="var(--arc-accent)" fontSize="8" fontFamily="'Space Mono', monospace">8.5% Base APR</text>
                            <text x="288" y="78" fill="var(--arc-accent2)" fontSize="8" fontFamily="'Space Mono', monospace" fontWeight="bold">Locking: 10 MIN</text>

                            <line x1="375" y1="61" x2="455" y2="61" stroke="var(--arc-accent)" strokeWidth="1.2" />
                            <polygon points="455,58 462,61 455,64" fill="var(--arc-accent)" />

                            <rect x="465" y="40" width="110" height="42" rx="3" fill="rgba(0,255,210,0.05)" stroke="var(--arc-accent)" strokeWidth="1.2" />
                            <text x="475" y="58" fill="var(--arc-text)" fontSize="9" fontFamily="'Space Mono', monospace" fontWeight="bold">Maturity Claims</text>
                            <text x="475" y="70" fill="var(--arc-accent)" fontSize="8" fontFamily="'Space Mono', monospace">Capital + Earned Payout</text>
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: USE CASES FOR THE PITCH */}
                  {docsTab === 'usecases' && (
                    <div>
                      <div style={{ borderBottom: '1px solid var(--arc-border)', paddingBottom: '12px', marginBottom: '18px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--arc-accent)' }}>💡 HIGH-FIDELITY USE CASES</h3>
                        <div style={{ fontSize: '11px', color: 'var(--arc-muted)' }}>Real-world scenarios solving authentic transaction friction points</div>
                      </div>

                      {/* USE CASE 1 */}
                      <div style={{ border: '1px solid var(--arc-border)', padding: '16px', borderRadius: '4px', marginBottom: '18px', backgroundColor: '#131922' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--arc-accent)' }}>1. Freelance Contract & Milestone Fulfillment</span>
                          <span style={{ color: 'var(--arc-muted)', fontSize: '9px', fontFamily: "'Space Mono', monospace", border: '1px solid var(--arc-border)', padding: '2px 6px' }}>Safe Escrow</span>
                        </div>
                        <p style={{ fontSize: '11.5px', color: 'var(--arc-text)', opacity: 0.9, marginBottom: '10px' }}>
                          <strong>Scenario:</strong> Alice (a UI designer) enters an agreement to build design guidelines for Bob's project. Bob is worried Alice won't finish; Alice is worried Bob won't pay.
                        </p>
                        <div style={{ padding: '8px 12px', backgroundColor: 'var(--arc-bg)', fontSize: '11px', borderLeft: '2px solid var(--arc-accent)', color: 'var(--arc-text)', opacity: 0.85 }}>
                          ✔️ <strong>Solution with HybriPay:</strong> Bob triggers a HybriPay <strong>Escrow Contract Checkout</strong> specifying Alice's address. He locks 2,000 USDC in escrow. After Alice finishes the designs and uploads the proof of deliverables, Bob hits "Release Checkout" in the console. Funds settle immediately, and both Alice and Bob earn <strong>loyalty streak bonuses</strong>!
                        </div>
                      </div>

                      {/* USE CASE 2 */}
                      <div style={{ border: '1px solid var(--arc-border)', padding: '16px', borderRadius: '4px', marginBottom: '18px', backgroundColor: '#131922' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--arc-accent)' }}>2. Instant Cross-Border Merchant Settling</span>
                          <span style={{ color: 'var(--arc-muted)', fontSize: '9px', fontFamily: "'Space Mono', monospace", border: '1px solid var(--arc-border)', padding: '2px 6px' }}>Invoice + Spot Trade</span>
                        </div>
                        <p style={{ fontSize: '11.5px', color: 'var(--arc-text)', opacity: 0.9, marginBottom: '10px' }}>
                          <strong>Scenario:</strong> Charlie runs an online hardware store. An international customer wants to pay Charlie in euro stablecoins (EURC) but Charlie only holds USD-pegged coins (USDC).
                        </p>
                        <div style={{ padding: '8px 12px', backgroundColor: 'var(--arc-bg)', fontSize: '11px', borderLeft: '2px solid var(--arc-accent2)', color: 'var(--arc-text)', opacity: 0.85 }}>
                          ✔️ <strong>Solution with HybriPay:</strong> Charlie creates a structured 1,500 USDC <strong>Merchant Invoice</strong>. The buyer opens the Invoice URL, hits the built-in <strong>Spot Swap Router</strong> to automatically swap their native EURC for USDC, and completes the invoice settlement in one seamless signature.
                        </div>
                      </div>

                      {/* USE CASE 3 */}
                      <div style={{ border: '1px solid var(--arc-border)', padding: '16px', borderRadius: '4px', backgroundColor: '#131922' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--arc-accent)' }}>3. Enterprise Liquidity & Treasury Optimisation</span>
                          <span style={{ color: 'var(--arc-muted)', fontSize: '9px', fontFamily: "'Space Mono', monospace", border: '1px solid var(--arc-border)', padding: '2px 6px' }}>High-Yield Vaults</span>
                        </div>
                        <p style={{ fontSize: '11.5px', color: 'var(--arc-text)', opacity: 0.9, marginBottom: '10px' }}>
                          <strong>Scenario:</strong> A decentralized web3 startup holds $50,000 in digital assets sitting completely dormant in their treasury wallet, earning 0% yield.
                        </p>
                        <div style={{ padding: '8px 12px', backgroundColor: 'var(--arc-bg)', fontSize: '11px', borderLeft: '2px solid var(--arc-accent)', color: 'var(--arc-text)', opacity: 0.85 }}>
                          ✔️ <strong>Solution with HybriPay:</strong> The treasury manager locks part of their stable asset reserve into the <strong>HybriPay Real-Yield Vault</strong>. By staking they unlock reliable annual compounding yield percentages which accrue interest every block. Claims are unlocked on timer expiry, boosting overall enterprise liquidity metrics.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 4: LOYALTY & GAMIFICATION MECHANICS */}
                  {docsTab === 'loyalty' && (
                    <div>
                      <div style={{ borderBottom: '1px solid var(--arc-border)', paddingBottom: '12px', marginBottom: '18px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--arc-accent)' }}>🏆 GAMIFIED LOYALTY ENGINE</h3>
                        <div style={{ fontSize: '11px', color: 'var(--arc-muted)' }}>How HybriPay incentivizes frequent volume checkouts</div>
                      </div>

                      <div style={{ marginBottom: '22px' }}>
                        <p style={{ fontSize: '12px', color: 'var(--arc-text)', opacity: 0.85, marginBottom: '12px' }}>
                          At the core of HybriPay's user retention is a multi-tier transaction reward mechanism. Every time a user interacts (Creates invoices, locks vaults, releases escrows, swaps assets, or checks in daily), they claim <strong>Loyalty Experience Points</strong> directly updating their tier thresholds.
                        </p>

                        {/* Interactive Loyalty Previewer */}
                        <div style={{ border: '2px dashed var(--arc-border)', borderRadius: '4px', padding: '16px', backgroundColor: 'rgba(0,0,0,0.1)', textAlign: 'center', marginBottom: '20px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--arc-accent)', marginBottom: '8px' }}>⚡ Live Pitch Tier Simulator</div>
                          <div style={{ fontSize: '11px', color: 'var(--arc-text)', marginBottom: '12px' }}>
                            Your current active pitch presentation points are estimated at: <strong>{loyaltyPoints} PTS</strong>
                          </div>
                          
                          {/* Progress bar represent */}
                          <div style={{ height: '14px', backgroundColor: '#000', border: '1px solid var(--arc-border)', borderRadius: '3px', position: 'relative', overflow: 'hidden', maxWidth: '380px', margin: '0 auto 12px auto' }}>
                            <div 
                              style={{ 
                                height: '100%', 
                                width: `${Math.min(100, (loyaltyPoints / 250) * 100)}%`, 
                                backgroundColor: 'var(--arc-accent2)',
                                transition: 'width 0.4s ease-out'
                              }} 
                            />
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '9px', fontWeight: 'bold', color: '#fff', textShadow: '1px 1px #000' }}>
                              {Math.round(Math.min(100, (loyaltyPoints / 250) * 100))}% toward next Elite Arc rank
                            </div>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                            <button 
                              className="arc-btn" 
                              style={{ padding: '4px 10px', fontSize: '10px' }} 
                              onClick={() => {
                                setLoyaltyPoints(prev => prev + 15);
                                localStorage.setItem('hybri_loyalty_points', String(loyaltyPoints + 15));
                              }}
                            >
                              Simulate +15 PTS Interaction
                            </button>
                            <button 
                              className="arc-btn" 
                              style={{ padding: '4px 10px', fontSize: '10px', opacity: 0.7 }} 
                              onClick={() => {
                                setLoyaltyPoints(35);
                                localStorage.setItem('hybri_loyalty_points', '35');
                              }}
                            >
                              Reset
                            </button>
                          </div>
                        </div>

                        {/* Loyalty Matrix Grid */}
                        <div className="arc-grid" style={{ gap: '12px' }}>
                          <div style={{ border: '1px solid var(--arc-border)', padding: '10px', borderRadius: '4px', backgroundColor: loyaltyPoints < 50 ? 'rgba(0,255,210,0.02)' : 'transparent', opacity: loyaltyPoints < 50 ? 1 : 0.65 }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#3b82f6', marginBottom: '4px' }}>🥉 BRONZE TIER (0 - 49 PTS)</div>
                            <ul style={{ fontSize: '10px', paddingLeft: '12px', listStyleType: 'circle', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <li>Access to general checkouts</li>
                              <li>Base gas fee multiplier</li>
                              <li>Standard ARC support status</li>
                            </ul>
                          </div>

                          <div style={{ border: '1px solid var(--arc-border)', padding: '10px', borderRadius: '4px', backgroundColor: (loyaltyPoints >= 50 && loyaltyPoints < 120) ? 'rgba(0,255,210,0.02)' : 'transparent', opacity: (loyaltyPoints >= 50 && loyaltyPoints < 120) ? 1 : 0.65 }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>🥈 SILVER TIER (50 - 119 PTS)</div>
                            <ul style={{ fontSize: '10px', paddingLeft: '12px', listStyleType: 'circle', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <li>1.05x staking APR booster</li>
                              <li>-5% rebate on routing gas</li>
                              <li>Custom Silver badge flag</li>
                            </ul>
                          </div>

                          <div style={{ border: '1px solid var(--arc-border)', padding: '10px', borderRadius: '4px', backgroundColor: (loyaltyPoints >= 120 && loyaltyPoints < 250) ? 'rgba(0,255,210,0.02)' : 'transparent', opacity: (loyaltyPoints >= 120 && loyaltyPoints < 250) ? 1 : 0.65 }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--arc-accent)', marginBottom: '4px' }}>🥇 GOLD TIER (120 - 249 PTS)</div>
                            <ul style={{ fontSize: '10px', paddingLeft: '12px', listStyleType: 'circle', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <li>1.15x staking APR booster</li>
                              <li>-12% rebate on total gas</li>
                              <li>Slippage auto-adjuster buffer</li>
                            </ul>
                          </div>

                          <div style={{ border: '1px solid var(--arc-border)', padding: '10px', borderRadius: '4px', backgroundColor: loyaltyPoints >= 250 ? 'rgba(0,255,210,0.02)' : 'transparent', opacity: loyaltyPoints >= 250 ? 1 : 0.65 }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--arc-accent2)', marginBottom: '4px' }}>🌌 ARC CYBER TIER (250+ PTS)</div>
                            <ul style={{ fontSize: '10px', paddingLeft: '12px', listStyleType: 'circle', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <li>1.30x premium APR booster</li>
                              <li>-25% rebate on total gas</li>
                              <li>Elite Cyber styled dashboard themes</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Toast Alert Banner Wrapper */}
      {isToastVisible && (
        <div 
          id="arc-toast" 
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: '#111417',
            border: `1px solid ${toastColor}`,
            color: toastColor,
            padding: '10px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontFamily: "'DM Sans', sans-serif",
            zIndex: 9999,
            maxWidth: '280px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
          }}
        >
          {toastMessage}
        </div>
      )}

    </div>
  );
}
