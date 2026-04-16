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

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

type FilterType = 'all' | 'today' | 'week' | 'month' | 'quarter' | 'custom';

export function StatisticsPage() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId ?? "";

  // 1. FILTER STATE
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Fetch all contracts (using a large pageSize for stats)
  const { data, isLoading } = useContractsList({
    workspaceId,
    pageSize: 1000 // Get up to 1000 contracts for statistics
  });

  const rawContracts = data?.items ?? [];

  // 2. FILTERING LOGIC
  const filteredContracts = useMemo(() => {
    if (filterType === 'all') return rawContracts;
    
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
        return rawContracts;
    }

    return rawContracts.filter(c => {
      const contractDate = new Date(c.createdAt);
      return contractDate >= start && contractDate <= end;
    });
  }, [rawContracts, filterType, startDate, endDate]);

  const contracts = filteredContracts;

  // 3. STATS DATA
  const genderData = useMemo(() => {
    const counts = contracts.reduce((acc: any, curr) => {
      const g = curr.gender || "Inconnu";
      acc[g] = (acc[g] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [contracts]);

  const statusData = useMemo(() => {
    const counts = contracts.reduce((acc: any, curr) => {
      const s = curr.status || "draft";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

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
      .slice(0, 8); // Top 8 assignments
  }, [contracts]);

  const evolutionData = useMemo(() => {
    const counts: Record<string, number> = {};
    
    // Choose granularity based on filter
    const isShortPeriod = filterType === 'today' || filterType === 'week';
    
    contracts.forEach(c => {
      const date = new Date(c.createdAt);
      const key = isShortPeriod 
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [contracts, filterType]);

  // 4. MAIN RENDER
  const totalContracts = contracts.length;

  return (
    <div className="stats-page" style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
      <header className="stats-header" style={{ marginBottom: "32px", display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "var(--ink)", marginBottom: "8px" }}>Statistiques</h1>
          <p style={{ color: "var(--ink-muted)" }}>Vue d'ensemble des données de vos contrats et effectifs.</p>
        </div>

        {/* Filter Bar */}
        <div className="stats-filters" style={{ 
          display: 'flex', 
          background: 'var(--surface-sunken)', 
          padding: '6px', 
          borderRadius: '12px', 
          gap: '4px',
          alignItems: 'center',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border)'
        }}>
          {['all', 'today', 'week', 'month', 'quarter', 'custom'].map((f) => (
            <button
              key={f}
              onClick={() => setFilterType(f as FilterType)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: filterType === f ? 'var(--info)' : 'transparent',
                color: filterType === f ? 'white' : 'var(--ink-muted)',
                fontWeight: filterType === f ? '600' : '500',
                cursor: 'pointer',
                fontSize: '13px',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                textTransform: 'capitalize'
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
      </header>

      {/* Custom Period Inputs */}
      {filterType === 'custom' && (
        <div className="custom-period-bar" style={{ 
          display: 'flex', 
          gap: '16px', 
          marginBottom: '24px', 
          alignItems: 'center',
          padding: '16px',
          background: 'var(--surface-card)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          width: 'fit-content'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>Du</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)}
              style={{ 
                padding: '8px 12px', 
                borderRadius: '8px', 
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                fontSize: '14px'
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>Au</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)}
              style={{ 
                padding: '8px 12px', 
                borderRadius: '8px', 
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                fontSize: '14px'
              }}
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="empty-state" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="material-symbols-rounded" style={{ fontSize: '48px', marginBottom: '16px', animation: 'spin 2s linear infinite' }}>sync</div>
          <div className="text-xl">Chargement des statistiques...</div>
        </div>
      ) : contracts.length === 0 ? (
        <div className="empty-state" style={{ padding: "80px 20px" }}>
          <span className="material-symbols-rounded" style={{ fontSize: "64px", color: "var(--border)", marginBottom: "20px" }}>bar_chart_off</span>
          <h2 style={{ color: "var(--ink-muted)", marginBottom: "8px" }}>Aucune donnée pour cette période</h2>
          <p>Ajustez les filtres ou commencez par ajouter des contrats.</p>
        </div>
      ) : (
        <>
          {/* Hero Stats */}
          <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px", marginBottom: "32px" }}>
            <div className="stat-card">
              <div className="stat-icon-box" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}>
                <span className="material-symbols-rounded">description</span>
              </div>
              <div>
                <div className="stat-label">Total Contrats</div>
                <div className="stat-value">{totalContracts}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon-box" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
                <span className="material-symbols-rounded">group</span>
              </div>
              <div>
                <div className="stat-label">Sexe Ratio (H/F)</div>
                <div className="stat-value">
                  {contracts.filter(c => (c.gender as any) === 'Homme').length} / {contracts.filter(c => (c.gender as any) === 'Femme').length}
                </div>
              </div>
            </div>
          </div>

          <div className="charts-main-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))", gap: "24px" }}>
            
            {/* Evolution Chart */}
            <div className="chart-card">
              <h3 className="chart-title">Evolution des saisies ({filterType === 'today' || filterType === 'week' ? 'Quotidien' : 'Mensuel'})</h3>
              <div style={{ height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={evolutionData}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis 
                      dataKey="date" 
                      stroke="var(--ink-muted)" 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(val) => {
                        if (filterType === 'today' || filterType === 'week') {
                          return val.split('-').slice(1).reverse().join('/');
                        }
                        return val;
                      }}
                    />
                    <YAxis stroke="var(--ink-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', background: 'var(--surface-card)', color: 'var(--ink)' }}
                    />
                    <Area type="monotone" dataKey="count" stroke="#6366f1" fillOpacity={1} fill="url(#colorCount)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gender Distribution */}
            <div className="chart-card">
              <h3 className="chart-title">Répartition par Genre</h3>
              <div style={{ height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={genderData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {genderData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', background: 'var(--surface-card)' }} />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Status Distribution */}
            <div className="chart-card">
              <h3 className="chart-title">État des Contrats</h3>
              <div style={{ height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" stroke="var(--ink-muted)" fontSize={12} width={100} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', background: 'var(--surface-card)' }} />
                    <Bar dataKey="count" fill="#818cf8" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Assignments */}
            <div className="chart-card">
              <h3 className="chart-title">Top Affectations</h3>
              <div style={{ height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={assignmentData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--ink-muted)" fontSize={10} tick={{angle: -45, textAnchor: 'end'}} height={70} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--ink-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', background: 'var(--surface-card)' }} />
                    <Bar dataKey="count" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
