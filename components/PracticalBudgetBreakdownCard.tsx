import React, { useState, useMemo } from 'react';
import {
  autoSplitBudget,
  calculatePracticalBudget,
  type PracticalBudgetDetails,
  type PracticalBudgetItem,
} from '@/constants/coimbatoreRoads';
import { AppColors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  budgetBreakdown?: PracticalBudgetDetails | null;
  issueType?: string;
  severity?: string;
  estimatedBudget?: number;
  estimatedBudgetDesc?: string;
  title?: string;
  showBoqToggle?: boolean;
  initiallyExpanded?: boolean;
}

export default function PracticalBudgetBreakdownCard({
  budgetBreakdown,
  issueType = 'pothole',
  severity = 'MEDIUM',
  estimatedBudget,
  estimatedBudgetDesc,
  title = 'Practical Budget & Resource Allocation',
  showBoqToggle = true,
  initiallyExpanded = false,
}: Props) {
  const [expandedBoq, setExpandedBoq] = useState(initiallyExpanded);

  // Compute 4-pillar budget allocation dynamically or use provided breakdown
  const details: PracticalBudgetDetails = useMemo(() => {
    if (estimatedBudget !== undefined && estimatedBudget !== null) {
      if (!budgetBreakdown || budgetBreakdown.budget !== estimatedBudget) {
        return autoSplitBudget(estimatedBudget, issueType, severity);
      }
    }
    if (budgetBreakdown && budgetBreakdown.breakdown?.length) {
      return budgetBreakdown;
    }
    return calculatePracticalBudget(issueType, severity);
  }, [budgetBreakdown, estimatedBudget, issueType, severity]);

  const totalAmount = estimatedBudget ?? details.budget;

  return (
    <View style={styles.card}>
      {/* Header with Title and Total */}
      <View style={styles.headerRow}>
        <View style={styles.headerIconWrap}>
          <Ionicons name="calculator-outline" size={20} color="#0D9488" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.totalValue}>₹{totalAmount.toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.inrBadge}>
          <Text style={styles.inrBadgeText}>4-Pillar Municipal Split</Text>
        </View>
      </View>

      {/* Scope / Description Summary */}
      <Text style={styles.scopeDesc}>
        {estimatedBudgetDesc || details.description}
      </Text>

      {/* Defect Physical Dimensions & Damage Extent */}
      {details.defectDimensions ? (
        <View style={styles.dimBox}>
          <View style={styles.dimHeaderRow}>
            <Ionicons name="resize-outline" size={14} color="#0284C7" />
            <Text style={styles.dimTitle}>Defect Dimensions &amp; Damage Extent</Text>
          </View>
          <Text style={styles.dimText}>{details.defectDimensions}</Text>
        </View>
      ) : null}

      {/* 4-Pillar Practical Allocation: Materials (45%), Labour (30%), Safety & Machinery (15%), Overhead (10%) */}
      <View style={styles.pillarGrid}>
        {/* Pillar 1: Materials (45%) */}
        <View style={styles.pillarCard}>
          <View style={styles.pillarHeader}>
            <Ionicons name="cube-outline" size={13} color="#0D9488" />
            <Text style={[styles.pillarTitle, { color: '#0D9488' }]}>Material Cost</Text>
          </View>
          <Text style={styles.pillarPercent}>45% Split</Text>
          <Text style={styles.pillarCost}>₹{details.materialCost.toLocaleString('en-IN')}</Text>
          <Text style={styles.pillarSub}>BOQ Raw Materials</Text>
          <Text style={styles.pillarWage}>IRC / MoRTH specs</Text>
        </View>

        {/* Pillar 2: Labour (30%) */}
        <View style={styles.pillarCard}>
          <View style={styles.pillarHeader}>
            <Ionicons name="people-outline" size={13} color="#4F46E5" />
            <Text style={[styles.pillarTitle, { color: '#4F46E5' }]}>Labour Charge</Text>
          </View>
          <Text style={[styles.pillarPercent, { color: '#4F46E5' }]}>30% Split</Text>
          <Text style={styles.pillarCost}>₹{details.laborCost.toLocaleString('en-IN')}</Text>
          <Text style={styles.pillarSub}>
            {details.workersCount} workers × {details.estimatedDays} {details.estimatedDays === 1 ? 'day' : 'days'}
          </Text>
          <Text style={styles.pillarWage}>@ ₹{details.dailyWagePerWorker || 850}/day</Text>
        </View>

        {/* Pillar 3: Safety & Machinery (15%) */}
        <View style={styles.pillarCard}>
          <View style={styles.pillarHeader}>
            <Ionicons name="construct-outline" size={13} color="#D97706" />
            <Text style={[styles.pillarTitle, { color: '#D97706' }]}>Machinery &amp; Safety</Text>
          </View>
          <Text style={[styles.pillarPercent, { color: '#D97706' }]}>15% Split</Text>
          <Text style={styles.pillarCost}>₹{details.machineryCost.toLocaleString('en-IN')}</Text>
          <Text style={styles.pillarSub}>Equipment Rental</Text>
          <Text style={styles.pillarWage}>Compactor/Saw/Mixer</Text>
        </View>

        {/* Pillar 4: Overhead & Safety Expenses (10%) */}
        <View style={styles.pillarCard}>
          <View style={styles.pillarHeader}>
            <Ionicons name="shield-checkmark-outline" size={13} color="#E11D48" />
            <Text style={[styles.pillarTitle, { color: '#E11D48' }]}>Overhead Expenses</Text>
          </View>
          <Text style={[styles.pillarPercent, { color: '#E11D48' }]}>10% Split</Text>
          <Text style={styles.pillarCost}>₹{details.overheadCost.toLocaleString('en-IN')}</Text>
          <Text style={styles.pillarSub}>Safety &amp; Logistics</Text>
          <Text style={styles.pillarWage}>Traffic Safety &amp; Sign-off</Text>
        </View>
      </View>

      {/* Bill of Quantities (BOQ) Itemized Table Toggle */}
      {showBoqToggle && details.breakdown && details.breakdown.length > 0 && (
        <View style={styles.boqSection}>
          <TouchableOpacity
            style={styles.boqToggleBtn}
            onPress={() => setExpandedBoq(!expandedBoq)}
            activeOpacity={0.7}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Toggle Bill of Quantities Details"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="receipt-outline" size={15} color={AppColors.primary} />
              <Text style={styles.boqToggleText}>
                {expandedBoq ? 'Hide Itemized Bill of Quantities (BOQ)' : 'View Itemized Bill of Quantities (BOQ)'}
              </Text>
            </View>
            <Ionicons
              name={expandedBoq ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={AppColors.primary}
            />
          </TouchableOpacity>

          {expandedBoq && (
            <View style={styles.boqTable}>
              <View style={styles.boqHeaderRow}>
                <Text style={[styles.boqColHeader, { flex: 2 }]}>Item / Resource</Text>
                <Text style={[styles.boqColHeader, { flex: 1, textAlign: 'center' }]}>Qty</Text>
                <Text style={[styles.boqColHeader, { flex: 1, textAlign: 'right' }]}>Rate (₹)</Text>
                <Text style={[styles.boqColHeader, { flex: 1.2, textAlign: 'right' }]}>Total (₹)</Text>
              </View>

              {details.breakdown.map((item: PracticalBudgetItem, idx: number) => {
                const categoryColor =
                  item.category === 'labor'
                    ? '#4F46E5'
                    : item.category === 'material'
                    ? '#0D9488'
                    : item.category === 'machinery'
                    ? '#D97706'
                    : '#E11D48';

                return (
                  <View key={idx} style={[styles.boqRow, idx % 2 === 1 && styles.boqRowAlt]}>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.boqItemName}>{item.item}</Text>
                      <Text style={[styles.boqItemCategory, { color: categoryColor }]}>
                        {item.category.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.boqColText, { flex: 1, textAlign: 'center' }]}>
                      {item.quantity}
                    </Text>
                    <Text style={[styles.boqColText, { flex: 1, textAlign: 'right' }]}>
                      ₹{item.unitCost.toLocaleString('en-IN')}
                    </Text>
                    <Text style={[styles.boqColTotal, { flex: 1.2, textAlign: 'right' }]}>
                      ₹{item.totalCost.toLocaleString('en-IN')}
                    </Text>
                  </View>
                );
              })}

              <View style={styles.boqFooterRow}>
                <Text style={styles.boqFooterLabel}>Total Practical Estimate:</Text>
                <Text style={styles.boqFooterTotal}>₹{totalAmount.toLocaleString('en-IN')}</Text>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F0FDFA',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    ...Platform.select({
      web: {
        boxShadow: '0px 2px 8px rgba(13, 148, 136, 0.08)',
      },
      default: {
        shadowColor: '#0D9488',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0D9488',
  },
  inrBadge: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#5EEAD4',
    alignSelf: 'flex-start',
  },
  inrBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F766E',
  },
  scopeDesc: {
    fontSize: 12,
    color: '#134E4A',
    lineHeight: 16,
    marginBottom: 10,
  },
  dimBox: {
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  dimHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  dimTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0369A1',
    textTransform: 'uppercase',
  },
  dimText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0C4A6E',
    lineHeight: 16,
  },
  pillarGrid: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  pillarCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 4,
  },
  pillarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  pillarTitle: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  pillarPercent: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0D9488',
    marginBottom: 2,
  },
  pillarCost: {
    fontSize: 13,
    fontWeight: '800',
    color: AppColors.textPrimary,
    marginBottom: 2,
  },
  pillarSub: {
    fontSize: 9,
    fontWeight: '600',
    color: AppColors.textSecondary,
    lineHeight: 12,
  },
  pillarWage: {
    fontSize: 8,
    color: '#64748B',
    marginTop: 2,
    fontStyle: 'italic',
  },
  boqSection: {
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#CCFBF1',
    paddingTop: 8,
  },
  boqToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  boqToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.primary,
  },
  boqTable: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  boqHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  boqColHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
  },
  boqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  boqRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  boqItemName: {
    fontSize: 11,
    fontWeight: '600',
    color: AppColors.textPrimary,
  },
  boqItemCategory: {
    fontSize: 8,
    fontWeight: '800',
    marginTop: 1,
  },
  boqColText: {
    fontSize: 11,
    color: AppColors.textSecondary,
  },
  boqColTotal: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  boqFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#BBF7D0',
  },
  boqFooterLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  boqFooterTotal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#047857',
  },
});

