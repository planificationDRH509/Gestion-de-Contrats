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
import { MultiSelectDropdown } from "../../app/components/MultiSelectDropdown";
import { calculateFinancialStatistics } from "./financialStatistics";

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#14b8a6', '#f43f5e'];
const HTG_FORMATTER = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});
const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});

type FilterType = 'all' | 'today' | 'week' | 'month' | 'quarter' | 'custom';

interface PremiumCardProps {
  staggerClass?: string;
  glowColor?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

function PremiumCard({ staggerClass = "", glowColor, style, children }: PremiumCardProps) {
  const cardStyle = useMemo(() => {
    return {
      ...style,
      '--glow-color': glowColor,
    } as React.CSSProperties;
  }, [style, glowColor]);

  return (
    <div className={`premium-card ${staggerClass}`} style={cardStyle}>
      {children}
    </div>
  );
}

function formatHtg(value: number) {
  return `${HTG_FORMATTER.format(Math.round(value))} HTG`;
}

function formatCompactHtg(value: number) {
  return `${COMPACT_NUMBER_FORMATTER.format(value)} HTG`;
}

interface FinancialMetricCardProps {
  icon: string;
  label: string;
  value: string;
  exactValue: string;
  detail: string;
  tone: "gold" | "green" | "blue" | "purple";
}

function FinancialMetricCard({
  icon,
  label,
  value,
  exactValue,
  detail,
  tone
}: FinancialMetricCardProps) {
  return (
    <PremiumCard
      staggerClass="stagger-2"
      glowColor="rgba(180, 132, 27, 0.1)"
      style={{ padding: "20px" }}
    >
      <div className="financial-metric-card">
        <div className={`financial-metric-icon ${tone}`}>
          <span className="material-symbols-rounded">{icon}</span>
        </div>
        <div className="financial-metric-copy">
          <span>{label}</span>
          <strong title={exactValue}>{value}</strong>
          <small>{detail}</small>
        </div>
      </div>
    </PremiumCard>
  );
}

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
  const [selectedAssignments, setSelectedAssignments] = useState<string[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Fetch all contracts (using a large pageSize for stats)
  const { data, isLoading } = useContractsList({
    workspaceId,
    pageSize: 5000 // Get up to 5000 contracts for more accurate statistics
  });

  const rawContracts = data?.items ?? [];

  const uniqueAssignments = useMemo(() => {
    return Array.from(new Set(rawContracts.map(c => c.assignment).filter(Boolean))).sort();
  }, [rawContracts]);

  const uniquePositions = useMemo(() => {
    return Array.from(new Set(rawContracts.map(c => c.position).filter(Boolean))).sort();
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
      
      // Multi-select assignment filter (cumulative)
      const assignmentMatch = selectedAssignments.length === 0 
        ? true 
        : selectedAssignments.includes(c.assignment);

      // Multi-select position filter (cumulative)
      const positionMatch = selectedPositions.length === 0
        ? true
        : selectedPositions.includes(c.position);
      
      return dateMatch && statusMatch && assignmentMatch && positionMatch;
    });
  }, [rawContracts, filterType, startDate, endDate, statusFilter, selectedAssignments, selectedPositions, fiscalYear]);

  const contracts = filteredContracts;
  const financialStats = useMemo(
    () => calculateFinancialStatistics(contracts, fiscalYear),
    [contracts, fiscalYear]
  );

  // 3. STATS DATA & CALCULATIONS
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
    
    // Choose granularity based on filter
    const isShortPeriod = filterType === 'today' || filterType === 'week' || filterType === 'month';
    
    contracts.forEach(c => {
      const date = new Date(c.createdAt);
      
      const key = isShortPeriod 
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      counts[key] = (counts[key] || 0) + 1;
    });

    let result = Object.entries(counts)
      .map(([date, count]) => ({ date, count: count as number }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Si échelle journalière (filtre jour/semaine/mois), exclure dynamiquement les journées 
    // d'activité résiduelle négligeable (week-ends, jours fériés, ponts avec 1 seul contrat).
    if (isShortPeriod && result.length > 0) {
      const totalCount = result.reduce((sum, item) => sum + item.count, 0);
      const avgPerDay = totalCount / result.length;

      // Si l'activité moyenne par jour est significative (> 4 contrats/jour en moyenne),
      // on écarte les jours d'activité isolée (<= 1 contrat) pour lisser les jours OFF.
      if (avgPerDay > 4) {
        result = result.filter(item => item.count >= 2);
      }
    }

    return result;
  }, [contracts, filterType]);

  // 4. MAIN RENDER & SMART CALCULATIONS
  const totalContracts = contracts.length;

  // Gender Calculations
  const totalGenders = contracts.filter(c => c.gender === 'Homme' || c.gender === 'Femme').length || 1;
  const hommeCount = contracts.filter(c => c.gender === 'Homme').length;
  const femmeCount = contracts.filter(c => c.gender === 'Femme').length;
  const hommePct = Math.round((hommeCount / totalGenders) * 100);
  const femmePct = 100 - hommePct;

  // Parity Status
  const { parityLabel, parityColor, parityBg } = useMemo(() => {
    const diff = Math.abs(hommePct - femmePct);
    if (diff <= 5) {
      return { parityLabel: "Parité Parfaite", parityColor: "#10b981", parityBg: "rgba(16, 185, 129, 0.1)" };
    } else if (diff <= 15) {
      return { parityLabel: "Bonne Parité", parityColor: "#3b82f6", parityBg: "rgba(59, 130, 246, 0.1)" };
    } else if (diff <= 30) {
      return { parityLabel: "Parité Modérée", parityColor: "#f59e0b", parityBg: "rgba(245, 158, 11, 0.1)" };
    } else {
      return { parityLabel: "Déséquilibre", parityColor: "#ef4444", parityBg: "rgba(239, 68, 68, 0.1)" };
    }
  }, [hommePct, femmePct]);

  // Automated Smart Insights
  const smartInsights = useMemo(() => {
    if (contracts.length === 0) return [];
    
    const insights = [];

    // 1. Top Employee
    if (createdByData.length > 0) {
      insights.push({
        title: "Collaborateur Vedette",
        value: createdByData[0].name,
        sub: `${createdByData[0].count} contrats saisis`,
        icon: "workspace_premium",
        color: "#f59e0b",
        bg: "rgba(245, 158, 11, 0.1)",
        glow: "rgba(245, 158, 11, 0.2)"
      });
    }

    // 2. Top Department
    if (assignmentData.length > 0) {
      insights.push({
        title: "Affectation Dominante",
        value: assignmentData[0].name,
        sub: `${assignmentData[0].count} contrats associés`,
        icon: "lan",
        color: "#10b981",
        bg: "rgba(16, 185, 129, 0.1)",
        glow: "rgba(16, 185, 129, 0.2)"
      });
    }

    // 3. Peak Period
    if (evolutionData.length > 0) {
      const sortedEvolution = [...evolutionData].sort((a, b) => b.count - a.count);
      const peak = sortedEvolution[0];
      let dateStr = peak.date;
      if (filterType !== 'all' && filterType !== 'custom') {
        dateStr = peak.date.split('-').slice(1).reverse().join('/');
      }
      insights.push({
        title: "Pic d'Activité",
        value: dateStr,
        sub: `${peak.count} contrats saisis`,
        icon: "trending_up",
        color: "#6366f1",
        bg: "rgba(99, 102, 241, 0.1)",
        glow: "rgba(99, 102, 241, 0.2)"
      });
    }

    // 4. Most Common Duration
    if (durationData.length > 0) {
      insights.push({
        title: "Durée Majoritaire",
        value: durationData[0].name,
        sub: `${durationData[0].count} contrats`,
        icon: "hourglass_empty",
        color: "#06b6d4",
        bg: "rgba(6, 182, 212, 0.1)",
        glow: "rgba(6, 182, 212, 0.2)"
      });
    }

    return insights;
  }, [contracts, createdByData, assignmentData, evolutionData, durationData, filterType]);

  // Premium Custom Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const isPie = label === undefined || label === null || label === '';
      const displayLabel = isPie ? payload[0].name : label;
      const displayName = isPie ? "Contrats" : (payload[0].name === 'count' ? 'Contrats' : payload[0].name);
      return (
        <div style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '14px 18px',
          boxShadow: 'var(--shadow-premium)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <span style={{ fontSize: '11px', color: 'var(--ink-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{displayLabel}</span>
          <span style={{ fontSize: '15px', color: 'var(--ink)', fontWeight: '800' }}>
            {displayName} : <span style={{ color: payload[0].color || 'var(--accent)' }}>{payload[0].value}</span>
          </span>
        </div>
      );
    }
    return null;
  };

  const BudgetTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;

    const month = payload[0].payload;
    return (
      <div className="statistics-chart-tooltip">
        <span>{month.label}</span>
        <strong>{formatHtg(month.monthlyBudget)}</strong>
        <small>
          {month.activeContracts} contrat{month.activeContracts > 1 ? "s" : ""} actif
          {month.activeContracts > 1 ? "s" : ""}
        </small>
      </div>
    );
  };

  const isAdvancedFilterActive = statusFilter !== 'all' || selectedAssignments.length > 0 || selectedPositions.length > 0;
  const financialCoverage = totalContracts > 0
    ? Math.round((financialStats.validContracts / totalContracts) * 100)
    : 0;
  const budgetTrendLabel =
    financialStats.trendDirection === "up"
      ? "En hausse"
      : financialStats.trendDirection === "down"
        ? "En baisse"
        : "Stable";
  const budgetTrendIcon =
    financialStats.trendDirection === "up"
      ? "trending_up"
      : financialStats.trendDirection === "down"
        ? "trending_down"
        : "trending_flat";

  return (
    <div className="page-container statistics-page">
      {/* 0. INJECTED STYLES FOR DYNAMIC INTERACTIONS */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideUpAndFade {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .premium-card {
          background: var(--surface-card);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 32px;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
          overflow: hidden;
          animation: slideUpAndFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .premium-card:hover {
          transform: translateY(-6px);
          box-shadow: var(--shadow-premium), 0 12px 30px -4px var(--glow-color, rgba(99, 102, 241, 0.12));
          border-color: var(--accent);
        }

        .stagger-1 { animation-delay: 50ms; }
        .stagger-2 { animation-delay: 100ms; }
        .stagger-3 { animation-delay: 150ms; }
        .stagger-4 { animation-delay: 200ms; }
        .stagger-5 { animation-delay: 250ms; }
        .stagger-6 { animation-delay: 300ms; }

        .filter-pills-container {
          display: flex;
          background: var(--surface-sunken);
          padding: 4px;
          border-radius: 16px;
          gap: 2px;
          align-items: center;
          border: 1px solid var(--border);
        }

        .filter-pill {
          padding: 10px 18px;
          border-radius: 12px;
          border: none;
          background: transparent;
          color: var(--ink-muted);
          font-weight: 600;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .filter-pill:hover {
          color: var(--ink);
          background: rgba(0,0,0,0.02);
        }

        [data-theme='dark'] .filter-pill:hover {
          background: rgba(255,255,255,0.02);
        }

        .filter-pill.active {
          background: var(--accent);
          color: white;
          font-weight: 700;
          box-shadow: 0 4px 14px var(--accent-soft);
        }

        .accent-select {
          border: 1px solid var(--border);
          background: var(--surface-card);
          color: var(--ink);
          font-weight: 700;
          font-size: 14px;
          padding: 8px 16px;
          border-radius: 14px;
          outline: none;
          cursor: pointer;
          transition: all 0.25s ease;
        }

        .accent-select:hover {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }

        .insights-grid {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .insight-row {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px 18px;
          background: var(--surface-sunken);
          border-radius: 16px;
          border: 1px solid transparent;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .insight-row:hover {
          background: var(--surface-card);
          border-color: var(--border);
          transform: translateX(6px);
          box-shadow: var(--shadow);
        }

        .glowing-icon {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.02);
          transition: transform 0.3s ease;
        }

        .insight-row:hover .glowing-icon {
          transform: scale(1.1) rotate(5deg);
        }

        .parity-progress-bar {
          height: 12px;
          border-radius: 999px;
          background: var(--surface-sunken);
          position: relative;
          overflow: hidden;
          display: flex;
          border: 1px solid var(--border);
        }

        .gender-fill-male {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6, #60a5fa);
          transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.3);
        }

        .gender-fill-female {
          height: 100%;
          background: linear-gradient(90deg, #f472b6, #ec4899);
          transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 0 10px rgba(236, 72, 153, 0.3);
        }
      ` }} />

      {/* GRADIENTS FOR RECHARTS DEFINITIONS */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="indigoPurple" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.0} />
          </linearGradient>
          <linearGradient id="emeraldTeal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#059669" stopOpacity={0.9} />
          </linearGradient>
          <linearGradient id="orangeRose" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
          <linearGradient id="cyanBlue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="royalBlue" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
      </svg>

      {/* 1. HEADER PANEL */}
      <header className="section-header statistics-header" style={{
        marginBottom: "32px", 
        padding: "24px 32px",
        display: 'flex', 
        flexDirection: 'column', 
        gap: '24px', 
        background: 'var(--surface-card)', 
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow)',
        borderRadius: '24px',
        animation: 'slideUpAndFade 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        <div className="statistics-header-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '24px' }}>
          <div>
            <span className="page-eyebrow">Vue d'ensemble</span>
            <h1 className="section-title">Statistiques</h1>
          </div>

          <div className="statistics-header-controls" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Fiscal Year Selector */}
            <div className="fiscal-year-control" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface-sunken)', padding: '6px 14px', borderRadius: '16px', border: '1px solid var(--border)' }}>
              <span className="material-symbols-rounded" style={{ color: 'var(--accent)', fontSize: '20px' }}>calendar_month</span>
              <select 
                value={fiscalYear} 
                onChange={e => setFiscalYear(e.target.value)}
                style={{ 
                  border: 'none', 
                  background: 'transparent', 
                  fontWeight: 700, 
                  color: 'var(--ink)', 
                  fontSize: '14px',
                  cursor: 'pointer',
                  outline: 'none',
                  paddingRight: '4px'
                }}
              >
                {fiscalYears.map(year => (
                  <option key={year} value={year}>Exercice {year}</option>
                ))}
              </select>
            </div>

            {/* Time Filter Bar */}
            <div className="filter-pills-container">
              {(['all', 'today', 'week', 'month', 'quarter', 'custom'] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={`filter-pill ${filterType === f ? 'active' : ''}`}
                >
                  {f === 'all' ? 'Tous' : 
                   f === 'today' ? "Aujourd'hui" : 
                   f === 'week' ? 'Semaine' : 
                   f === 'month' ? 'Mois' : 
                   f === 'quarter' ? 'Trimestre' : 'Personnalisé'}
                </button>
              ))}
            </div>

            {/* Advanced Filters Button */}
            <button
              className="statistics-advanced-toggle"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 18px',
                borderRadius: '16px',
                border: '1px solid var(--border)',
                background: showAdvancedFilters ? 'var(--accent)' : 'var(--surface-sunken)',
                color: showAdvancedFilters ? 'var(--accent-contrast)' : 'var(--ink)',
                fontWeight: '700',
                cursor: 'pointer',
                fontSize: '13.5px',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: showAdvancedFilters ? '0 4px 12px var(--accent-soft)' : 'none'
              }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>tune</span>
              Filtres Avancés
              {isAdvancedFilterActive && (
                <span style={{ 
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: showAdvancedFilters ? 'var(--panel)' : 'var(--accent)',
                  color: showAdvancedFilters ? 'var(--ink)' : 'var(--accent-contrast)',
                  borderRadius: '50%',
                  width: '18px',
                  height: '18px',
                  fontSize: '10px',
                  fontWeight: '800'
                }}>!</span>
              )}
            </button>
          </div>
        </div>

        {/* 2. ADVANCED FILTERS PANEL */}
        {showAdvancedFilters && (
          <div className="statistics-advanced-panel" style={{
            display: 'flex', 
            gap: '20px', 
            alignItems: 'center', 
            flexWrap: 'wrap',
            background: 'var(--surface-sunken)',
            padding: '20px',
            borderRadius: '20px',
            border: '1px solid var(--border)',
            width: '100%',
            animation: 'slideUpAndFade 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-rounded" style={{ color: 'var(--accent)', fontSize: '20px' }}>filter_alt</span>
              <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Critères :</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '13px', color: 'var(--ink-muted)', fontWeight: 600 }}>Statut</label>
              <select 
                value={statusFilter} 
                onChange={e => setStatusFilter(e.target.value)}
                className="accent-select"
                style={{ height: '38px', minWidth: '150px' }}
              >
                <option value="all">Tous les statuts</option>
                {Object.entries(statusLabels).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <MultiSelectDropdown
              label="Affectation"
              options={uniqueAssignments}
              selectedValues={selectedAssignments}
              onChange={setSelectedAssignments}
              placeholder="Toutes les affectations"
            />

            <MultiSelectDropdown
              label="Fonction"
              options={uniquePositions}
              selectedValues={selectedPositions}
              onChange={setSelectedPositions}
              placeholder="Toutes les fonctions"
            />

            {filterType === 'custom' && (
              <div className="statistics-custom-range" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: 'auto', background: 'var(--surface-card)', padding: '6px 12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={e => setStartDate(e.target.value)}
                  style={{ border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: '13px', fontWeight: 600, outline: 'none' }}
                />
                <span style={{ color: 'var(--border)', fontWeight: 800 }}>→</span>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={e => setEndDate(e.target.value)}
                  style={{ border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: '13px', fontWeight: 600, outline: 'none' }}
                />
              </div>
            )}
          </div>
        )}
      </header>

      {isLoading ? (
        <div className="premium-card" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderColor: 'var(--border)' }}>
          <div className="material-symbols-rounded" style={{ fontSize: '48px', marginBottom: '16px', color: 'var(--accent)', animation: 'spin 1.5s linear infinite' }}>sync</div>
          <div style={{ color: 'var(--ink-muted)', fontSize: '16px', fontWeight: '600' }}>Extraction des tendances de contrats...</div>
        </div>
      ) : contracts.length === 0 ? (
        <div className="premium-card stagger-2" style={{ padding: "80px 20px", textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', borderColor: 'var(--border)' }}>
          <span className="material-symbols-rounded" style={{ fontSize: "72px", color: "var(--border)", marginBottom: "20px" }}>analytics</span>
          <h2 style={{ color: "var(--ink)", marginBottom: "8px", fontSize: '22px', fontFamily: "var(--font-heading)", fontWeight: 800 }}>Aucune donnée disponible</h2>
          <p style={{ color: 'var(--ink-muted)', fontSize: '15px', maxWidth: '420px', margin: 0 }}>Aucun contrat ne correspond à vos filtres pour l'exercice sélectionné. Modifiez vos critères pour élargir la recherche.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* 3. HERO STATS GRID */}
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", 
            gap: "24px"
          }}>
            
            <PremiumCard 
              staggerClass="stagger-1" 
              glowColor="rgba(59, 130, 246, 0.12)"
              style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '24px 28px' }}
            >
              <div style={{ 
                width: '56px', 
                height: '56px', 
                borderRadius: '16px', 
                background: 'var(--info-soft)', 
                color: 'var(--info)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: '0 8px 16px -4px rgba(59, 130, 246, 0.1)'
              }}>
                <span className="material-symbols-rounded" style={{ fontSize: '28px' }}>description</span>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--ink-muted)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Total Contrats</div>
                <div style={{ fontSize: '26px', fontWeight: '900', color: 'var(--ink)', fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{totalContracts}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--success)', fontWeight: '600', marginTop: '4px' }}>
                  {contracts.filter(c => c.status === 'signe').length} validés & signés
                </div>
              </div>
            </PremiumCard>

            <PremiumCard 
              staggerClass="stagger-2" 
              glowColor="rgba(16, 185, 129, 0.12)"
              style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '24px 28px' }}
            >
              <div style={{ 
                width: '56px', 
                height: '56px', 
                borderRadius: '16px', 
                background: 'var(--success-soft)', 
                color: 'var(--success)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: '0 8px 16px -4px rgba(16, 185, 129, 0.1)'
              }}>
                <span className="material-symbols-rounded" style={{ fontSize: '28px' }}>lan</span>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--ink-muted)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Affectations</div>
                <div style={{ fontSize: '26px', fontWeight: '900', color: 'var(--ink)', fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{uniqueAssignments.length}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--ink-muted)', fontWeight: '600', marginTop: '4px' }}>
                  Départements distincts
                </div>
              </div>
            </PremiumCard>

            <PremiumCard 
              staggerClass="stagger-3" 
              glowColor="rgba(245, 158, 11, 0.12)"
              style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '24px 28px' }}
            >
              <div style={{ 
                width: '56px', 
                height: '56px', 
                borderRadius: '16px', 
                background: 'var(--warning-soft)', 
                color: 'var(--warning)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: '0 8px 16px -4px rgba(245, 158, 11, 0.1)'
              }}>
                <span className="material-symbols-rounded" style={{ fontSize: '28px' }}>group</span>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--ink-muted)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Collaborateurs</div>
                <div style={{ fontSize: '26px', fontWeight: '900', color: 'var(--ink)', fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{createdByData.length}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--warning)', fontWeight: '600', marginTop: '4px' }}>
                  Opérateurs actifs
                </div>
              </div>
            </PremiumCard>

            {/* Premium Gender Card */}
            <PremiumCard 
              staggerClass="stagger-4" 
              glowColor="rgba(236, 72, 153, 0.12)"
              style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '24px 28px' }}
            >
              <div style={{ 
                width: '56px', 
                height: '56px', 
                borderRadius: '16px', 
                background: 'rgba(236, 72, 153, 0.08)', 
                color: '#ec4899', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: '0 8px 16px -4px rgba(236, 72, 153, 0.1)'
              }}>
                <span className="material-symbols-rounded" style={{ fontSize: '28px' }}>wc</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--ink-muted)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Mixité H/F</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '800', color: '#3b82f6' }}>{hommePct}% <span style={{ fontSize: '11px', fontWeight: 500 }}>H ({hommeCount})</span></span>
                  <span style={{ fontSize: '10px', background: parityBg, color: parityColor, padding: '2px 8px', borderRadius: '8px', fontWeight: '700' }}>
                    {parityLabel}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: '800', color: '#ec4899' }}>{femmePct}% <span style={{ fontSize: '11px', fontWeight: 500 }}>F ({femmeCount})</span></span>
                </div>
                {/* Custom glowing progress bar */}
                <div className="parity-progress-bar">
                  <div className="gender-fill-male" style={{ width: `${hommePct}%` }} />
                  <div className="gender-fill-female" style={{ width: `${femmePct}%` }} />
                </div>
              </div>
            </PremiumCard>

          </div>

          {/* 4. FINANCIAL OUTLOOK */}
          <section className="financial-section" aria-labelledby="financial-section-title">
            <div className="financial-section-heading">
              <div>
                <span className="page-eyebrow">Pilotage financier</span>
                <h2 id="financial-section-title">Projection budgétaire</h2>
                <p>
                  Engagements calculés à partir du salaire mensuel et de la durée de chaque contrat.
                </p>
              </div>
              <div className="financial-data-coverage">
                <span className="material-symbols-rounded">verified</span>
                {financialCoverage}% des contrats exploitables
              </div>
            </div>

            <div className="financial-kpi-grid">
              <FinancialMetricCard
                icon="account_balance_wallet"
                label="Budget total engagé"
                value={formatCompactHtg(financialStats.totalCommittedBudget)}
                exactValue={formatHtg(financialStats.totalCommittedBudget)}
                detail={`${formatCompactHtg(financialStats.monthlySalaryBase)} de salaires mensuels cumulés`}
                tone="gold"
              />
              <FinancialMetricCard
                icon="calendar_month"
                label="Projection de l'exercice"
                value={formatCompactHtg(financialStats.fiscalYearProjectedBudget)}
                exactValue={formatHtg(financialStats.fiscalYearProjectedBudget)}
                detail={`Charge estimée pour l'exercice ${fiscalYear}`}
                tone="green"
              />
              <FinancialMetricCard
                icon="monitoring"
                label="Pic mensuel projeté"
                value={formatCompactHtg(financialStats.peakMonthlyBudget)}
                exactValue={formatHtg(financialStats.peakMonthlyBudget)}
                detail={financialStats.peakMonthLabel || "Aucun mois actif"}
                tone="blue"
              />
              <FinancialMetricCard
                icon="request_quote"
                label="Coût moyen par contrat"
                value={formatCompactHtg(financialStats.averageContractBudget)}
                exactValue={formatHtg(financialStats.averageContractBudget)}
                detail={`${financialStats.validContracts} contrat${financialStats.validContracts > 1 ? "s" : ""} valorisé${financialStats.validContracts > 1 ? "s" : ""}`}
                tone="purple"
              />
            </div>

            <div className="financial-detail-grid">
              <PremiumCard
                staggerClass="stagger-3"
                glowColor="rgba(180, 132, 27, 0.08)"
                style={{ gridColumn: "span 8" }}
              >
                <div className="financial-chart-header">
                  <div>
                    <h3>Tendance du budget mensuel</h3>
                    <span>Charge salariale estimée sur les mois couverts par les contrats</span>
                  </div>
                  <div className={`financial-trend-badge ${financialStats.trendDirection}`}>
                    <span className="material-symbols-rounded">{budgetTrendIcon}</span>
                    {budgetTrendLabel}
                    {financialStats.trendPercent !== 0
                      ? ` · ${financialStats.trendPercent > 0 ? "+" : ""}${financialStats.trendPercent}%`
                      : ""}
                  </div>
                </div>

                <div className="financial-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={financialStats.monthlyTrend}
                      margin={{ top: 12, right: 10, left: 6, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="budgetGold" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#b4841b" stopOpacity={0.42} />
                          <stop offset="100%" stopColor="#b4841b" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="4 4"
                        vertical={false}
                        stroke="var(--border)"
                        opacity={0.45}
                      />
                      <XAxis
                        dataKey="shortLabel"
                        stroke="var(--ink-muted)"
                        fontSize={11}
                        fontWeight={600}
                        tickLine={false}
                        axisLine={false}
                        dy={8}
                      />
                      <YAxis
                        stroke="var(--ink-muted)"
                        fontSize={11}
                        fontWeight={600}
                        tickLine={false}
                        axisLine={false}
                        width={74}
                        tickFormatter={(value) => COMPACT_NUMBER_FORMATTER.format(value)}
                      />
                      <Tooltip content={<BudgetTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="monthlyBudget"
                        name="Budget mensuel"
                        stroke="#b4841b"
                        fill="url(#budgetGold)"
                        fillOpacity={1}
                        strokeWidth={3}
                        activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--panel)", fill: "#b4841b" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </PremiumCard>

              <PremiumCard
                staggerClass="stagger-4"
                glowColor="rgba(16, 185, 129, 0.08)"
                style={{ gridColumn: "span 4" }}
              >
                <div className="financial-breakdown-header">
                  <h3>Poids budgétaire</h3>
                  <span>Affectations les plus engagées</span>
                </div>

                <div className="financial-assignment-list">
                  {financialStats.topAssignments.map((assignment, index) => (
                    <div className="financial-assignment-row" key={assignment.name}>
                      <div className="financial-assignment-label">
                        <span>{index + 1}</span>
                        <strong title={assignment.name}>{assignment.name}</strong>
                        <small>{formatCompactHtg(assignment.budget)}</small>
                      </div>
                      <div className="financial-assignment-track">
                        <span style={{ width: `${assignment.share}%` }} />
                      </div>
                      <div className="financial-assignment-share">
                        {Math.round(assignment.share)}%
                      </div>
                    </div>
                  ))}
                </div>

                <div className="financial-method-note">
                  <span className="material-symbols-rounded">info</span>
                  <p>
                    Projection estimative&nbsp;: les contrats sont répartis jusqu'à la fin de
                    l'exercice selon leur durée. Les montants représentent les salaires bruts,
                    hors taxes et avantages.
                  </p>
                </div>
              </PremiumCard>
            </div>
          </section>

          {/* 4. MAIN CHARTS AREA & SMART INSIGHTS PANEL */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "32px" }}>
            
            {/* Evolution Area Chart (8 Columns) */}
            <PremiumCard 
              staggerClass="stagger-5" 
              glowColor="rgba(99, 102, 241, 0.08)"
              style={{ gridColumn: "span 8" }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '900', color: 'var(--ink)', margin: 0, fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>Dynamique Temporelle</h3>
                  <span style={{ fontSize: '12px', color: 'var(--ink-muted)', fontWeight: 500 }}>Évolution du volume mensuel des saisies de contrats</span>
                </div>
                <span style={{ fontSize: '11px', background: 'var(--accent-soft)', padding: '6px 12px', borderRadius: '10px', color: 'var(--accent)', fontWeight: '800', letterSpacing: '0.05em' }}>FRÉQUENCE</span>
              </div>
              
              <div style={{ height: "350px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={evolutionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" opacity={0.3} />
                    <XAxis 
                      dataKey="date" 
                      stroke="var(--ink-muted)" 
                      fontSize={11} 
                      fontWeight={600}
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
                    <YAxis stroke="var(--ink-muted)" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} dx={-10} />
                    
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="count" 
                      name="Contrats" 
                      stroke="#6366f1" 
                      fillOpacity={1} 
                      fill="url(#indigoPurple)" 
                      strokeWidth={3} 
                      activeDot={{ r: 6, strokeWidth: 0, fill: '#6366f1' }} 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </PremiumCard>

            {/* Smart Insights Panel (4 Columns) */}
            <PremiumCard 
              staggerClass="stagger-6" 
              glowColor="rgba(245, 158, 11, 0.08)"
              style={{ gridColumn: "span 4", display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: '18px', fontWeight: '900', color: 'var(--ink)', margin: 0, fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>Analyses & Tendances</h3>
                <span style={{ fontSize: '12px', color: 'var(--ink-muted)', fontWeight: 500 }}>Fins calculs issus de vos filtres actifs</span>
              </div>

              <div className="insights-grid" style={{ flex: 1, justifyContent: 'center' }}>
                {smartInsights.map((insight, idx) => (
                  <div key={idx} className="insight-row">
                    <div className="glowing-icon" style={{ background: insight.bg, color: insight.color, boxShadow: `0 8px 20px -6px ${insight.glow}` }}>
                      <span className="material-symbols-rounded">{insight.icon}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink-muted)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{insight.title}</div>
                      <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>{insight.value}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink-muted)', fontWeight: '500', marginTop: '1px' }}>{insight.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </PremiumCard>

            {/* Top 10 Assignments (8 Columns) */}
            <PremiumCard 
              staggerClass="stagger-1" 
              glowColor="rgba(16, 185, 129, 0.06)"
              style={{ gridColumn: "span 8" }}
            >
              <div style={{ marginBottom: "28px" }}>
                <h3 style={{ fontSize: '18px', fontWeight: '900', color: 'var(--ink)', margin: 0, fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>Top 10 Affectations</h3>
                <span style={{ fontSize: '12px', color: 'var(--ink-muted)', fontWeight: 500 }}>Répartition par pôle administratif majoritaire</span>
              </div>
              <div style={{ height: "360px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={assignmentData} margin={{ top: 10, right: 10, left: -20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" opacity={0.3} />
                    <XAxis 
                      dataKey="name" 
                      stroke="var(--ink-muted)" 
                      fontSize={11} 
                      fontWeight={600}
                      tick={{ angle: -30, textAnchor: 'end', fill: 'var(--ink)' }} 
                      height={60} 
                      tickLine={false} 
                      axisLine={false} 
                      interval={0} 
                    />
                    <YAxis stroke="var(--ink-muted)" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} dx={-10} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-sunken)', opacity: 0.4 }} />
                    <Bar dataKey="count" fill="url(#emeraldTeal)" radius={[8, 8, 0, 0]} barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PremiumCard>

            {/* Status Distribution (4 Columns) */}
            <PremiumCard 
              staggerClass="stagger-2" 
              glowColor="rgba(244, 63, 94, 0.06)"
              style={{ gridColumn: "span 4" }}
            >
              <div style={{ marginBottom: "28px" }}>
                <h3 style={{ fontSize: '18px', fontWeight: '900', color: 'var(--ink)', margin: 0, fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>État d'Avancement</h3>
                <span style={{ fontSize: '12px', color: 'var(--ink-muted)', fontWeight: 500 }}>Classement par étapes du flux de signature</span>
              </div>
              <div style={{ height: "360px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData} layout="vertical" margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="var(--border)" opacity={0.3} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" stroke="var(--ink-muted)" fontSize={11} width={100} tickLine={false} axisLine={false} tick={{ fill: 'var(--ink)', fontWeight: 600 }} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-sunken)', opacity: 0.4 }} />
                    <Bar dataKey="count" fill="url(#orangeRose)" radius={[0, 8, 8, 0]} barSize={16}>
                      {statusData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PremiumCard>

            {/* Performance Individuelle (3 Columns) */}
            <PremiumCard 
              staggerClass="stagger-3" 
              glowColor="rgba(59, 130, 246, 0.06)"
              style={{ gridColumn: "span 3" }}
            >
              <div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: '17px', fontWeight: '900', color: 'var(--ink)', margin: 0, fontFamily: 'var(--font-heading)' }}>Saisies par Employé</h3>
                <span style={{ fontSize: '12px', color: 'var(--ink-muted)', fontWeight: 500 }}>Volume de contrats créés</span>
              </div>
              <div style={{ height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={createdByData} layout="vertical" margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="var(--border)" opacity={0.3} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" stroke="var(--ink-muted)" fontSize={11} width={100} tickLine={false} axisLine={false} tick={{ fill: 'var(--ink)', fontWeight: 600 }} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-sunken)', opacity: 0.4 }} />
                    <Bar dataKey="count" fill="url(#royalBlue)" radius={[0, 6, 6, 0]} barSize={16}>
                      {createdByData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PremiumCard>

            {/* Top 8 Postes (3 Columns) */}
            <PremiumCard 
              staggerClass="stagger-4" 
              glowColor="rgba(139, 92, 246, 0.06)"
              style={{ gridColumn: "span 3" }}
            >
              <div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: '17px', fontWeight: '900', color: 'var(--ink)', margin: 0, fontFamily: 'var(--font-heading)' }}>Top 8 Postes</h3>
                <span style={{ fontSize: '12px', color: 'var(--ink-muted)', fontWeight: 500 }}>Fonctions les plus représentées</span>
              </div>
              <div style={{ height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={positionData} layout="vertical" margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="var(--border)" opacity={0.3} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" stroke="var(--ink-muted)" fontSize={10} width={100} tickLine={false} axisLine={false} tick={{ fill: 'var(--ink)' }} />
                    <Bar dataKey="count" fill="url(#cyanBlue)" radius={[0, 6, 6, 0]} barSize={12}>
                      {positionData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 1) % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PremiumCard>

            {/* Durée des Contrats (3 Columns) */}
            <PremiumCard 
              staggerClass="stagger-5" 
              glowColor="rgba(20, 184, 166, 0.06)"
              style={{ gridColumn: "span 3" }}
            >
              <div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: '17px', fontWeight: '900', color: 'var(--ink)', margin: 0, fontFamily: 'var(--font-heading)' }}>Durées des Contrats</h3>
                <span style={{ fontSize: '12px', color: 'var(--ink-muted)', fontWeight: 500 }}>Distribution selon les termes</span>
              </div>
              <div style={{ height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={durationData} margin={{ top: 10, right: 0, left: -30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" opacity={0.3} />
                    <XAxis dataKey="name" stroke="var(--ink-muted)" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} dy={8} />
                    <YAxis stroke="var(--ink-muted)" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} dx={-8} />
                    <Bar dataKey="count" fill="#14b8a6" radius={[6, 6, 0, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PremiumCard>

            {/* Mixité Générale (3 Columns - Donut Chart) */}
            <PremiumCard 
              staggerClass="stagger-6" 
              glowColor="rgba(236, 72, 153, 0.06)"
              style={{ gridColumn: "span 3", display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: '17px', fontWeight: '900', color: 'var(--ink)', margin: 0, fontFamily: 'var(--font-heading)' }}>Mixité Générale</h3>
                <span style={{ fontSize: '12px', color: 'var(--ink-muted)', fontWeight: 500 }}>Part par genre (Donut interactif)</span>
              </div>
              <div style={{ height: "300px", position: "relative" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={genderData}
                      cx="50%"
                      cy="45%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {genderData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.name === 'Homme' ? '#3b82f6' : entry.name === 'Femme' ? '#ec4899' : '#a0aec0'} 
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36} 
                      iconType="circle"
                      iconSize={10}
                      formatter={(value) => <span style={{ color: 'var(--ink)', fontSize: '11px', fontWeight: 600 }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Total text in center of donut */}
                <div style={{
                  position: 'absolute',
                  top: '45%',
                  left: '50%',
                  transform: 'translate(-50%, -60%)',
                  textAlign: 'center',
                  pointerEvents: 'none'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: '950', color: 'var(--ink)', fontFamily: 'var(--font-heading)', lineHeight: '1' }}>{totalContracts}</div>
                  <div style={{ fontSize: '9px', color: 'var(--ink-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>Total</div>
                </div>
              </div>
            </PremiumCard>

          </div>
        </div>
      )}
    </div>
  );
}
