/**
 * Centralized Design System Tokens for PreciSign
 * Palette inspired by Linear precision, SAP Fiori operational clarity,
 * and high-density document-first engineering tools.
 */

export const THEME = {
  colors: {
    // Primary Brand
    navy: '#192B3C',
    navyDark: '#12202D',
    navyLight: '#24394E',
    
    // Steel Blue Primary Accent & Actions
    steel: '#365C78',
    steelHover: '#2A4A62',
    steelLight: '#EBF2F7',
    steelBorder: '#C2D5E3',
    
    // Surface & Layout Canvas
    canvas: '#F5F6F8',
    surface: '#FFFFFF',
    surfaceSubtle: '#F9FAFB',
    surfaceHover: '#F1F5F9',
    
    // Neutral Hairline Borders
    border: '#E2E5E9',
    borderLight: '#EDF0F3',
    borderStrong: '#CBD5E1',
    
    // Typography
    textPrimary: '#192B3C',
    textSecondary: '#4B5563',
    textMuted: '#6B7280',
    textDisabled: '#9CA3AF',
    
    // Semantic States (WCAG AA compliant)
    status: {
      approved: {
        bg: '#F0FDF4',
        text: '#166534',
        border: '#BBF7D0',
        dot: '#16A34A',
        label: 'Approved',
      },
      pending: {
        bg: '#F0F9FF',
        text: '#075985',
        border: '#BAE6FD',
        dot: '#0284C7',
        label: 'Pending Approval',
      },
      returned: {
        bg: '#FFFBEB',
        text: '#92400E',
        border: '#FDE68A',
        dot: '#D97706',
        label: 'Returned for Correction',
      },
      rejected: {
        bg: '#FEF2F2',
        text: '#991B1B',
        border: '#FECACA',
        dot: '#DC2626',
        label: 'Rejected',
      },
      draft: {
        bg: '#F8FAFC',
        text: '#475569',
        border: '#E2E8F0',
        dot: '#64748B',
        label: 'Draft',
      },
    },
    
    // Priority Levels & Turnaround Targets
    priority: {
      urgent: {
        label: 'Urgent',
        target: 'Immediate / < 1 hour',
        badge: 'text-rose-700 bg-rose-50 border-rose-200',
        dot: 'bg-rose-600',
      },
      medium: {
        label: 'Medium',
        target: 'Within 3 days',
        badge: 'text-amber-800 bg-amber-50 border-amber-200',
        dot: 'bg-amber-600',
      },
      low: {
        label: 'Low',
        target: 'Within 7 days',
        badge: 'text-slate-700 bg-slate-100 border-slate-200',
        dot: 'bg-slate-500',
      },
    },
  },
  
  // Radius Scale: Consistent 6-8px Control Radii
  radii: {
    sm: 'rounded-sm', // 4px
    control: 'rounded-md', // 6px
    surface: 'rounded-lg', // 8px
    card: 'rounded-lg', // 8px
  },
  
  // Restrained Shadows (Zero glow)
  shadows: {
    subtle: 'shadow-xs',
    surface: 'shadow-xs',
    popover: 'shadow-md',
  },
} as const;
