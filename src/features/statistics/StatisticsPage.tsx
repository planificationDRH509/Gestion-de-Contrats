import { useMemo, useState } from "react";
import { useAuth } from "../auth/auth";
import { useAppUsers } from "../auth/usersApi";
import { useContractsList } from "../contracts/contractsApi";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart, 
  Pie, 
  Legend,
  AreaChart,
  Area
} from "recharts";

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#14b8a6', '#f43f5e'];

type FilterType = 'all' | 'today' | 'week' | 'month' | 'quarter' | 'custom';

export function StatisticsPage() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId ?? "";
  const { data: usersData } = useAppUsers();

  // Fiscal Year list
  const fiscalYears = useMemo(() => {
    const now = new Date();
    const currentStartYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
    const years = [];
    for (let i = 0; i < 5; i++) {
      const start = currentStartYear - i;
      years.push(`${start}-${start + 1}`);
    }
    return years;
  }, []);

  const [fiscalYear, setFiscalYear] = useState<string>(() => {
    const now = new Date();
    const startYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear}-${startYear + 1}`;
  });

  // 1. FILTER STATE
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('all');

  // Fetch all contracts (using a large pageSize for stats)
  const { data, isLoading } = useContractsList({
    workspaceId,
    pageSize: 5000 // Get up to 5000 contracts for more accurate statistics
  });

  const rawContracts = data?.items ?? [];

  const uniqueAssignments = useMemo(() => {
    return Array.from(new Set(rawContracts.map(c => c.assignment).filter(Boolean))).sort();
  }, [rawContracts]);

  // Users mapping for full names
  const usersMap = useMemo(() => {
    return Object.fromEntries((usersData || []).map(u => [u.id, u.fullName]));
  }, [usersData]);

  // 2. FILTERING LOGIC
  const filteredContracts = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end = new Date();
    
    switch (filterType) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case 'quarter':
        start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case 'custom':
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        break;
      default:
        start = new Date(0); // far past
        end = new Date(); // now
        break;
    }

    const [fyStartStr, fyEndStr] = fiscalYear.split("-");
    const fiscalStart = new Date(Number(fyStartStr), 9, 1); // Oct 1
    const fiscalEnd = new Date(Number(fyEndStr), 8, 30, 23, 59, 59, 999); // Sep 30

    return rawContracts.filter(c => {
      const contractDate = new Date(c.createdAt);
      
      // Must fall within the selected fiscal year
      if (contractDate < fiscalStart || contractDate > fiscalEnd) {
        return false;
      }

      let dateMatch = true;
      if (filterType !== 'all') {
        dateMatch = contractDate >= start && contractDate <= end;
      }
      const statusMatch = statusFilter === 'all' ? true : c.status === statusFilter;
      const assignmentMatch = assignmentFilter === 'all' ? true : c.assignment === assignmentFilter;
      
      return dateMatch && statusMatch && assignmentMatch;
    });
  }, [rawContracts, filterType, startDate, endDate, statusFilter, assignmentFilter, fiscalYear]);

  const contracts = filteredContracts;

  // 3. STATS DATA & CALCULATIONS
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('fr-HT', { style: 'currency', currency: 'HTG', maximumFractionDigits: 0 }).format(val);
  };

  const financialStats = useMemo(() => {
    let totalMass = 0;
    let totalSalary = 0;
    let maxSalary = 0;
    contracts.forEach(c => {
      const sal = Number(c.salaryNumber) || 0;
      const dur = Number(c.durationMonths) || 0;
      totalMass += (sal * dur);
      totalSalary += sal;
      if (sal > maxSalary) maxSalary = sal;
    });
    return {
      totalMass,
      avgSalary: contracts.length > 0 ? totalSalary / contracts.length : 0,
      maxSalary
    };
  }, [contracts]);

  const genderData = useMemo(() => {
    const counts = contracts.reduce((acc: any, curr) => {
      const g = curr.gender || "Inconnu";
      acc[g] = (acc[g] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [contracts]);

  const statusLabels: Record<string, string> = {
    draft: "Brouillon",
    saisie: "Saisie",
    correction: "Correction",
    impression_partiel: "Impr. partiel",
    imprime: "Imprimé",
    signe: "Signé",
    transfere: "Transféré",
    classe: "Classé",
    final: "Final"
  };

  const statusData = useMemo(() => {
    const counts = contracts.reduce((acc: any, curr) => {
      const s = curr.status || "draft";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts).map(([status, count]) => ({
      name: statusLabels[status] || status,
      count
    })).sort((a, b) => (b.count as number) - (a.count as number));
  }, [contracts]);

  const assignmentData = useMemo(() => {
    const counts = contracts.reduce((acc: any, curr) => {
      const a = curr.assignment || "Inconnue";
      acc[a] = (acc[a] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10
  }, [contracts]);

  const positionData = useMemo(() => {
    const counts = contracts.reduce((acc: any, curr) => {
      const p = curr.position || "Inconnue";
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8); // Top 8 positions
  }, [contracts]);

  const durationData = useMemo(() => {
    const counts = contracts.reduce((acc: any, curr) => {
      const d = curr.durationMonths ? `${curr.durationMonths} mois` : "Non spécifié";
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count: count as number }))
      .sort((a, b) => b.count - a.count);
  }, [contracts]);

  const createdByData = useMemo(() => {
    const counts = contracts.reduce((acc: any, curr) => {
      const creatorId = curr.createdBy || "Inconnu";
      const creatorName = usersMap[creatorId] || creatorId;
      acc[creatorName] = (acc[creatorName] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8); // Top 8 employees
  }, [contracts, usersMap]);

  const evolutionData = useMemo(() => {
    const counts: Record<string, number> = {};
    const costAcc: Record<string, number> = {};
    
    // Choose granularity based on filter
    const isShortPeriod = filterType === 'today' || filterType === 'week' || filterType === 'month';
    
    contracts.forEach(c => {
      const date = new Date(c.createdAt);
      const key = isShortPeriod 
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      counts[key] = (counts[key] || 0) + 1;
      const sal = Number(c.salaryNumber) || 0;
      const dur = Number(c.durationMonths) || 0;
      costAcc[key] = (costAcc[key] || 0) + (sal * dur);
    });

    return Object.entries(counts)
      .map(([date, count]) => ({ date, count, cost: costAcc[date] }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [contracts, filterType]);

  // 4. MAIN RENDER
  const totalContracts = contracts.length;

  return (
    <div className="page-container" style={{ animation: "fade-in 0.4s ease-out" }}>
      <div className="section-header">
        <div>
          <div className="section-title">Tableau de Bord</div>
          <div className="section-subtitle">Analyse approfondie des performances et de la masse salariale.</div>
        </div>

        <div className="toolbar-unified">
          {/* Fiscal Year Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--panel-muted)', padding: '4px 10px', borderRadius: '10px' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--ink-muted)', fontSize: '18px' }}>calendar_month</span>
            <select 
              value={fiscalYear} 
              onChange={e => setFiscalYear(e.target.value)}
              style={{ 
                border: 'none', 
                background: 'transparent', 
                fontWeight: 600, 
                color: 'var(--ink)', 
                fontSize: '13px',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              {fiscalYears.map(year => (
                <option key={year} value={year}>Exercice {year}</option>
              ))}
            </select>
          </div>

          <div className="toolbar-divider" />

          {/* Time Filter Bar */}
          <div className="view-switch-unified">
            {['all', 'today', 'week', 'month', 'quarter', 'custom'].map((f) => (
              <button
                key={f}
                onClick={() => setFilterType(f as FilterType)}
                className={`view-pill-unified ${filterType === f ? "active" : ""}`}
                style={{ padding: '4px 12px', fontSize: '12px' }}
              >
                {f === 'all' ? 'Tous' : 
                 f === 'today' ? 'Aujourd\'hui' : 
                 f === 'week' ? 'Semaine' : 
                 f === 'month' ? 'Mois' : 
                 f === 'quarter' ? 'Trimestre' : 'Perso.'}
              </button>
            ))}
          </div>

          <div className="toolbar-divider" />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select 
              value={statusFilter} 
              onChange={e => setStatusFilter(e.target.value)}
              className="input"
              style={{ padding: '6px 12px', fontSize: '13px', height: '34px', borderRadius: '10px', width: '140px' }}
            >
              <option value="all">Tous statuts</option>
              {Object.entries(statusLabels).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>

            <select 
              value={assignmentFilter} 
              onChange={e => setAssignmentFilter(e.target.value)}
              className="input"
              style={{ padding: '6px 12px', fontSize: '13px', height: '34px', borderRadius: '10px', width: '160px' }}
            >
              <option value="all">Toutes affectations</option>
              {uniqueAssignments.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {filterType === 'custom' && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', background: 'var(--panel-muted)', padding: '2px 8px', borderRadius: '10px' }}>
              <input 
                type="date" 
                className="input"
                value={startDate} 
                onChange={e => setStartDate(e.target.value)}
                style={{ padding: '2px 4px', fontSize: '12px', height: '28px', border: 'none', background: 'transparent' }}
              />
              <span style={{ color: 'var(--ink-muted)', fontSize: '12px' }}>→</span>
              <input 
                type="date" 
                className="input"
                value={endDate} 
                onChange={e => setEndDate(e.target.value)}
                style={{ padding: '2px 4px', fontSize: '12px', height: '28px', border: 'none', background: 'transparent' }}
              />
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state" style={{ minHeight: '500px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div className="material-symbols-rounded is-spinning" style={{ fontSize: '56px', marginBottom: '20px', color: 'var(--primary)' }}>sync</div>
          <div style={{ color: 'var(--ink-muted)', fontSize: '18px', fontWeight: '500' }}>Extraction des tendances...</div>
        </div>
      ) : contracts.length === 0 ? (
        <div className="card" style={{ padding: "100px 20px", textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', borderRadius: '24px' }}>
          <span className="material-symbols-rounded" style={{ fontSize: "80px", color: "var(--border)", marginBottom: "24px" }}>analytics</span>
          <h2 style={{ color: "var(--ink)", marginBottom: "12px", fontSize: '24px', fontFamily: "var(--font-heading)", fontWeight: 700 }}>Silence radio...</h2>
          <p style={{ color: 'var(--ink-muted)', fontSize: '16px', maxWidth: '400px' }}>Aucune donnée ne correspond à vos filtres actuels dans l'exercice sélectionné. Essayez d'élargir la période ou de changer les critères.</p>
        </div>
      ) : (
        <div style={{ animation: "slide-up 0.6s var(--premium-ease)" }}>
          {/* Hero Stats */}
          <div className="stats-grid" style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", 
            gap: "32px", 
            marginBottom: "48px" 
          }}>
            
            <HeroStatCard 
              label="Total Contrats" 
              value={totalContracts} 
              icon="description" 
              color="var(--info)" 
              bg="var(--info-soft)" 
            />
            <HeroStatCard 
              label="Masse Salariale" 
              value={formatCurrency(financialStats.totalMass)} 
              icon="payments" 
              color="var(--success)" 
              bg="var(--success-soft)" 
              fontSize="24px"
            />
            <HeroStatCard 
              label="Salaire Moyen" 
              value={formatCurrency(financialStats.avgSalary)} 
              icon="account_balance_wallet" 
              color="var(--warning)" 
              bg="var(--warning-soft)" 
              fontSize="24px"
            />
            <HeroStatCard 
              label="Répartition Sexe" 
              value={
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ color: '#3b82f6', fontSize: '20px', fontWeight: 800 }}>{contracts.filter(c => c.gender === 'Homme').length}</span>
                    <span style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>H</span>
                  </div>
                  <span style={{ fontSize: '24px', color: 'var(--border)', fontWeight: 200 }}>|</span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ color: '#ec4899', fontSize: '20px', fontWeight: 800 }}>{contracts.filter(c => c.gender === 'Femme').length}</span>
                    <span style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>F</span>
                  </div>
                </div>
              } 
              icon="wc" 
              color="#8b5cf6" 
              bg="rgba(139, 92, 246, 0.1)" 
            />

          </div>

          {/* Main Charts Area */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "32px" }}>
            
            {/* Evolution Chart (Wide) */}
            <div className="card" style={{ gridColumn: "span 8", padding: "32px" }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--ink)', margin: 0, fontFamily: 'var(--font-heading)' }}>Dynamique Temporelle</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ fontSize: '11px', background: 'rgba(99, 102, 241, 0.1)', padding: '4px 10px', borderRadius: '8px', color: 'var(--primary)', fontWeight: '700' }}>VOLUME</span>
                  <span style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 10px', borderRadius: '8px', color: 'var(--success)', fontWeight: '700' }}>COÛTS</span>
                </div>
              </div>
              <div style={{ height: "350px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={evolutionData}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
                    <XAxis 
                      dataKey="date" 
                      stroke="var(--ink-muted)" 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(val) => {
                        const isShortPeriod = filterType === 'today' || filterType === 'week' || filterType === 'month';
                        if (isShortPeriod) {
                          return val.split('-').slice(1).reverse().join('/');
                        }
                        return val;
                      }}
                      dy={15}
                    />
                    <YAxis yAxisId="left" stroke="var(--ink-muted)" fontSize={11} tickLine={false} axisLine={false} dx={-15} />
                    <YAxis yAxisId="right" orientation="right" hide />
                    
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: 'var(--shadow-premium)', background: 'var(--surface-card)', padding: '16px' }}
                      formatter={(value: any, name: any) => {
                        if (name === 'cost') return [formatCurrency(value as number), 'Masse Salariale'];
                        return [value, 'Nombre de Contrats'];
                      }}
                      labelStyle={{ color: 'var(--ink)', marginBottom: '8px', fontWeight: '800', fontSize: '14px' }}
                    />
                    <Area yAxisId="left" type="monotone" dataKey="count" name="count" stroke="#6366f1" fillOpacity={1} fill="url(#colorCount)" strokeWidth={3} activeDot={{ r: 6, strokeWidth: 0, fill: '#6366f1' }} />
                    <Area yAxisId="right" type="monotone" dataKey="cost" name="cost" stroke="#10b981" fillOpacity={1} fill="url(#colorCost)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Status Distribution */}
            <div className="card" style={{ gridColumn: "span 4", padding: "32px" }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--ink)', margin: 0, marginBottom: '32px', fontFamily: 'var(--font-heading)' }}>État d'Avancement</h3>
              <div style={{ height: "350px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData} layout="vertical" margin={{ top: 0, right: 30, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" opacity={0.4} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" stroke="var(--ink-muted)" fontSize={11} width={110} tickLine={false} axisLine={false} tick={{ fill: 'var(--ink)', fontWeight: 500 }} />
                    <Tooltip 
                      cursor={{ fill: 'var(--surface-sunken)', opacity: 0.5 }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow)', background: 'var(--surface-card)' }} 
                    />
                    <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]} barSize={20}>
                      {statusData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Assignments */}
            <div className="card" style={{ gridColumn: "span 8", padding: "32px" }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--ink)', margin: 0, marginBottom: '32px', fontFamily: 'var(--font-heading)' }}>Top 10 Affectations</h3>
              <div style={{ height: "380px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={assignmentData} margin={{ top: 10, right: 10, left: -10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
                    <XAxis dataKey="name" stroke="var(--ink-muted)" fontSize={11} tick={{angle: -35, textAnchor: 'end', fill: 'var(--ink)', fontWeight: 500 }} height={80} tickLine={false} axisLine={false} interval={0} />
                    <YAxis stroke="var(--ink-muted)" fontSize={11} tickLine={false} axisLine={false} dx={-15} />
                    <Tooltip 
                      cursor={{ fill: 'var(--surface-sunken)', opacity: 0.5 }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow)', background: 'var(--surface-card)' }} 
                    />
                    <Bar dataKey="count" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={40}>
                      {assignmentData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Contracts by Employee */}
            <div className="card" style={{ gridColumn: "span 4", padding: "32px" }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--ink)', margin: 0, marginBottom: '32px', fontFamily: 'var(--font-heading)' }}>Performance Individuelle</h3>
              <div style={{ height: "380px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={createdByData} layout="vertical" margin={{ top: 0, right: 30, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" opacity={0.4} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" stroke="var(--ink-muted)" fontSize={11} width={100} tickLine={false} axisLine={false} tick={{ fill: 'var(--ink)', fontWeight: 500 }} />
                    <Tooltip 
                      cursor={{ fill: 'var(--surface-sunken)', opacity: 0.5 }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow)', background: 'var(--surface-card)' }} 
                    />
                    <Bar dataKey="count" fill="#ec4899" radius={[0, 6, 6, 0]} barSize={20}>
                      {createdByData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 4) % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Row 3: Smaller details */}
            <div className="card" style={{ gridColumn: "span 4", padding: "32px" }}>
              <h3 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--ink)', margin: 0, marginBottom: '24px', fontFamily: 'var(--font-heading)' }}>Top 8 Postes</h3>
              <div style={{ height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={positionData} layout="vertical" margin={{ top: 0, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" opacity={0.4} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" stroke="var(--ink-muted)" fontSize={10} width={110} tickLine={false} axisLine={false} tick={{ fill: 'var(--ink)' }} />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={14}>
                      {positionData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 1) % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card" style={{ gridColumn: "span 4", padding: "32px" }}>
              <h3 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--ink)', margin: 0, marginBottom: '24px', fontFamily: 'var(--font-heading)' }}>Durées des Contrats</h3>
              <div style={{ height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={durationData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
                    <XAxis dataKey="name" stroke="var(--ink-muted)" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="var(--ink-muted)" fontSize={11} tickLine={false} axisLine={false} dx={-10} />
                    <Bar dataKey="count" fill="#14b8a6" radius={[4, 4, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card" style={{ gridColumn: "span 4", padding: "32px", display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--ink)', margin: 0, marginBottom: '24px', fontFamily: 'var(--font-heading)' }}>Mixité</h3>
              <div style={{ flex: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={genderData}
                      cx="50%"
                      cy="50%"
                      innerRadius={75}
                      outerRadius={105}
                      paddingAngle={8}
                      dataKey="value"
                      stroke="none"
                    >
                      {genderData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.name === 'Homme' ? '#3b82f6' : entry.name === 'Femme' ? '#ec4899' : COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow)', background: 'var(--surface-card)' }} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

function HeroStatCard({ label, value, icon, color, bg, fontSize = "28px" }: { label: string, value: any, icon: string, color: string, bg: string, fontSize?: string }) {
  return (
    <div className="card" style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '24px', 
      padding: '32px',
      transition: 'transform 0.3s var(--premium-ease), box-shadow 0.3s var(--premium-ease)',
      cursor: 'default',
      borderRadius: '24px',
      border: '1px solid var(--border)'
    }}>
      <div style={{ 
        width: '64px', 
        height: '64px', 
        borderRadius: '18px', 
        background: bg, 
        color: color, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        boxShadow: `0 8px 16px -4px ${bg}`
      }}>
        <span className="material-symbols-rounded" style={{ fontSize: '32px' }}>{icon}</span>
      </div>
      <div>
        <div style={{ fontSize: '12px', color: 'var(--ink-muted)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize, fontWeight: '900', color: 'var(--ink)', fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>{value}</div>
      </div>
    </div>
  );
}
