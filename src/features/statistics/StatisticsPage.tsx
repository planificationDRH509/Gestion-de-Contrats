import { useMemo, useState } from "react";
import { useAuth } from "../auth/auth";
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

    return rawContracts.filter(c => {
      const contractDate = new Date(c.createdAt);
      let dateMatch = true;
      if (filterType !== 'all') {
        dateMatch = contractDate >= start && contractDate <= end;
      }
      const statusMatch = statusFilter === 'all' ? true : c.status === statusFilter;
      const assignmentMatch = assignmentFilter === 'all' ? true : c.assignment === assignmentFilter;
      
      return dateMatch && statusMatch && assignmentMatch;
    });
  }, [rawContracts, filterType, startDate, endDate, statusFilter, assignmentFilter]);

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
      <header className="section-header" style={{ marginBottom: "32px", display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '20px', position: 'relative', background: 'transparent' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <h1 className="section-title" style={{ fontSize: "28px", fontFamily: "var(--font-heading)" }}>Tableau de Bord & Statistiques</h1>
            <p style={{ color: "var(--ink-muted)", fontSize: "15px", marginTop: "4px" }}>Visualisation analytique des effectifs et de la masse salariale.</p>
          </div>

          {/* Time Filter Bar */}
          <div className="stats-filters" style={{ 
            display: 'flex', 
            background: 'var(--surface-sunken)', 
            padding: '4px', 
            borderRadius: '14px', 
            gap: '2px',
            alignItems: 'center',
            border: '1px solid var(--border)'
          }}>
            {['all', 'today', 'week', 'month', 'quarter', 'custom'].map((f) => (
              <button
                key={f}
                onClick={() => setFilterType(f as FilterType)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  background: filterType === f ? 'var(--primary)' : 'transparent',
                  color: filterType === f ? 'white' : 'var(--ink-muted)',
                  fontWeight: filterType === f ? '600' : '500',
                  cursor: 'pointer',
                  fontSize: '13px',
                  transition: 'all 0.2s var(--premium-ease)',
                  textTransform: 'capitalize',
                  boxShadow: filterType === f ? '0 4px 12px rgba(99, 102, 241, 0.2)' : 'none'
                }}
              >
                {f === 'all' ? 'Tous' : 
                 f === 'today' ? 'Aujourd\'hui' : 
                 f === 'week' ? 'Semaine' : 
                 f === 'month' ? 'Mois' : 
                 f === 'quarter' ? 'Trimestre' : 'Personnalisé'}
              </button>
            ))}
          </div>
        </div>

        {/* Extended Filters */}
        <div style={{ 
          display: 'flex', 
          gap: '16px', 
          alignItems: 'center', 
          flexWrap: 'wrap',
          background: 'var(--surface-card)',
          padding: '12px 16px',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          width: '100%',
          boxShadow: 'var(--shadow)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--primary)', fontSize: '20px' }}>filter_alt</span>
            <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--ink)' }}>Filtres :</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>Statut</label>
            <select 
              value={statusFilter} 
              onChange={e => setStatusFilter(e.target.value)}
              className="input"
              style={{ padding: '6px 10px', fontSize: '13.5px', minWidth: '140px', height: '36px' }}
            >
              <option value="all">Tous les statuts</option>
              {Object.entries(statusLabels).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>Affectation</label>
            <select 
              value={assignmentFilter} 
              onChange={e => setAssignmentFilter(e.target.value)}
              className="input"
              style={{ padding: '6px 10px', fontSize: '13.5px', minWidth: '180px', height: '36px' }}
            >
              <option value="all">Toutes les affectations</option>
              {uniqueAssignments.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {filterType === 'custom' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
              <input 
                type="date" 
                className="input"
                value={startDate} 
                onChange={e => setStartDate(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '13px', height: '36px' }}
              />
              <span style={{ color: 'var(--ink-muted)' }}>→</span>
              <input 
                type="date" 
                className="input"
                value={endDate} 
                onChange={e => setEndDate(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '13px', height: '36px' }}
              />
            </div>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="empty-state" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div className="material-symbols-rounded is-spinning" style={{ fontSize: '48px', marginBottom: '16px', color: 'var(--primary)' }}>sync</div>
          <div style={{ color: 'var(--ink-muted)', fontSize: '16px', fontWeight: '500' }}>Analyse des données en cours...</div>
        </div>
      ) : contracts.length === 0 ? (
        <div className="card" style={{ padding: "80px 20px", textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span className="material-symbols-rounded" style={{ fontSize: "64px", color: "var(--border)", marginBottom: "20px" }}>analytics</span>
          <h2 style={{ color: "var(--ink)", marginBottom: "8px", fontSize: '20px', fontFamily: "var(--font-heading)" }}>Aucune donnée pour cette sélection</h2>
          <p style={{ color: 'var(--ink-muted)', fontSize: '14px' }}>Ajustez vos filtres ou sélectionnez une autre période.</p>
        </div>
      ) : (
        <div style={{ animation: "slide-up 0.5s var(--premium-ease)" }}>
          {/* Hero Stats */}
          <div className="stats-grid" style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", 
            gap: "24px", 
            marginBottom: "32px" 
          }}>
            
            <HeroStatCard 
              label="Total Contrats" 
              value={totalContracts} 
              icon="description" 
              color="var(--info)" 
              bg="var(--info-soft)" 
            />
            <HeroStatCard 
              label="Masse Salariale Engagée" 
              value={formatCurrency(financialStats.totalMass)} 
              icon="payments" 
              color="var(--success)" 
              bg="var(--success-soft)" 
              fontSize="22px"
            />
            <HeroStatCard 
              label="Salaire Moyen" 
              value={formatCurrency(financialStats.avgSalary)} 
              icon="account_balance_wallet" 
              color="var(--warning)" 
              bg="var(--warning-soft)" 
              fontSize="22px"
            />
            <HeroStatCard 
              label="Ratio Homme/Femme" 
              value={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#3b82f6' }}>{contracts.filter(c => c.gender === 'Homme').length}</span>
                  <span style={{ fontSize: '18px', color: 'var(--border)' }}>/</span>
                  <span style={{ color: '#ec4899' }}>{contracts.filter(c => c.gender === 'Femme').length}</span>
                </div>
              } 
              icon="wc" 
              color="#8b5cf6" 
              bg="rgba(139, 92, 246, 0.1)" 
            />

          </div>

          {/* Main Charts Area */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "24px" }}>
            
            {/* Evolution Chart (Wide) */}
            <div className="card" style={{ gridColumn: "span 8" }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--ink)', margin: 0, fontFamily: 'var(--font-heading)' }}>Dynamique des Saisies</h3>
                <span style={{ fontSize: '12px', background: 'var(--surface-sunken)', padding: '4px 10px', borderRadius: '10px', color: 'var(--ink-muted)', fontWeight: '600' }}>Volume & Coûts</span>
              </div>
              <div style={{ height: "320px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={evolutionData}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
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
                      dy={10}
                    />
                    <YAxis yAxisId="left" stroke="var(--ink-muted)" fontSize={11} tickLine={false} axisLine={false} dx={-10} />
                    <YAxis yAxisId="right" orientation="right" hide />
                    
                    <Tooltip 
                      contentStyle={{ borderRadius: '14px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)', background: 'var(--surface-card)', padding: '12px' }}
                      formatter={(value: any, name: any) => {
                        if (name === 'cost') return [formatCurrency(value as number), 'Coût Engagé'];
                        return [value, 'Contrats'];
                      }}
                      labelStyle={{ color: 'var(--ink-muted)', marginBottom: '4px', fontWeight: '700', fontSize: '13px' }}
                    />
                    <Area yAxisId="left" type="monotone" dataKey="count" name="count" stroke="#6366f1" fillOpacity={1} fill="url(#colorCount)" strokeWidth={2.5} activeDot={{ r: 5, strokeWidth: 0, fill: '#6366f1' }} />
                    <Area yAxisId="right" type="monotone" dataKey="cost" name="cost" stroke="#10b981" fillOpacity={1} fill="url(#colorCost)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gender Distribution */}
            <div className="card" style={{ gridColumn: "span 4", display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--ink)', margin: 0, marginBottom: '24px', fontFamily: 'var(--font-heading)' }}>Répartition par Genre</h3>
              <div style={{ flex: 1, minHeight: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={genderData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={6}
                      dataKey="value"
                      stroke="none"
                    >
                      {genderData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.name === 'Homme' ? '#3b82f6' : entry.name === 'Femme' ? '#ec4899' : COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', background: 'var(--surface-card)' }} 
                      itemStyle={{ color: 'var(--ink)', fontWeight: '600', fontSize: '13px' }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Positions */}
            <div className="card" style={{ gridColumn: "span 4" }}>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--ink)', margin: 0, marginBottom: '24px', fontFamily: 'var(--font-heading)' }}>Top 8 Postes</h3>
              <div style={{ height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={positionData} layout="vertical" margin={{ top: 0, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" opacity={0.5} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" stroke="var(--ink-muted)" fontSize={11} width={110} tickLine={false} axisLine={false} tick={{ fill: 'var(--ink)', fontSize: 11 }} />
                    <Tooltip 
                      cursor={{ fill: 'var(--surface-sunken)' }}
                      contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', background: 'var(--surface-card)' }} 
                    />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={14}>
                      {positionData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Status Distribution */}
            <div className="card" style={{ gridColumn: "span 4" }}>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--ink)', margin: 0, marginBottom: '24px', fontFamily: 'var(--font-heading)' }}>État d'avancement</h3>
              <div style={{ height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData} layout="vertical" margin={{ top: 0, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" opacity={0.5} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" stroke="var(--ink-muted)" fontSize={11} width={100} tickLine={false} axisLine={false} tick={{ fill: 'var(--ink)' }} />
                    <Tooltip 
                      cursor={{ fill: 'var(--surface-sunken)' }}
                      contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', background: 'var(--surface-card)' }} 
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Durations Distribution */}
            <div className="card" style={{ gridColumn: "span 4" }}>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--ink)', margin: 0, marginBottom: '24px', fontFamily: 'var(--font-heading)' }}>Répartition des Durées</h3>
              <div style={{ height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={durationData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                    <XAxis dataKey="name" stroke="var(--ink-muted)" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="var(--ink-muted)" fontSize={11} tickLine={false} axisLine={false} dx={-10} />
                    <Tooltip 
                      cursor={{ fill: 'var(--surface-sunken)' }}
                      contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', background: 'var(--surface-card)' }} 
                    />
                    <Bar dataKey="count" fill="#14b8a6" radius={[4, 4, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Assignments */}
            <div className="card" style={{ gridColumn: "span 12" }}>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--ink)', margin: 0, marginBottom: '24px', fontFamily: 'var(--font-heading)' }}>Top 10 Affectations</h3>
              <div style={{ height: "340px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={assignmentData} margin={{ top: 10, right: 10, left: -15, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                    <XAxis dataKey="name" stroke="var(--ink-muted)" fontSize={11} tick={{angle: -30, textAnchor: 'end', fill: 'var(--ink)' }} height={70} tickLine={false} axisLine={false} interval={0} />
                    <YAxis stroke="var(--ink-muted)" fontSize={11} tickLine={false} axisLine={false} dx={-10} />
                    <Tooltip 
                      cursor={{ fill: 'var(--surface-sunken)' }}
                      contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', background: 'var(--surface-card)' }} 
                    />
                    <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={36}>
                      {assignmentData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

function HeroStatCard({ label, value, icon, color, bg, fontSize = "26px" }: { label: string, value: any, icon: string, color: string, bg: string, fontSize?: string }) {
  return (
    <div className="card" style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '20px', 
      padding: '24px',
      transition: 'all 0.3s var(--premium-ease)',
      cursor: 'default'
    }}>
      <div style={{ 
        width: '52px', 
        height: '52px', 
        borderRadius: '14px', 
        background: bg, 
        color: color, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <span className="material-symbols-rounded" style={{ fontSize: '26px' }}>{icon}</span>
      </div>
      <div>
        <div style={{ fontSize: '13px', color: 'var(--ink-muted)', fontWeight: '600', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</div>
        <div style={{ fontSize, fontWeight: '800', color: 'var(--ink)', fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>{value}</div>
      </div>
    </div>
  );
}
