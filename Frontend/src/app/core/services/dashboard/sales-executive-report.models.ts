export interface SalesExecutiveReportQuery {
  startDate?: string;
  endDate?: string;
  timeZoneOffsetMinutes?: number;
  roleId?: number;
  includeInactiveUsers?: boolean;
}

export interface SalesExecutiveReportRow {
  userId: number;
  executiveName: string;
  roleName: string;
  userEmail: string;

  // Period-Scoped Counts (Cols 2-7)
  totalLeads: number;
  contacted: number;
  qualified: number;
  meetings: number;
  quotations: number;
  ordersWon: number;

  // Period-Scoped Financial Values (Cols 8-10)
  leadValue: number;
  quotationValue: number;
  orderValue: number;

  // Period-Scoped Ratios & Compliance (Cols 11-15)
  contactPercentage: number;
  qualificationPercentage: number;
  quotePercentage: number;
  orderConversionPercentage: number;
  followUpCompliancePercentage: number;

  // Point-in-Time Active Snapshots (Cols 16-17)
  openLeads: number;
  overdueFollowUps: number;
}

export interface SalesExecutiveReportSummary {
  totalExecutives: number;
  totalLeads: number;
  totalContacted: number;
  totalQualified: number;
  totalMeetings: number;
  totalQuotations: number;
  totalOrdersWon: number;
  totalLeadValue: number;
  totalQuotationValue: number;
  totalOrderValue: number;

  averageContactPercentage: number;
  averageQualificationPercentage: number;
  averageQuotePercentage: number;
  averageOrderConversionPercentage: number;
  averageFollowUpCompliancePercentage: number;

  totalOpenLeads: number;
  totalOverdueFollowUps: number;
}

export interface SalesExecutiveReportResponse {
  startDate: string;
  endDate: string;
  summary: SalesExecutiveReportSummary;
  rows: SalesExecutiveReportRow[];
}
