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
      const brandW = L.brandBlockWidthMm;
      const centerX = margin + brandW;
      const centerW = pageW - margin - centerX;
      const lineH = 3.4;
      const padTop = 5;
      const padBottom = 1.5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(L.fontSize.headerLegal);
      const nameLines = doc.splitTextToSize(C.legalName, centerW - 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(L.fontSize.headerSub + 0.5);
      const bizLines = doc.splitTextToSize(C.businessLine, centerW - 4);

      const taxY = padTop + nameLines.length * lineH + bizLines.length * lineH + 0.5;
      const textBlockBottom = taxY + lineH * 0.85 + padBottom;

      const logoFormat = this.logoImageFormat(C.logoContentType);
      const hasLogo = !!(C.logoBase64 && logoFormat);
      const logoSize = hasLogo ? 16 : 0;
      const logoBlockBottom = hasLogo ? logoSize + 3 : 0;
      const headerH = Math.max(textBlockBottom, logoBlockBottom);

      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageW, headerH, 'F');

      doc.setFillColor(...C.brandBlue);
      doc.rect(centerX, 0, pageW - centerX, headerH, 'F');

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.15);
      doc.rect(margin, 0, brandW, headerH, 'S');

      if (hasLogo) {
        try {
          const fitLogo = Math.min(logoSize, headerH - 3);
          doc.addImage(
            `data:${C.logoContentType};base64,${C.logoBase64}`,
            logoFormat,
            margin + (brandW - fitLogo) / 2,
            (headerH - fitLogo) / 2,
            fitLogo,
            fitLogo,
          );
        } catch {
          // Logo block stays empty when image decode fails.
        }
      }

      doc.setTextColor(255, 255, 255);
      let textY = padTop;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(L.fontSize.headerLegal);
      doc.text(nameLines, centerX + centerW / 2, textY, { align: 'center' });
      textY += nameLines.length * lineH;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(L.fontSize.headerSub + 0.5);
      doc.text(bizLines, centerX + centerW / 2, textY, { align: 'center' });

      doc.setFontSize(L.fontSize.headerSub);
      doc.text(`GSTIN : ${C.gstin}`, centerX + 2, taxY);
      doc.text(`CIN : ${C.cin}`, pageW - margin - 2, taxY, { align: 'right' });

      doc.setTextColor(0, 0, 0);
      y = headerH;
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

    const introBody = C.introText?.trim() || QUOTATION_PDF_COMPANY.defaultIntroText;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      theme: 'grid',
      styles: {
        ...tableStyles,
        cellPadding: L.introCellPaddingMm,
      },
      body: [
        [
          {
            content: 'Quotation',
            styles: { fontStyle: 'bold' as const, halign: 'center' as const, fontSize: 11 },
          },
        ],
        [
          {
            content: introBody,
            styles: {
              fontStyle: 'bold' as const,
              halign: 'left' as const,
              valign: 'top' as const,
              fontSize: L.fontSize.intro,
            },
          },
        ],
      ],
    });

    y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 16;

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

    if (y > pageH - L.footerReserveMm - 55) {
      doc.addPage();
      y = margin;
    }

    const termsW = contentW * L.termsWidthRatio;
    const totalsW = contentW - termsW;
    const termsDetailW = termsW - L.termsIndexWidthMm - L.termsTitleWidthMm;
    const totalsLabelW = totalsW * 0.55;
    const totalsValueW = totalsW - totalsLabelW;
    const footerStartY = y;
    const footerRows = this.buildUnifiedFooterRows(
      C,
      subtotal,
      taxTotal,
      grandTotal,
      gstPercent,
    );
    const footerBlockStyles = {
      ...tableStyles,
      fontSize: L.fontSize.terms,
      cellPadding: L.termsDetailCellPaddingMm,
    };

    autoTable(doc, {
      startY: footerStartY,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      theme: 'grid',
      styles: footerBlockStyles,
      body: footerRows,
      columnStyles: {
        0: { cellWidth: L.termsIndexWidthMm, halign: 'center', valign: 'top' },
        1: { cellWidth: L.termsTitleWidthMm, valign: 'top' },
        2: { cellWidth: termsDetailW, valign: 'top', cellPadding: L.termsDetailCellPaddingMm },
        3: {
          cellWidth: totalsLabelW,
          halign: 'left',
          valign: 'middle',
          cellPadding: L.totalsCellPaddingMm,
        },
        4: {
          cellWidth: totalsValueW,
          halign: 'right',
          valign: 'middle',
          cellPadding: L.totalsCellPaddingMm,
        },
      },
    });

    y = (doc as DocWithTable).lastAutoTable?.finalY ?? footerStartY + 40;

    const sigName = C.signatoryName?.trim() || generator.fullName;
    const sigPhone = C.signatoryMobile?.trim() || (generator.phone !== '—' ? generator.phone : '');
    const sigBlock = [sigName, sigPhone].filter(Boolean).join('\n');

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      theme: 'grid',
      styles: {
        ...tableStyles,
        fontSize: L.fontSize.body,
        cellPadding: L.signatureCellPaddingMm,
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
    if ((q.gstPercent ?? 0) > 0) return q.gstPercent ?? 0;
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

  /** Single 5-column table: terms (70%) + totals (30%), row-aligned like reference PDF. */
  private buildUnifiedFooterRows(
    company: QuotationPdfCompanyConfig,
    subtotal: number,
    taxTotal: number,
    grandTotal: number,
    gstPercent: number,
  ): RowInput[] {
    const terms = this.resolveTermsWithBank(company);
    const transportLabel = company.transportationLabel?.trim() || 'Extra At Actual';
    const transportPad = QUOTATION_PDF_LAYOUT.transportCellPaddingMm;
    const rows: RowInput[] = [
      [
        { content: 'Terms & Conditions:', colSpan: 3, styles: { fontStyle: 'bold' as const } },
        { content: 'Total:', styles: { fontStyle: 'bold' as const } },
        { content: this.formatMoney(subtotal), styles: { halign: 'right' as const } },
      ],
    ];

    if (!terms.length) {
      rows.push([
        { content: '—', colSpan: 3, styles: { fontStyle: 'italic' as const } },
        '',
        '',
      ]);
      return rows;
    }

    let termNum = 0;
    for (const term of terms) {
      termNum += 1;
      const title = term.title.trim();
      const body = this.formatTermBody(term.body);
      const isOrderPayment = /order\s*&\s*payment|order and payment/i.test(title);

      if (isOrderPayment) {
        rows.push([
          String(termNum),
          title,
          body,
          {
            content: 'Transportation',
            styles: {
              fontStyle: 'bold' as const,
              valign: 'middle' as const,
              halign: 'left' as const,
              cellPadding: transportPad,
            },
          },
          {
            content: transportLabel,
            styles: {
              valign: 'middle' as const,
              halign: 'center' as const,
              cellPadding: transportPad,
            },
          },
        ]);
        continue;
      }

      if (/^taxes$/i.test(title)) {
        rows.push([String(termNum), title, body, '', this.formatMoney(0)]);
        rows.push(['', '', '', `Add. : GST @ ${gstPercent}%`, this.formatMoney(taxTotal)]);
        continue;
      }

      if (/payment terms/i.test(title)) {
        rows.push([
          String(termNum),
          title,
          body,
          { content: 'Total Amount (Rs):', styles: { fontStyle: 'bold' as const } },
          {
            content: this.formatMoney(grandTotal),
            styles: { fontStyle: 'bold' as const, halign: 'right' as const },
          },
        ]);
        continue;
      }

      if (/^transportation$/i.test(title) && company.signatureEntity) {
        rows.push([
          String(termNum),
          title,
          body,
          {
            content: `For ${company.signatureEntity}`,
            colSpan: 2,
            styles: { fontStyle: 'bold' as const, halign: 'center' as const, valign: 'middle' as const },
          },
        ]);
        continue;
      }

      rows.push([String(termNum), title, body, '', '']);
    }

    return rows;
  }

  private resolveTermsWithBank(company: QuotationPdfCompanyConfig): { title: string; body: string }[] {
    const terms = company.terms.map((t) => ({ title: t.title, body: t.body }));
    const bankBlock = this.formatBankForOrderPayment(company);
    if (!bankBlock && !company.signatureEntity) return terms;

    const orderIdx = terms.findIndex((t) => /order\s*&\s*payment|order and payment/i.test(t.title));
    const favorLine = company.signatureEntity ? `In favor of "${company.signatureEntity}"` : '';

    if (orderIdx >= 0) {
      const body = terms[orderIdx].body.trim();
      const parts: string[] = [];
      if (favorLine && !/in favor of/i.test(body)) parts.push(favorLine);
      if (body) parts.push(body);
      if (bankBlock && !/bank details|a\/c no|ifsc/i.test(body)) parts.push(bankBlock);
      terms[orderIdx].body = parts.join('\n');
      return terms;
    }

    if (bankBlock || favorLine) {
      terms.unshift({
        title: 'Order & Payment',
        body: [favorLine, bankBlock].filter(Boolean).join('\n'),
      });
    }
    return terms;
  }

  private formatBankForOrderPayment(company: QuotationPdfCompanyConfig): string {
    const lines: string[] = [];
    if (company.bankName?.trim()) lines.push(`Bank Details : ${company.bankName.trim()}`);
    if (company.accountNumber?.trim()) lines.push(`A/c No. ${company.accountNumber.trim()}`);
    if (company.ifscCode?.trim()) lines.push(`IFSC : ${company.ifscCode.trim()}`);
    if (company.branchName?.trim()) lines.push(`Branch: ${company.branchName.trim()}`);
    return lines.join('\n');
  }

  private formatTermBody(body: string): string {
    const text = body?.trim() ?? '';
    if (!text) return '';
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return '';
    const first = lines[0];
    const formattedFirst = first.startsWith(':') ? first : `: ${first}`;
    if (lines.length === 1) return formattedFirst;
    return [formattedFirst, ...lines.slice(1)].join('\n');
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
