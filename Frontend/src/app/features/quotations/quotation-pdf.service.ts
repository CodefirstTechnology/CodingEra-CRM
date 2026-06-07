import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { mapCompanyProfile } from '../../core/services/company-profile/company-profile-api.mapper';
import type { QuotationLineItemDto, QuotationUpsertDto } from '../../core/services/quotations/quotation-api.models';
import { mergeCompanyProfileForPdf, type QuotationPdfCompanyConfig } from './company-profile-pdf.mapper';
import { QUOTATION_PDF_COMPANY, QUOTATION_PDF_LAYOUT } from './quotation-pdf.config';

export interface QuotationPdfGeneratorInfo {
  fullName: string;
  phone: string;
  email: string;
}

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

@Injectable({ providedIn: 'root' })
export class QuotationPdfService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  async download(quotation: QuotationUpsertDto): Promise<void> {
    const [generator, company] = await Promise.all([
      this.resolveGeneratorInfo(),
      this.resolveCompanyProfile(),
    ]);
    const doc = this.buildDocument(quotation, generator, company);
    doc.save(this.pdfFilename(quotation.quotationNumber));
  }

  private async resolveCompanyProfile(): Promise<QuotationPdfCompanyConfig> {
    const base = environment.apiUrl?.replace(/\/$/, '');
    const token = this.auth.token();
    if (!base || !token) return mergeCompanyProfileForPdf(null);

    try {
      const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
      const body = await firstValueFrom(
        this.http.get<unknown>(`${base}/company-profile`, { headers }).pipe(timeout(8000)),
      );
      return mergeCompanyProfileForPdf(mapCompanyProfile(body));
    } catch {
      return mergeCompanyProfileForPdf(null);
    }
  }

  private async resolveGeneratorInfo(): Promise<QuotationPdfGeneratorInfo> {
    const session = this.auth.user();
    const fallback: QuotationPdfGeneratorInfo = {
      fullName: session?.name?.trim() || '—',
      email: session?.email?.trim() || '—',
      phone: '—',
    };
    if (!session?.id?.trim()) return fallback;

    const base = environment.apiUrl?.replace(/\/$/, '');
    const token = this.auth.token();
    if (!base || !token) return fallback;

    const id = session.id.trim();
    if (!/^\d+$/.test(id)) return fallback;

    try {
      const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
      const body = await firstValueFrom(
        this.http.get<unknown>(`${base}/auth/users/${encodeURIComponent(id)}`, { headers }).pipe(timeout(8000)),
      );
      const row = this.unwrapRecord(body);
      const fullName =
        this.pickStr(row, ['fullName', 'FullName', 'name', 'Name']) || fallback.fullName;
      const phone = this.pickStr(row, ['phone', 'Phone']) || '—';
      const email = this.pickStr(row, ['email', 'Email']) || fallback.email;
      return { fullName, phone, email };
    } catch {
      return fallback;
    }
  }

  private buildDocument(
    q: QuotationUpsertDto,
    generator: QuotationPdfGeneratorInfo,
    company: QuotationPdfCompanyConfig,
  ): jsPDF {
    const L = QUOTATION_PDF_LAYOUT;
    const C = company;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = L.marginMm;
    const contentW = pageW - margin * 2;

    const metaValueLeftW =
      contentW - L.metaLabelWidthMm - L.metaValueRightLabelWidthMm - L.metaValueRightWidthMm;
    const lineDescW =
      contentW - L.lineSrWidthMm - L.lineQtyWidthMm - L.lineRateWidthMm - L.lineAmountWidthMm;

    const tableStyles = {
      fontSize: L.fontSize.body,
      cellPadding: L.cellPaddingMm,
      lineColor: [0, 0, 0] as [number, number, number],
      lineWidth: 0.15,
      textColor: [0, 0, 0] as [number, number, number],
      valign: 'middle' as const,
    };

    let y = margin;

    const drawHeader = (): void => {
      const headerH = L.headerHeightMm;
      const brandW = L.brandBlockWidthMm;
      const centerX = margin + brandW;
      const centerW = pageW - margin - centerX;

      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageW, headerH, 'F');

      doc.setFillColor(...C.brandBlue);
      doc.rect(centerX, 0, pageW - centerX, headerH, 'F');

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.15);
      doc.rect(margin, 0, brandW, headerH, 'S');

      const logoFormat = this.logoImageFormat(C.logoContentType);
      const hasLogo = !!(C.logoBase64 && logoFormat);
      let brandTextY = 10;

      if (hasLogo) {
        try {
          doc.addImage(
            `data:${C.logoContentType};base64,${C.logoBase64}`,
            logoFormat,
            margin + 3,
            3,
            14,
            14,
          );
          brandTextY = 19;
        } catch {
          // Fall back to text-only brand block.
        }
      }

      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(L.fontSize.headerBrand);
      doc.text(C.brandName, margin + 3, brandTextY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(L.fontSize.headerSub);
      const tagLines = doc.splitTextToSize(C.brandTagline, brandW - 6);
      doc.text(tagLines, margin + 3, brandTextY + 4.5);

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(L.fontSize.headerLegal);
      const nameLines = doc.splitTextToSize(C.legalName, centerW - 4);
      doc.text(nameLines, centerX + centerW / 2, 10, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(L.fontSize.headerSub + 0.5);
      const bizLines = doc.splitTextToSize(C.businessLine, centerW - 4);
      const bizY = 14 + (nameLines.length - 1) * 3.8;
      doc.text(bizLines, centerX + centerW / 2, bizY, { align: 'center' });

      doc.setFontSize(L.fontSize.headerSub);
      const taxY = headerH - 5;
      doc.text(`GSTIN : ${C.gstin}`, centerX + 2, taxY);
      doc.text(`CIN : ${C.cin}`, pageW - margin - 2, taxY, { align: 'right' });

      doc.setTextColor(0, 0, 0);
      y = headerH + L.sectionGapMm;
    };

    const drawFooter = (pageNumber: number, totalPages: number): void => {
      const footerH = L.footerHeightMm;
      const footerY = pageH - footerH;
      doc.setFillColor(...C.brandBlue);
      doc.rect(0, footerY, pageW, footerH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(L.fontSize.footer);
      const addr = doc.splitTextToSize(C.address, contentW - 4);
      doc.text(addr, pageW / 2, footerY + 3.5, { align: 'center' });
      doc.text(
        `Contact No : ${C.contactPhone}    Email ID : ${C.emails.join(', ')}    Website : ${C.website}`,
        pageW / 2,
        footerY + 7.5 + (addr.length - 1) * 2.2,
        { align: 'center' },
      );
      if (totalPages > 1) {
        doc.setFontSize(6);
        doc.text(`Page ${pageNumber} of ${totalPages}`, pageW - margin, footerY + 2, { align: 'right' });
      }
      doc.setTextColor(0, 0, 0);
    };

    drawHeader();

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      theme: 'grid',
      styles: tableStyles,
      body: [
        [
          { content: 'M/s. :', styles: { fontStyle: 'bold' } },
          this.display(q.companyName || q.customerName),
          { content: 'Qtn No. :', styles: { fontStyle: 'bold' } },
          {
            content: this.display(q.quotationNumber),
            styles: {
              fillColor: L.qtnHighlightFill,
              textColor: L.qtnHighlightText,
              fontStyle: 'bold',
            },
          },
        ],
        [
          { content: 'Office Addr:', styles: { fontStyle: 'bold' } },
          this.display(q.officeAddress),
          { content: 'Date :', styles: { fontStyle: 'bold' } },
          this.formatDate(q.quotationDate),
        ],
        [
          { content: 'Site:', styles: { fontStyle: 'bold' } },
          this.display(q.siteAddress),
          { content: 'Ref :', styles: { fontStyle: 'bold' } },
          this.display(q.referenceNumber),
        ],
        [
          { content: 'Contact Person:', styles: { fontStyle: 'bold' } },
          this.display(q.contactPerson),
          { content: 'Ref Date:', styles: { fontStyle: 'bold' } },
          this.formatDate(q.referenceDate),
        ],
        [
          { content: 'E-mail/Ph.No.:', styles: { fontStyle: 'bold' } },
          { content: this.contactLine(q), colSpan: 3 },
        ],
      ],
      columnStyles: {
        0: { cellWidth: L.metaLabelWidthMm },
        1: { cellWidth: metaValueLeftW },
        2: { cellWidth: L.metaValueRightLabelWidthMm },
        3: { cellWidth: L.metaValueRightWidthMm },
      },
    });

    y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 28;
    y += L.sectionGapMm;

    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, contentW, 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Quotation', pageW / 2, y + 4.8, { align: 'center' });
    y += 9;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(L.fontSize.intro);
    const introLines = doc.splitTextToSize(C.introText, contentW);
    doc.text(introLines, margin, y);
    y += introLines.length * 3.8 + L.introGapMm;

    const lineRows = this.lineItemRows(q.lineItems ?? []);
    const subtotal = this.subtotal(q);
    const taxTotal = this.taxTotal(q);
    const grandTotal = this.grandTotal(q);
    const gstPercent = this.effectiveGstPercent(q, subtotal, taxTotal);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: L.footerReserveMm },
      tableWidth: contentW,
      theme: 'grid',
      head: [['Sr. No.', 'Material Description', 'Quantity (Nos)', 'Rate per Nos. (Rs.)', 'Total Amount (Rs.)']],
      body: lineRows,
      foot: [
        [
          { content: '', colSpan: 3 },
          { content: 'Total', styles: { halign: 'right', fontStyle: 'bold' } },
          { content: this.formatMoney(subtotal), styles: { halign: 'right', fontStyle: 'bold' } },
        ],
      ],
      styles: tableStyles,
      headStyles: {
        fillColor: C.tableHeadFill,
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
      },
      footStyles: {
        fillColor: C.tableFootFill,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: L.lineSrWidthMm, halign: 'center' },
        1: { cellWidth: lineDescW, halign: 'left' },
        2: { cellWidth: L.lineQtyWidthMm, halign: 'right' },
        3: { cellWidth: L.lineRateWidthMm, halign: 'right' },
        4: { cellWidth: L.lineAmountWidthMm, halign: 'right' },
      },
    });

    y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 20;
    y += L.sectionGapMm + 1;

    if (y > pageH - L.footerReserveMm - 55) {
      doc.addPage();
      y = margin;
    }

    const termsW = contentW * L.termsWidthRatio;
    const totalsW = contentW - termsW;
    const termsDetailW = termsW - L.termsIndexWidthMm - L.termsTitleWidthMm;
    const termsStartY = y;

    const termsRows: RowInput[] = [
      [{ content: 'Terms & Conditions:', colSpan: 3, styles: { fontStyle: 'bold' } }],
      ...C.terms.map((term, i) => [
        String(i + 1),
        term.title,
        this.formatTermBody(term.body),
      ]),
    ];

    autoTable(doc, {
      startY: termsStartY,
      margin: { left: margin, right: margin + totalsW },
      tableWidth: termsW,
      theme: 'grid',
      styles: {
        ...tableStyles,
        fontSize: L.fontSize.terms,
        cellPadding: { top: 1.2, right: 1.2, bottom: 1.2, left: 1.2 },
      },
      body: termsRows,
      columnStyles: {
        0: { cellWidth: L.termsIndexWidthMm, halign: 'center', valign: 'top' },
        1: { cellWidth: L.termsTitleWidthMm, fontStyle: 'bold', valign: 'top' },
        2: { cellWidth: termsDetailW, valign: 'top' },
      },
    });

    const termsEndY = (doc as DocWithTable).lastAutoTable?.finalY ?? termsStartY + 40;

    autoTable(doc, {
      startY: termsStartY,
      margin: { left: margin + termsW, right: margin },
      tableWidth: totalsW,
      theme: 'grid',
      styles: {
        ...tableStyles,
        fontSize: L.fontSize.body,
        cellPadding: { top: 1.2, right: 1.2, bottom: 1.2, left: 1.2 },
      },
      body: [
        ['Total:', this.formatMoney(subtotal)],
        [{ content: 'Transportation', styles: { fontStyle: 'bold' } }, C.transportationLabel],
        ['Taxes', this.formatMoney(0)],
        [`Add. : GST @ ${gstPercent}%`, this.formatMoney(taxTotal)],
        [
          { content: 'Total Amount (Rs):', styles: { fontStyle: 'bold' } },
          { content: this.formatMoney(grandTotal), styles: { fontStyle: 'bold', halign: 'right' } },
        ],
      ],
      columnStyles: {
        0: { cellWidth: totalsW * 0.58, halign: 'left' },
        1: { cellWidth: totalsW * 0.42, halign: 'right' },
      },
    });

    const totalsEndY = (doc as DocWithTable).lastAutoTable?.finalY ?? termsStartY + 40;
    y = Math.max(termsEndY, totalsEndY);

    const sigName = C.signatoryName?.trim() || generator.fullName;
    const sigPhone = C.signatoryMobile?.trim() || (generator.phone !== '—' ? generator.phone : '');
    const sigBlock = [`For ${C.signatureEntity}`, sigName, sigPhone].filter(Boolean).join('\n');

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      theme: 'grid',
      styles: {
        ...tableStyles,
        fontSize: L.fontSize.body,
        cellPadding: { top: 2, right: 1.5, bottom: 2, left: 1.5 },
      },
      body: [
        [
          {
            content: `" ${C.jurisdiction} "`,
            styles: { halign: 'center', fontStyle: 'italic', valign: 'middle' },
          },
          {
            content: sigBlock,
            styles: { halign: 'center', fontStyle: 'bold', valign: 'middle' },
          },
        ],
      ],
      columnStyles: {
        0: { cellWidth: termsW },
        1: { cellWidth: totalsW },
      },
    });

    y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 18;

    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      drawFooter(p, totalPages);
    }

    return doc;
  }

  private lineItemRows(items: QuotationLineItemDto[]): RowInput[] {
    if (!items.length) {
      return [['—', 'No line items', '—', '—', '—']];
    }
    return items.map((line, i) => {
      const desc = [line.itemName, line.description].filter((s) => s?.trim()).join(' — ') || line.itemCode || '—';
      const qty = line.quantity ?? 0;
      const rate = line.rate ?? 0;
      const total = line.lineTotal || line.amount || 0;
      return [
        String(i + 1),
        desc,
        qty > 0 ? this.formatQty(qty) : '—',
        rate > 0 ? this.formatMoney(rate) : '—',
        this.formatMoney(total),
      ];
    });
  }

  private subtotal(q: QuotationUpsertDto): number {
    if (q.subtotal != null && q.subtotal > 0) return q.subtotal;
    return (q.lineItems ?? []).reduce((s, l) => s + (l.amount || 0), 0);
  }

  private taxTotal(q: QuotationUpsertDto): number {
    if (q.taxTotal != null) return q.taxTotal;
    return (q.lineItems ?? []).reduce((s, l) => s + (l.taxAmount || 0), 0);
  }

  private grandTotal(q: QuotationUpsertDto): number {
    if (q.grandTotal != null && q.grandTotal > 0) return q.grandTotal;
    return this.subtotal(q) + this.taxTotal(q);
  }

  private effectiveGstPercent(q: QuotationUpsertDto, subtotal: number, taxTotal: number): number {
    const lines = q.lineItems ?? [];
    if (lines.length) {
      const withGst = lines.filter((l) => (l.gstPercent ?? 0) > 0);
      if (withGst.length) {
        const avg = withGst.reduce((s, l) => s + (l.gstPercent ?? 0), 0) / withGst.length;
        return Math.round(avg * 100) / 100;
      }
    }
    if (subtotal > 0 && taxTotal > 0) {
      return Math.round((taxTotal / subtotal) * 10000) / 100;
    }
    return QUOTATION_PDF_COMPANY.defaultGstPercent;
  }

  private contactLine(q: QuotationUpsertDto): string {
    const email = q.emailAddress?.trim();
    const phone = q.mobileNumber?.trim();
    if (email && phone) return `${email} / ${phone}`;
    return email || phone || '—';
  }

  private pdfFilename(quotationNumber: string): string {
    const base = (quotationNumber?.trim() || 'quotation')
      .replace(/\//g, '-')
      .replace(/[<>:"/\\|?*]+/g, '-')
      .replace(/\s+/g, '-');
    return `${base}.pdf`;
  }

  private display(value: string | null | undefined): string {
    const v = value?.trim();
    return v ? v : '—';
  }

  private formatDate(value: string | null | undefined): string {
    if (!value?.trim()) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private formatMoney(value: number): string {
    if (!Number.isFinite(value)) return '—';
    return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private formatQty(value: number): string {
    if (!Number.isFinite(value)) return '—';
    return value.toLocaleString('en-IN', { maximumFractionDigits: 4 });
  }

  private formatTermBody(body: string): string {
    const text = body?.trim() ?? '';
    if (!text) return '';
    return text.startsWith(':') ? text : `: ${text}`;
  }

  private logoImageFormat(contentType: string | undefined): 'PNG' | 'JPEG' | 'WEBP' | '' {
    const t = contentType?.trim().toLowerCase() ?? '';
    if (t.includes('png')) return 'PNG';
    if (t.includes('jpeg') || t.includes('jpg')) return 'JPEG';
    if (t.includes('webp')) return 'WEBP';
    return '';
  }

  private unwrapRecord(body: unknown): Record<string, unknown> {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const o = body as Record<string, unknown>;
      const nested = o['data'] ?? o['user'] ?? o['result'];
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        return nested as Record<string, unknown>;
      }
      return o;
    }
    return {};
  }

  private pickStr(obj: Record<string, unknown>, keys: string[]): string {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  }
}
