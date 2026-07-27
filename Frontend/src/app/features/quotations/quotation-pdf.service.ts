import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { mapCompanyProfile } from '../../core/services/company-profile/company-profile-api.mapper';
import type { QuotationLineItemDto, QuotationUpsertDto } from '../../core/services/quotations/quotation-api.models';
import {
  additionalChargesTotal,
  listAdditionalChargeLines,
} from '../../core/services/quotations/quotation-additional-charges.util';
import { mergeCompanyProfileForPdf, resolveQuotationPdfContent, type QuotationPdfCompanyConfig } from './company-profile-pdf.mapper';
import { QUOTATION_PDF_COMPANY, QUOTATION_PDF_LAYOUT } from './quotation-pdf.config';
import { formatIntlTelDisplay } from '../../shared/utils/intl-tel.util';
import { isTechnicalProposalTemplate } from '../../core/services/quotations/quotation-template.constants';
import { TechnicalProposalPdfService } from './technical-proposal-pdf.service';

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
  private readonly technicalProposalPdf = inject(TechnicalProposalPdfService);

  async download(quotation: QuotationUpsertDto): Promise<void> {
    if (isTechnicalProposalTemplate(quotation.quotationTemplate)) {
      await this.technicalProposalPdf.download(quotation);
      return;
    }

    const [generator, company] = await Promise.all([
      this.resolveGeneratorInfo(),
      this.resolveCompanyProfile(),
    ]);
    const pdfCompany = await this.withPdfOptimizedLogo(resolveQuotationPdfContent(quotation, company));
    const doc = this.buildDocument(quotation, generator, pdfCompany);
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
      const params = new HttpParams().set('userId', id);
      const body = await firstValueFrom(
        this.http
          .get<unknown>(`${base}/auth/users/${encodeURIComponent(id)}`, { headers, params })
          .pipe(timeout(8000)),
      );
      const row = this.unwrapRecord(body);
      const fullName =
        this.pickStr(row, ['fullName', 'FullName', 'name', 'Name', 'userName', 'UserName']) ||
        fallback.fullName;
      const phoneRaw = this.pickStr(row, [
        'phone',
        'Phone',
        'mobile',
        'Mobile',
        'mobileNumber',
        'MobileNumber',
        'contactNumber',
        'ContactNumber',
      ]);
      const phone = phoneRaw ? formatIntlTelDisplay(phoneRaw) || phoneRaw : '—';
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
      lineWidth: 0.12,
      textColor: [0, 0, 0] as [number, number, number],
      valign: 'middle' as const,
      overflow: 'linebreak' as const,
    };

    let y = 0;
    const headerHeight = this.measureCompanyHeaderHeight(doc, C, contentW);
    const pageTopMargin = margin + headerHeight + L.sectionGapMm;
    const contentBottomY = pageH - L.footerReserveMm;

    const drawHeader = (): void => {
      const brandW = L.brandBlockWidthMm;
      const headerTop = margin;
      const headerLeft = margin;
      const headerRight = margin + contentW;
      const textLeft = headerLeft + brandW;
      const textWidth = contentW - brandW;
      const textPad = L.headerTextPadMm;
      const textInnerW = textWidth - textPad * 2;
      const lineH = 3.4;
      const padTop = 5;
      const padBottom = 1.5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(L.fontSize.headerLegal);
      const nameLines = doc.splitTextToSize(C.legalName, textInnerW);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(L.fontSize.headerSub + 0.5);
      const taglineLines = C.brandTagline?.trim()
        ? doc.splitTextToSize(C.brandTagline, textInnerW)
        : [];

      const taxY = padTop + nameLines.length * lineH + taglineLines.length * lineH + 0.5;
      const textBlockBottom = taxY + lineH * 0.85 + padBottom;

      const logoFormat = this.logoImageFormat(C.logoContentType);
      const hasLogo = !!(C.logoBase64 && logoFormat);
      const logoAspect =
        C.logoPixelWidth && C.logoPixelHeight && C.logoPixelHeight > 0
          ? C.logoPixelWidth / C.logoPixelHeight
          : 1;

      const headerH = textBlockBottom;

      // Full-width brand blue header (right text band starts after 50mm brand column).
      doc.setFillColor(...C.brandBlue);
      doc.rect(headerLeft, headerTop, contentW, headerH, 'F');

      // Narrower white logo plate — full height, centered in the 50mm brand column.
      const logoBoxW = Math.min(L.logoPlateWidthMm, brandW);
      const logoBoxH = headerH;
      const logoBoxX = headerLeft + (brandW - logoBoxW) / 2;
      const logoBoxY = headerTop;
      doc.setFillColor(255, 255, 255);
      doc.rect(logoBoxX, logoBoxY, logoBoxW, logoBoxH, 'F');

      if (hasLogo) {
        const logoPad = Math.max(L.logoBoxPaddingMm, 1);
        const availH = Math.min(logoBoxH - logoPad * 2, L.logoMaxHeightMm);
        const availW = Math.min(logoBoxW - logoPad * 2, L.logoMaxWidthMm);
        let fitW = availW;
        let fitH = fitW / Math.max(logoAspect, 0.01);
        if (fitH > availH) {
          fitH = availH;
          fitW = fitH * logoAspect;
        }
        // Center logo inside the white logo plate.
        const logoX = logoBoxX + (logoBoxW - fitW) / 2;
        const logoY = logoBoxY + (logoBoxH - fitH) / 2;

        try {
          doc.addImage(
            `data:${C.logoContentType};base64,${C.logoBase64}`,
            logoFormat,
            logoX,
            logoY,
            fitW,
            fitH,
          );
        } catch {
          // Logo omitted when image decode fails.
        }
      }

      doc.setTextColor(255, 255, 255);
      const textCenterX = textLeft + textWidth / 2;
      let textY = headerTop + padTop;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(L.fontSize.headerLegal);
      doc.text(nameLines, textCenterX, textY, { align: 'center' });
      textY += nameLines.length * lineH;

      if (taglineLines.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(L.fontSize.headerSub + 0.5);
        doc.text(taglineLines, textCenterX, textY, { align: 'center' });
      }

      doc.setFontSize(L.fontSize.headerSub);
      doc.text(`GSTIN : ${C.gstin}`, textLeft + textPad, headerTop + taxY);
      doc.text(`CIN : ${C.cin}`, headerRight - textPad, headerTop + taxY, { align: 'right' });

      doc.setTextColor(0, 0, 0);
      y = headerTop + headerH + L.sectionGapMm;
    };

    const drawFooter = (pageNumber: number, totalPages: number): void => {
      const footerH = L.footerHeightMm;
      const footerY = pageH - margin - footerH;
      const textPad = L.headerTextPadMm;
      const textInnerW = contentW - textPad * 2;

      doc.setFillColor(...C.brandBlue);
      doc.rect(margin, footerY, contentW, footerH, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(L.fontSize.headerSub);
      const addr = doc.splitTextToSize(C.address, textInnerW) as string[];
      const contactLine = `Contact No : ${C.contactPhone}    Email ID : ${C.emails.join(', ')}    Website : ${C.website}`;
      const contact = doc.splitTextToSize(contactLine, textInnerW) as string[];
      const lineH = 2.6;
      const textLineCount = addr.length + contact.length;
      const textBlockH = textLineCount * lineH;
      const startY = footerY + (footerH - textBlockH) / 2 + lineH * 0.75;

      doc.text(addr, pageW / 2, startY, { align: 'center' });
      doc.text(contact, pageW / 2, startY + addr.length * lineH, { align: 'center' });
      if (totalPages > 1) {
        doc.setFontSize(6);
        doc.text(
          `Page ${pageNumber} of ${totalPages}`,
          margin + contentW - textPad,
          footerY + 2.5,
          { align: 'right' },
        );
      }
      doc.setTextColor(0, 0, 0);
    };

    /** Repeat company header on autoTable continuation pages (page 1 already drawn). */
    const ensureHeaderOnTablePage = (tablePageNumber: number): void => {
      if (tablePageNumber > 1) {
        drawHeader();
      }
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

    const businessLineBody = C.businessLine?.trim() ?? '';
    const introBody = C.introText?.trim() ?? '';
    const introContent = businessLineBody || introBody;

    const quotationSectionRows: RowInput[] = [
      [
        {
          content: 'Quotation',
          styles: { fontStyle: 'bold' as const, halign: 'center' as const, fontSize: 11 },
        },
      ],
    ];
    if (introContent) {
      const introPad = L.introCellPaddingMm;
      const introInnerW = contentW - introPad.left - introPad.right;
      quotationSectionRows.push([
        {
          content: this.wrapBusinessLineForCell(doc, introContent, introInnerW, L.fontSize.intro),
          styles: {
            fontStyle: 'normal' as const,
            halign: 'left' as const,
            valign: 'top' as const,
            fontSize: L.fontSize.intro,
          },
        },
      ]);
    }

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      theme: 'grid',
      styles: {
        ...tableStyles,
        cellPadding: L.introCellPaddingMm,
        overflow: 'linebreak',
      },
      body: quotationSectionRows,
    });

    y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 16;

    const subtotal = this.subtotal(q);
    const additionalTotal = this.additionalChargesTotal(q);
    const taxableAmount = subtotal + additionalTotal;
    const taxTotal = this.resolveTaxTotal(q, taxableAmount);
    const grandTotal = this.resolveGrandTotal(q, taxableAmount, taxTotal);
    const gstPercent = this.effectiveGstPercent(q, taxableAmount, taxTotal);
    const additionalLines = listAdditionalChargeLines({
      transportationCharges: q.transportationCharges ?? 0,
      loadingCharges: q.loadingCharges ?? 0,
      serviceCharges: q.serviceCharges ?? 0,
      customCharges: (q.customCharges ?? []).map((c, i) => ({
        sortIndex: c.sortIndex ?? i,
        chargeName: c.chargeName,
        amount: c.amount,
      })),
    });
    const sigName = generator.fullName !== '—' ? generator.fullName : '';
    const sigPhone = generator.phone !== '—' ? generator.phone : '';
    const sigBlock = [sigName, sigPhone].filter(Boolean).join('\n');
    const footerRows = this.buildUnifiedFooterRows(
      C,
      subtotal,
      additionalLines,
      taxTotal,
      grandTotal,
      gstPercent,
    );
    const lineRows = this.lineItemRows(q.lineItems ?? []);
    const termsW = contentW * L.termsWidthRatio;
    const totalsW = contentW - termsW;
    const termsDetailW = termsW - L.termsIndexWidthMm - L.termsTitleWidthMm;
    const totalsLabelW = totalsW * 0.55;
    const totalsValueW = totalsW - totalsLabelW;

    const closingHeight = this.measureClosingBlocksHeight({
      contentW,
      margin,
      footerReserveMm: L.footerReserveMm,
      tableStyles,
      footerRows,
      termsDetailW,
      totalsLabelW,
      totalsValueW,
      termsW,
      totalsW,
      jurisdiction: C.jurisdiction,
      sigBlock,
    });

    const productHeadLabels = [
      'Sr. No.',
      'Material Description',
      'Quantity (Nos)',
      'Rate per Nos. (Rs.)',
      'Total Amount (Rs.)',
    ];
    const productHeadWidths = [
      L.lineSrWidthMm,
      lineDescW,
      L.lineQtyWidthMm,
      L.lineRateWidthMm,
      L.lineAmountWidthMm,
    ];
    // Use the tallest header cell — narrow columns wrap and drive actual head height.
    const headHeight = Math.max(
      ...productHeadLabels.map((label, i) =>
        this.estimateCellHeightMm(doc, label, productHeadWidths[i], L.fontSize.body, L.cellPaddingMm),
      ),
      L.lineItemHeadHeightMm,
    );
    const blankRowHeight = Math.max(
      L.blankRowHeightMm,
      this.estimateCellHeightMm(doc, ' ', lineDescW, L.fontSize.body, L.cellPaddingMm),
    );
    const totalRowHeight = Math.max(
      L.lineItemFootHeightMm,
      this.estimateCellHeightMm(doc, 'Total', L.lineRateWidthMm, L.fontSize.body, L.cellPaddingMm),
    );
    const itemHeights = lineRows.map((row) => {
      const cells = row as unknown as unknown[];
      const desc = this.rowCellText(cells[1]);
      return this.estimateCellHeightMm(doc, desc, lineDescW, L.fontSize.body, L.cellPaddingMm);
    });

    const blankCount = this.planDynamicBlankRowCount({
      itemHeights,
      headHeight,
      blankRowHeight,
      totalRowHeight,
      closingHeight,
      firstPageTableTop: y,
      continuationTableTop: pageTopMargin,
      contentBottomY,
    });

    const productBody: RowInput[] = [
      ...lineRows,
      ...this.blankProductRows(blankCount, blankRowHeight),
    ];
    const productColumnStyles = {
      0: { cellWidth: L.lineSrWidthMm, halign: 'center' as const },
      1: { cellWidth: lineDescW, halign: 'left' as const },
      2: { cellWidth: L.lineQtyWidthMm, halign: 'right' as const },
      3: { cellWidth: L.lineRateWidthMm, halign: 'right' as const },
      4: { cellWidth: L.lineAmountWidthMm, halign: 'right' as const },
    };
    const productHeadStyles = {
      fillColor: C.tableHeadFill,
      textColor: [0, 0, 0] as [number, number, number],
      fontStyle: 'bold' as const,
      halign: 'center' as const,
      valign: 'middle' as const,
    };
    const productFootStyles = {
      fillColor: C.tableFootFill,
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold' as const,
      valign: 'middle' as const,
    };

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, top: pageTopMargin, bottom: L.footerReserveMm },
      tableWidth: contentW,
      theme: 'grid',
      head: [productHeadLabels],
      body: productBody,
      foot: [
        [
          { content: '', colSpan: 3 },
          { content: 'Total', styles: { halign: 'right', fontStyle: 'bold' } },
          { content: this.formatMoney(subtotal), styles: { halign: 'right', fontStyle: 'bold' } },
        ],
      ],
      showHead: 'everyPage',
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      styles: tableStyles,
      headStyles: productHeadStyles,
      footStyles: productFootStyles,
      columnStyles: productColumnStyles,
      willDrawPage: (data) => ensureHeaderOnTablePage(data.pageNumber),
    });

    y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 20;

    // Closing block (terms/totals/signatory) only after the last product row on the final page.
    if (y + closingHeight > contentBottomY) {
      doc.addPage();
      drawHeader();
    }

    const footerBlockStyles = {
      ...tableStyles,
      fontSize: L.fontSize.terms,
      cellPadding: L.termsDetailCellPaddingMm,
      overflow: 'linebreak' as const,
      minCellHeight: L.footerMinCellHeightMm,
    };

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, top: pageTopMargin, bottom: L.footerReserveMm },
      tableWidth: contentW,
      theme: 'grid',
      styles: footerBlockStyles,
      body: footerRows,
      columnStyles: {
        0: { cellWidth: L.termsIndexWidthMm, halign: 'center', valign: 'top' },
        1: { cellWidth: L.termsTitleWidthMm, valign: 'top', fontStyle: 'normal' },
        2: { cellWidth: termsDetailW, valign: 'top', cellPadding: L.termsDetailCellPaddingMm },
        3: {
          cellWidth: totalsLabelW,
          halign: 'left',
          valign: 'top',
          cellPadding: L.totalsCellPaddingMm,
        },
        4: {
          cellWidth: totalsValueW,
          halign: 'right',
          valign: 'top',
          cellPadding: L.totalsCellPaddingMm,
        },
      },
      willDrawPage: (data) => ensureHeaderOnTablePage(data.pageNumber),
    });

    y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 40;

    const jurisdictionText = C.jurisdiction?.trim() ? `" ${C.jurisdiction.trim()} "` : '';

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, top: pageTopMargin, bottom: L.footerReserveMm },
      tableWidth: contentW,
      theme: 'grid',
      styles: {
        ...tableStyles,
        fontSize: L.fontSize.body,
        cellPadding: L.closingRowPaddingMm,
        minCellHeight: L.closingRowHeightMm,
        valign: 'middle',
      },
      body: [
        [
          {
            content: jurisdictionText,
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
      willDrawPage: (data) => ensureHeaderOnTablePage(data.pageNumber),
    });

    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      drawFooter(p, totalPages);
    }

    return doc;
  }

  private measureCompanyHeaderHeight(
    doc: jsPDF,
    company: QuotationPdfCompanyConfig,
    contentW: number,
  ): number {
    const L = QUOTATION_PDF_LAYOUT;
    const textInnerW = contentW - L.brandBlockWidthMm - L.headerTextPadMm * 2;
    const lineH = 3.4;
    const padTop = 5;
    const padBottom = 1.5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(L.fontSize.headerLegal);
    const nameLines = doc.splitTextToSize(company.legalName, textInnerW);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(L.fontSize.headerSub + 0.5);
    const taglineLines = company.brandTagline?.trim()
      ? doc.splitTextToSize(company.brandTagline, textInnerW)
      : [];

    const taxY = padTop + nameLines.length * lineH + taglineLines.length * lineH + 0.5;
    return taxY + lineH * 0.85 + padBottom;
  }

  /** Approx. wrapped cell height in mm (jsPDF fontSize is pt). Slightly conservative vs autoTable. */
  private estimateCellHeightMm(
    doc: jsPDF,
    text: string,
    widthMm: number,
    fontSizePt: number,
    cellPaddingMm: number | { top: number; right: number; bottom: number; left: number },
  ): number {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSizePt);
    const padY =
      typeof cellPaddingMm === 'number'
        ? cellPaddingMm * 2
        : cellPaddingMm.top + cellPaddingMm.bottom;
    const innerW =
      Math.max(widthMm, 1) -
      (typeof cellPaddingMm === 'number'
        ? cellPaddingMm * 2
        : cellPaddingMm.left + cellPaddingMm.right);
    const lines = doc.splitTextToSize(text?.trim() ? text : ' ', Math.max(innerW, 1)) as string[];
    const lineHeightFactor =
      typeof doc.getLineHeightFactor === 'function' ? doc.getLineHeightFactor() : 1.15;
    const lineHeightMm = fontSizePt * 0.352778 * lineHeightFactor;
    // Border stroke (~lineWidth) so blank planning does not overfill the page.
    const borderFudgeMm = 0.12;
    return Math.max(lineHeightMm + padY, lines.length * lineHeightMm + padY) + borderFudgeMm;
  }

  private rowCellText(cell: unknown): string {
    if (cell == null) return '';
    if (typeof cell === 'string' || typeof cell === 'number') return String(cell);
    if (typeof cell === 'object' && cell !== null && 'content' in cell) {
      const content = (cell as { content?: unknown }).content;
      return content == null ? '' : String(content);
    }
    return '';
  }

  private blankProductRows(count: number, minHeightMm: number): RowInput[] {
    if (count <= 0) return [];
    const h = Math.max(minHeightMm, QUOTATION_PDF_LAYOUT.blankRowHeightMm);
    return Array.from({ length: count }, () => [
      { content: ' ', styles: { minCellHeight: h } },
      { content: ' ', styles: { minCellHeight: h } },
      { content: ' ', styles: { minCellHeight: h } },
      { content: ' ', styles: { minCellHeight: h } },
      { content: ' ', styles: { minCellHeight: h } },
    ]);
  }

  /**
   * Fills leftover product-table space with blank rows, shrinking when the closing
   * block (terms/totals/signatory) needs room on the final page.
   * Uses a small safety margin so estimation error never pushes closing onto a
   * new page while blank spacer rows still remain above.
   */
  private planDynamicBlankRowCount(opts: {
    itemHeights: number[];
    headHeight: number;
    blankRowHeight: number;
    totalRowHeight: number;
    closingHeight: number;
    firstPageTableTop: number;
    continuationTableTop: number;
    contentBottomY: number;
  }): number {
    const {
      itemHeights,
      headHeight,
      blankRowHeight,
      totalRowHeight,
      closingHeight,
      firstPageTableTop,
      continuationTableTop,
      contentBottomY,
    } = opts;

    if (blankRowHeight <= 0) return 0;

    // Modest slack — enough to avoid overflow, without leaving a large footer gap.
    const safetyMm = 1;

    const bodyBudget = (pageIndex: number): number => {
      const top = pageIndex === 0 ? firstPageTableTop : continuationTableTop;
      return Math.max(0, contentBottomY - top - headHeight);
    };

    const heights = itemHeights.length ? [...itemHeights] : [blankRowHeight];
    let pageIndex = 0;
    let usedOnPage = 0;

    while (heights.length) {
      const budget = bodyBudget(pageIndex);
      usedOnPage = 0;
      let placed = 0;

      while (heights.length) {
        const next = heights[0];
        if (placed > 0 && usedOnPage + next > budget) break;
        heights.shift();
        usedOnPage += next;
        placed += 1;
        if (usedOnPage >= budget) break;
      }

      if (heights.length) {
        pageIndex += 1;
      }
    }

    const lastBudget = bodyBudget(pageIndex);
    const remaining = Math.max(0, lastBudget - usedOnPage);
    const closingWithTotal = totalRowHeight + closingHeight + safetyMm;

    const blanksThatFit = (spaceMm: number): number => {
      if (spaceMm <= 0) return 0;
      // Prefer filling when leftover is most of a blank row (no forced extra rows).
      return Math.max(0, Math.floor(spaceMm / blankRowHeight + 0.2));
    };

    if (remaining >= closingWithTotal) {
      return blanksThatFit(remaining - closingWithTotal);
    }

    // Fill the remainder of the last product page, then pad the next page so
    // Total + closing blocks land together after the product table.
    const blanksOnLastProductPage = blanksThatFit(remaining);
    const continuationBudget = Math.max(0, contentBottomY - continuationTableTop - headHeight);
    const blanksOnClosingPage = blanksThatFit(continuationBudget - closingWithTotal);

    return blanksOnLastProductPage + blanksOnClosingPage;
  }

  /** Probe-render terms + signature with the same styles as the real document. */
  private measureClosingBlocksHeight(opts: {
    contentW: number;
    margin: number;
    footerReserveMm: number;
    tableStyles: Record<string, unknown>;
    footerRows: RowInput[];
    termsDetailW: number;
    totalsLabelW: number;
    totalsValueW: number;
    termsW: number;
    totalsW: number;
    jurisdiction: string;
    sigBlock: string;
  }): number {
    const L = QUOTATION_PDF_LAYOUT;
    const probe = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageH = probe.internal.pageSize.getHeight();
    const jurisdictionText = opts.jurisdiction?.trim()
      ? `" ${opts.jurisdiction.trim()} "`
      : '';

    autoTable(probe, {
      startY: 0,
      margin: { left: opts.margin, right: opts.margin, bottom: opts.footerReserveMm },
      tableWidth: opts.contentW,
      theme: 'grid',
      styles: {
        ...opts.tableStyles,
        fontSize: L.fontSize.terms,
        cellPadding: L.termsDetailCellPaddingMm,
        overflow: 'linebreak',
        minCellHeight: L.footerMinCellHeightMm,
      },
      body: opts.footerRows,
      columnStyles: {
        0: { cellWidth: L.termsIndexWidthMm, halign: 'center', valign: 'top' },
        1: { cellWidth: L.termsTitleWidthMm, valign: 'top', fontStyle: 'normal' },
        2: { cellWidth: opts.termsDetailW, valign: 'top', cellPadding: L.termsDetailCellPaddingMm },
        3: {
          cellWidth: opts.totalsLabelW,
          halign: 'left',
          valign: 'top',
          cellPadding: L.totalsCellPaddingMm,
        },
        4: {
          cellWidth: opts.totalsValueW,
          halign: 'right',
          valign: 'top',
          cellPadding: L.totalsCellPaddingMm,
        },
      },
    });

    let y = (probe as DocWithTable).lastAutoTable?.finalY ?? 40;

    autoTable(probe, {
      startY: y,
      margin: { left: opts.margin, right: opts.margin, bottom: opts.footerReserveMm },
      tableWidth: opts.contentW,
      theme: 'grid',
      styles: {
        ...opts.tableStyles,
        fontSize: L.fontSize.body,
        cellPadding: L.closingRowPaddingMm,
        minCellHeight: L.closingRowHeightMm,
        valign: 'middle',
      },
      body: [
        [
          {
            content: jurisdictionText,
            styles: { halign: 'center', fontStyle: 'italic', valign: 'middle' },
          },
          {
            content: opts.sigBlock,
            styles: { halign: 'center', fontStyle: 'bold', valign: 'middle' },
          },
        ],
      ],
      columnStyles: {
        0: { cellWidth: opts.termsW },
        1: { cellWidth: opts.totalsW },
      },
    });

    y = (probe as DocWithTable).lastAutoTable?.finalY ?? y + L.closingRowHeightMm;
    const pages = probe.getNumberOfPages();
    if (pages <= 1) return y;
    return (pages - 1) * pageH + y;
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

  private additionalChargesTotal(q: QuotationUpsertDto): number {
    return additionalChargesTotal({
      transportationCharges: q.transportationCharges ?? 0,
      loadingCharges: q.loadingCharges ?? 0,
      serviceCharges: q.serviceCharges ?? 0,
      customCharges: (q.customCharges ?? []).map((c, i) => ({
        sortIndex: c.sortIndex ?? i,
        chargeName: c.chargeName,
        amount: c.amount,
      })),
    });
  }

  private subtotal(q: QuotationUpsertDto): number {
    if (q.subtotal != null && q.subtotal > 0) return q.subtotal;
    return (q.lineItems ?? []).reduce((s, l) => s + (l.amount || 0), 0);
  }

  private resolveTaxTotal(q: QuotationUpsertDto, taxableAmount: number): number {
    if (q.taxTotal != null && q.taxTotal > 0) return q.taxTotal;
    const headerGst = q.gstPercent ?? 0;
    if (headerGst > 0 && taxableAmount > 0) {
      return Math.round(taxableAmount * (headerGst / 100) * 100) / 100;
    }
    if (q.taxTotal != null) return q.taxTotal;
    return (q.lineItems ?? []).reduce((s, l) => s + (l.taxAmount || 0), 0);
  }

  private resolveGrandTotal(q: QuotationUpsertDto, taxableAmount: number, taxTotal: number): number {
    if (q.grandTotal != null && q.grandTotal > 0) return q.grandTotal;
    return Math.round((taxableAmount + taxTotal) * 100) / 100;
  }

  private effectiveGstPercent(q: QuotationUpsertDto, taxableAmount: number, taxTotal: number): number {
    if ((q.gstPercent ?? 0) > 0) return q.gstPercent ?? 0;
    const lines = q.lineItems ?? [];
    if (lines.length) {
      const withGst = lines.filter((l) => (l.gstPercent ?? 0) > 0);
      if (withGst.length) {
        const avg = withGst.reduce((s, l) => s + (l.gstPercent ?? 0), 0) / withGst.length;
        return Math.round(avg * 100) / 100;
      }
    }
    if (taxableAmount > 0 && taxTotal > 0) {
      return Math.round((taxTotal / taxableAmount) * 10000) / 100;
    }
    return QUOTATION_PDF_COMPANY.defaultGstPercent;
  }

  private contactLine(q: QuotationUpsertDto): string {
    const email = q.emailAddress?.trim();
    const phone = formatIntlTelDisplay(q.mobileNumber?.trim());
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
    additionalLines: { label: string; amount: number }[],
    taxTotal: number,
    grandTotal: number,
    gstPercent: number,
  ): RowInput[] {
    const terms = this.resolveTermsWithBank(company);
    const rows: RowInput[] = [
      [
        { content: 'Terms & Conditions:', colSpan: 3, styles: { fontStyle: 'bold' as const } },
        { content: 'Subtotal:', styles: { fontStyle: 'bold' as const } },
        { content: this.formatMoney(subtotal), styles: { halign: 'right' as const } },
      ],
    ];

    const termRows: RowInput[] = [];
    const usedChargeIndices = new Set<number>();
    let gstRowAdded = false;
    let grandTotalRowAdded = false;

    if (!terms.length) {
      termRows.push([
        { content: '—', colSpan: 3, styles: { fontStyle: 'italic' as const } },
        '',
        '',
      ]);
      this.appendMissingTotalsRows(termRows, taxTotal, grandTotal, gstPercent, gstRowAdded, grandTotalRowAdded);
      rows.push(...termRows);
      return rows;
    }

    let termNum = 0;
    for (const term of terms) {
      termNum += 1;
      const title = term.title.trim();
      const body = this.formatTermBody(term.body);

      if (/payment terms/i.test(title)) {
        termRows.push([
          String(termNum),
          title,
          body,
          `Add. : GST @ ${gstPercent}%`,
          { content: this.formatMoney(taxTotal), styles: { halign: 'right' as const } },
        ]);
        gstRowAdded = true;
        continue;
      }

      if (/^transportation$/i.test(title)) {
        termRows.push([
          String(termNum),
          title,
          body,
          { content: 'Total Amount (Rs):', styles: { fontStyle: 'bold' as const } },
          {
            content: this.formatMoney(grandTotal),
            styles: { fontStyle: 'bold' as const, halign: 'right' as const },
          },
        ]);
        grandTotalRowAdded = true;
        continue;
      }

      if (/^validity$/i.test(title) && company.signatureEntity) {
        termRows.push([
          String(termNum),
          title,
          body,
          {
            content: `For ${company.signatureEntity}`,
            colSpan: 2,
            styles: {
              fontStyle: 'bold' as const,
              halign: 'center' as const,
              valign: 'middle' as const,
            },
          },
        ]);
        continue;
      }

      if (/^taxes$/i.test(title)) {
        const serviceBlock = this.collectTaxesRowCharges(additionalLines, usedChargeIndices);
        if (serviceBlock) {
          termRows.push([
            String(termNum),
            title,
            body,
            serviceBlock.labels,
            {
              content: serviceBlock.amounts,
              styles: { halign: 'right' as const, valign: 'top' as const },
            },
          ]);
          continue;
        }
        termRows.push([String(termNum), title, body, '', '']);
        continue;
      }

      const charge = this.pickChargeForTerm(title, additionalLines, usedChargeIndices);
      if (charge) {
        termRows.push([
          String(termNum),
          title,
          body,
          charge.label,
          { content: this.formatMoney(charge.amount), styles: { halign: 'right' as const } },
        ]);
        continue;
      }

      termRows.push([String(termNum), title, body, '', '']);
    }

    this.appendMissingTotalsRows(termRows, taxTotal, grandTotal, gstPercent, gstRowAdded, grandTotalRowAdded);
    rows.push(...termRows);
    return rows;
  }

  /** Service Charges field + all Add Charge rows on the Taxes term row. */
  private collectTaxesRowCharges(
    additionalLines: { label: string; amount: number }[],
    used: Set<number>,
  ): { labels: string; amounts: string } | null {
    const rows: { label: string; amount: number }[] = [];

    for (let i = 0; i < additionalLines.length; i++) {
      if (used.has(i)) continue;
      if (/^service charges$/i.test(additionalLines[i].label.trim())) {
        used.add(i);
        rows.push(additionalLines[i]);
        break;
      }
    }

    for (let i = 0; i < additionalLines.length; i++) {
      if (used.has(i)) continue;
      if (/transportation charges/i.test(additionalLines[i].label)) continue;
      if (/loading charges/i.test(additionalLines[i].label)) continue;
      used.add(i);
      rows.push(additionalLines[i]);
    }

    if (!rows.length) return null;

    return {
      labels: rows.map((r) => r.label).join('\n'),
      amounts: rows.map((r) => this.formatMoney(r.amount)).join('\n'),
    };
  }

  /** Map term titles to charge lines: Order→Transport, Delivery→Loading. */
  private pickChargeForTerm(
    title: string,
    additionalLines: { label: string; amount: number }[],
    used: Set<number>,
  ): { label: string; amount: number } | undefined {
    let matcher: RegExp | null = null;
    if (/order\s*&\s*payment|order and payment/i.test(title)) matcher = /transportation/i;
    else if (/delivery/i.test(title)) matcher = /loading/i;

    if (!matcher) return undefined;

    for (let i = 0; i < additionalLines.length; i++) {
      if (used.has(i)) continue;
      if (matcher.test(additionalLines[i].label)) {
        used.add(i);
        return additionalLines[i];
      }
    }

    return undefined;
  }

  /** GST and grand total align with "Taxes" / "Payment Terms" when present; otherwise append after terms. */
  private appendMissingTotalsRows(
    rows: RowInput[],
    taxTotal: number,
    grandTotal: number,
    gstPercent: number,
    gstRowAdded: boolean,
    grandTotalRowAdded: boolean,
  ): void {
    if (!gstRowAdded && (taxTotal > 0 || gstPercent > 0)) {
      const label = gstPercent > 0 ? `GST @ ${gstPercent}%` : 'GST';
      rows.push([
        { content: '', colSpan: 3 },
        label,
        { content: this.formatMoney(taxTotal), styles: { halign: 'right' as const } },
      ]);
    }
    if (!grandTotalRowAdded && grandTotal > 0) {
      rows.push([
        { content: '', colSpan: 3 },
        { content: 'Grand total:', styles: { fontStyle: 'bold' as const } },
        {
          content: this.formatMoney(grandTotal),
          styles: { fontStyle: 'bold' as const, halign: 'right' as const },
        },
      ]);
    }
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

  /** Preserve textarea line breaks; wrap each paragraph to the intro cell width. */
  private wrapBusinessLineForCell(
    doc: jsPDF,
    text: string,
    maxWidthMm: number,
    fontSize: number,
  ): string {
    const normalized = text.replace(/^(Dear\s+[^,\n]+,)\s+(?=\S)/i, '$1\n\n');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    const lines: string[] = [];
    for (const part of normalized.split(/\r?\n/)) {
      if (!part.trim()) {
        lines.push('');
        continue;
      }
      lines.push(...(doc.splitTextToSize(part.trim(), maxWidthMm) as string[]));
    }
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
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

  /** Downscale large logos for PDF only; falls back to the original when optimization is skipped or fails. */
  private async withPdfOptimizedLogo(
    company: QuotationPdfCompanyConfig,
  ): Promise<QuotationPdfCompanyConfig> {
    const base64 = company.logoBase64?.trim();
    const contentType = company.logoContentType?.trim();
    if (!base64 || !contentType || !this.logoImageFormat(contentType)) {
      return company;
    }

    const prepared = await this.prepareLogoForPdf(base64, contentType, QUOTATION_PDF_LAYOUT.logoMaxPx);
    if (!prepared) {
      return company;
    }

    return {
      ...company,
      logoBase64: prepared.base64,
      logoContentType: prepared.contentType,
      logoPixelWidth: prepared.width,
      logoPixelHeight: prepared.height,
    };
  }

  private prepareLogoForPdf(
    base64: string,
    contentType: string,
    maxPx: number,
  ): Promise<{ base64: string; contentType: string; width: number; height: number } | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (!img.width || !img.height) {
          resolve(null);
          return;
        }

        const longest = Math.max(img.width, img.height);
        const scale = longest > maxPx ? maxPx / longest : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        if (scale >= 1) {
          resolve({ base64, contentType, width: img.width, height: img.height });
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ base64, contentType, width: img.width, height: img.height });
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);

        const isPng = contentType.toLowerCase().includes('png');
        const dataUrl = isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
        const comma = dataUrl.indexOf(',');
        if (comma < 0) {
          resolve({ base64, contentType, width: img.width, height: img.height });
          return;
        }

        resolve({
          base64: dataUrl.slice(comma + 1),
          contentType: isPng ? 'image/png' : 'image/jpeg',
          width: w,
          height: h,
        });
      };
      img.onerror = () => resolve(null);
      img.src = `data:${contentType};base64,${base64}`;
    });
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
