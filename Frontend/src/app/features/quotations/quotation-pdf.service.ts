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
      const headerTop = margin;
      const headerLeft = margin;
      const headerRight = margin + contentW;

      doc.setTextColor(0, 0, 0);

      // Left section
      let textY = headerTop + 4;

      // Legal Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      const nameLines = doc.splitTextToSize(C.legalName, contentW - 75) as string[];
      doc.text(nameLines, headerLeft, textY);
      textY += nameLines.length * 4.2;

      // Business line/tagline
      const taglineText = C.brandTagline?.trim() || C.businessLine?.trim() || '';
      if (taglineText) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 100, 100);
        const taglineLines = doc.splitTextToSize(taglineText, contentW - 75) as string[];
        doc.text(taglineLines, headerLeft, textY);
        textY += taglineLines.length * 3.6;
      }

      // GSTIN & CIN
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      const taxParts: string[] = [];
      if (C.gstin) taxParts.push(`GSTIN: ${C.gstin}`);
      if (C.cin) taxParts.push(`CIN: ${C.cin}`);
      if (taxParts.length) {
        doc.text(taxParts.join(' | '), headerLeft, textY);
        textY += 4;
      }

      // Ref (Quotation Number)
      if (q.quotationNumber) {
        doc.text(`Ref: ${q.quotationNumber}`, headerLeft, textY);
        textY += 4;
      }

      // Date
      if (q.quotationDate) {
        doc.text(`Date: ${this.formatDate(q.quotationDate)}`, headerLeft, textY);
        textY += 4;
      }

      // Logo on the right
      const logoFormat = this.logoImageFormat(C.logoContentType);
      const hasLogo = !!(C.logoBase64 && logoFormat);
      if (hasLogo) {
        const logoAspect =
          C.logoPixelWidth && C.logoPixelHeight && C.logoPixelHeight > 0
            ? C.logoPixelWidth / C.logoPixelHeight
            : 1;
        const availH = 22;
        const availW = 40;
        let fitW = availW;
        let fitH = fitW / Math.max(logoAspect, 0.01);
        if (fitH > availH) {
          fitH = availH;
          fitW = fitH * logoAspect;
        }
        const logoX = headerRight - fitW;
        const logoY = headerTop;
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
          // Ignore logo errors
        }
      }

      // Draw horizontal line below the header
      const headerBottomY = headerTop + headerHeight;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(headerLeft, headerBottomY, headerRight, headerBottomY);

      y = headerBottomY + L.sectionGapMm;
    };

    const drawFooter = (pageNumber: number, totalPages: number): void => {
      const footerY = pageH - margin - 10;

      // Draw top line
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.15);
      doc.line(margin, footerY, margin + contentW, footerY);

      doc.setTextColor(80, 80, 80);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);

      // Address line
      const addrLine = `Registered Office: ${C.address}`;
      doc.text(addrLine, pageW / 2, footerY + 3.5, { align: 'center' });

      const emailPart = C.emails.length ? `Email: ${C.emails.join(', ')}` : '';
      const webPart = C.website ? `Web: ${C.website}` : '';
      const contactLine = [emailPart, webPart].filter(Boolean).join(' | ');
      doc.text(contactLine, pageW / 2, footerY + 7, { align: 'center' });

      if (totalPages > 1) {
        doc.setFontSize(6);
        doc.text(
          `Page ${pageNumber} of ${totalPages}`,
          margin + contentW,
          footerY - 1.5,
          { align: 'right' },
        );
      }
    };

    /** Repeat company header on autoTable continuation pages (page 1 already drawn). */
    const ensureHeaderOnTablePage = (tablePageNumber: number): void => {
      if (tablePageNumber > 1) {
        drawHeader();
      }
    };

    drawHeader();

    // Centered Title "Quotation"
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.text('Quotation', pageW / 2, y + 4, { align: 'center' });
    y += 7;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(margin, y, margin + contentW, y);
    y += 5;

    // Two-column layout
    const colLeftW = 65;
    const colRightW = 60;
    const col2X = margin + contentW - colRightW;

    const getTermValue = (regex: RegExp, fallback: string): string => {
      const found = (C.terms || []).find((t) => regex.test(t.title));
      if (found) {
        return found.body.replace(/^:\s*/, '').trim();
      }
      return fallback;
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('QUOTATION FOR', margin, y);
    doc.text('DETAILS & REFERENCES', col2X, y);
    y += 4.5;

    // Left Column: Customer details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    const custName = q.companyName || q.customerName || '—';
    const custNameLines = doc.splitTextToSize(custName, colLeftW) as string[];
    doc.text(custNameLines, margin, y);

    // Right Column: Validity
    const valText = getTermValue(/validity/i, '15 Days from Issue Date');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Validity:', col2X, y);
    doc.setFont('helvetica', 'normal');
    const valLines = doc.splitTextToSize(valText, colRightW - 14) as string[];
    valLines.forEach((line, idx) => {
      const x = idx === 0 ? col2X + 14 : col2X;
      doc.text(line, x, y + idx * 3.8);
    });

    let metaLeftY = y + custNameLines.length * 4;
    let metaRightY = y + valLines.length * 3.8 + 0.8;

    // Left Column: Address details
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(50, 50, 50);
    const addrText = [q.officeAddress, q.siteAddress ? `Site: ${q.siteAddress}` : ''].filter(Boolean).join('\n');
    const addrLines = doc.splitTextToSize(addrText, colLeftW) as string[];
    doc.text(addrLines, margin, metaLeftY);
    metaLeftY += addrLines.length * 3.8;

    // Left Column: Attn line
    const attnName = q.contactPerson?.trim();
    const attnPhone = q.mobileNumber?.trim();
    if (attnName) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Attn:', margin, metaLeftY);
      doc.setFont('helvetica', 'normal');
      const attnValText = attnPhone ? `${attnName} (${attnPhone})` : attnName;
      const attnValLines = doc.splitTextToSize(attnValText, colLeftW - 10) as string[];
      attnValLines.forEach((line, idx) => {
        const x = idx === 0 ? margin + 10 : margin;
        doc.text(line, x, metaLeftY + idx * 3.8);
      });
      metaLeftY += attnValLines.length * 3.8;
    }

    // Right Column: Enquiry Ref
    const refValText = q.referenceNumber ? (q.referenceDate ? `${q.referenceNumber} dated ${this.formatDate(q.referenceDate)}` : q.referenceNumber) : '—';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Enquiry Ref:', col2X, metaRightY);
    doc.setFont('helvetica', 'normal');
    const enquiryRefLines = doc.splitTextToSize(refValText, colRightW - 22) as string[];
    enquiryRefLines.forEach((line, idx) => {
      const x = idx === 0 ? col2X + 22 : col2X;
      doc.text(line, x, metaRightY + idx * 3.8);
    });
    metaRightY += enquiryRefLines.length * 3.8 + 0.8;

    // Right Column: Payment Terms
    const payText = getTermValue(/payment terms/i, '70% Advance, 30% Before Dispatch');
    doc.setFont('helvetica', 'bold');
    doc.text('Payment Terms:', col2X, metaRightY);
    doc.setFont('helvetica', 'normal');
    const payLines = doc.splitTextToSize(payText, colRightW - 26) as string[];
    payLines.forEach((line, idx) => {
      const x = idx === 0 ? col2X + 26 : col2X;
      doc.text(line, x, metaRightY + idx * 3.8);
    });
    metaRightY += payLines.length * 3.8 + 0.8;

    // Right Column: Dispatch Port
    const dispText = getTermValue(/dispatch/i, q.transportationLabel || 'Wakad Works, Pune');
    doc.setFont('helvetica', 'bold');
    doc.text('Dispatch Port:', col2X, metaRightY);
    doc.setFont('helvetica', 'normal');
    const dispLines = doc.splitTextToSize(dispText, colRightW - 24) as string[];
    dispLines.forEach((line, idx) => {
      const x = idx === 0 ? col2X + 24 : col2X;
      doc.text(line, x, metaRightY + idx * 3.8);
    });
    metaRightY += dispLines.length * 3.8 + 0.8;

    // Final Y coordinate
    y = Math.max(metaLeftY, metaRightY) + 5;

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
      '#',
      'DESCRIPTION',
      'QTY',
      'RATE (Rs.)',
      'AMOUNT (Rs.)',
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
        this.estimateCellHeightMm(doc, label, productHeadWidths[i], L.fontSize.body, 2.8),
      ),
      L.lineItemHeadHeightMm,
    );
    const blankRowHeight = Math.max(
      L.blankRowHeightMm,
      this.estimateCellHeightMm(doc, ' ', lineDescW, L.fontSize.body, 2.8),
    );
    const totalRowHeight = 0; // Removed table footer
    const itemHeights = lineRows.map((row) => {
      const cells = row as unknown as unknown[];
      const desc = this.rowCellText(cells[1]);
      return this.estimateCellHeightMm(doc, desc, lineDescW, L.fontSize.body, 2.8);
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
      2: { cellWidth: L.lineQtyWidthMm, halign: 'center' as const },
      3: { cellWidth: L.lineRateWidthMm, halign: 'center' as const },
      4: { cellWidth: L.lineAmountWidthMm, halign: 'center' as const },
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
      textColor: [0, 0, 0] as [number, number, number],
      fontStyle: 'bold' as const,
      valign: 'middle' as const,
    };

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, top: pageTopMargin, bottom: L.footerReserveMm },
      tableWidth: contentW,
      theme: 'plain',
      head: [productHeadLabels],
      body: productBody,
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        ...tableStyles,
        cellPadding: 2.8,
        lineWidth: 0,
      },
      headStyles: {
        ...productHeadStyles,
        lineWidth: 0,
      },
      columnStyles: productColumnStyles,
      willDrawCell: (data) => {
        if (data.column.index === 1 && data.row.section === 'body' && data.row.index < q.lineItems.length) {
          // Clear default drawing so didDrawCell can render custom bold/normal text
          data.cell.text = [];
        }
      },
      didDrawCell: (data) => {
        // Draw bottom horizontal border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.15);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);

        // Header top border
        if (data.row.section === 'head') {
          doc.setDrawColor(100, 100, 100);
          doc.setLineWidth(0.2);
          doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
          doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }

        // Custom bold drawing for item name, normal for description (inline)
        if (data.column.index === 1 && data.row.section === 'body' && data.row.index < q.lineItems.length) {
          const line = q.lineItems[data.row.index];
          if (line) {
            let mainName = line.itemName || line.itemCode || '—';
            let description = line.description?.trim() || '';

            // If mainName contains parenthesized text, split it so only the prefix is bolded
            const parenIndex = mainName.indexOf('(');
            if (parenIndex >= 0) {
              const extractedDesc = mainName.slice(parenIndex).trim();
              mainName = mainName.slice(0, parenIndex).trim();
              description = description ? `${extractedDesc} ${description}` : extractedDesc;
            }

            // Standardize description with parentheses if not already present
            if (description && !description.startsWith('(')) {
              description = `(${description})`;
            }

            const fullText = description ? `${mainName} ${description}` : mainName;

            doc.setFontSize(8);
            const lines = doc.splitTextToSize(fullText, data.cell.width - 4) as string[];
            const cellH = data.cell.height;
            const textHeight = lines.length * 3.6;
            const textY = data.cell.y + (cellH - textHeight) / 2 + 2.5;

            let charIndex = 0;
            lines.forEach((lText, idx) => {
              const lineY = textY + idx * 3.6;
              let currentX = data.cell.x + 2;

              // Boundaries in fullText
              const lineStart = charIndex;
              const lineEnd = charIndex + lText.length;
              const L = mainName.length;

              if (lineEnd <= L) {
                // Entire line is bold
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(lText, currentX, lineY);
              } else if (lineStart >= L) {
                // Entire line is normal grey
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100, 100, 100);
                doc.text(lText, currentX, lineY);
              } else {
                // Transition line: bold prefix, normal suffix
                const boldPart = fullText.slice(lineStart, L);
                const normalPart = fullText.slice(L, lineEnd);

                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(boldPart, currentX, lineY);

                const boldWidth = doc.getTextWidth(boldPart);
                currentX += boldWidth;

                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100, 100, 100);
                doc.text(normalPart, currentX, lineY);
              }

              // Update charIndex for next line
              const foundIndex = fullText.indexOf(lText, charIndex);
              if (foundIndex >= 0) {
                charIndex = foundIndex + lText.length;
              } else {
                charIndex += lText.length + 1;
              }
            });

            // Restore normal font style so other columns/rows are unaffected
            doc.setFont('helvetica', 'normal');
          }
        }
      },
      willDrawPage: (data) => ensureHeaderOnTablePage(data.pageNumber),
    });

    y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 20;

    // Check if bottom section fits on this page using the computed closingHeight
    if (y + closingHeight > contentBottomY) {
      doc.addPage();
      drawHeader();
    }

    const startY = y;
    let leftY = y;

    // --- LEFT COLUMN: Bank Details & Terms ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('BANK DETAILS FOR PAYMENT', margin, leftY);
    leftY += 3.5;

    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);

    // Account Name
    doc.setFont('helvetica', 'bold');
    doc.text('Account Name:', margin, leftY);
    doc.setFont('helvetica', 'normal');
    doc.text(` ${C.legalName || C.signatureEntity}`, margin + 22, leftY);
    leftY += 4.2;

    // Bank Name
    doc.setFont('helvetica', 'bold');
    doc.text('Bank:', margin, leftY);
    doc.setFont('helvetica', 'normal');
    const bankVal = C.bankName ? (C.branchName ? `${C.bankName}, ${C.branchName}` : C.bankName) : '—';
    doc.text(` ${bankVal}`, margin + 9, leftY);
    leftY += 4.2;

    // A/C No & IFSC
    doc.setFont('helvetica', 'bold');
    doc.text('A/C No:', margin, leftY);
    doc.setFont('helvetica', 'normal');
    doc.text(` ${C.accountNumber || '—'}`, margin + 12, leftY);

    doc.setFont('helvetica', 'bold');
    doc.text('|  IFSC:', margin + 45, leftY);
    doc.setFont('helvetica', 'normal');
    doc.text(` ${C.ifscCode || '—'}`, margin + 58, leftY);
    leftY += 7;

    // TERMS & CONDITIONS
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('TERMS & CONDITIONS', margin, leftY);
    leftY += 2;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.15);
    doc.line(margin, leftY, margin + contentW * 0.55, leftY);
    leftY += 4.5;

    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    const termsList = C.terms || [];
    termsList.forEach((term, index) => {
      doc.setFont('helvetica', 'normal');
      const termBodyClean = term.body.replace(/^:\s*/, '').trim();
      const termText = `${index + 1}. ${term.title}: ${termBodyClean}`;
      const termLines = doc.splitTextToSize(termText, contentW * 0.55) as string[];
      doc.text(termLines, margin, leftY);
      leftY += termLines.length * 3.6;
    });

    // --- RIGHT COLUMN: Totals ---
    let rightY = startY + 4;
    const rightColX = margin + contentW * 0.60;
    const rightAlignX = margin + contentW;

    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);

    // Subtotal
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal:', rightColX, rightY);
    doc.setFont('helvetica', 'bold');
    doc.text(`Rs. ${this.formatMoney(subtotal)}`, rightAlignX, rightY, { align: 'right' });
    rightY += 5;

    // GST
    doc.setFont('helvetica', 'normal');
    doc.text(`GST @ ${gstPercent}%:`, rightColX, rightY);
    doc.setFont('helvetica', 'bold');
    doc.text(`Rs. ${this.formatMoney(taxTotal)}`, rightAlignX, rightY, { align: 'right' });
    rightY += 5;

    // Freight & Handling
    doc.setFont('helvetica', 'normal');
    doc.text('Freight & Handling:', rightColX, rightY);
    doc.setFont('helvetica', 'bold');
    doc.text(`Rs. ${this.formatMoney(additionalTotal)}`, rightAlignX, rightY, { align: 'right' });
    rightY += 4.5;

    // Thick divider line
    doc.setDrawColor(50, 50, 50);
    doc.setLineWidth(0.4);
    doc.line(rightColX, rightY, rightAlignX, rightY);
    rightY += 4.5;

    // Total Amount
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Total Amount:', rightColX, rightY);
    doc.text(`Rs. ${this.formatMoney(grandTotal)}`, rightAlignX, rightY, { align: 'right' });
    rightY += 3.5;

    // Thin divider line
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.15);
    doc.line(rightColX, rightY, rightAlignX, rightY);
    rightY += 4.5;

    // Amount in Words
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Amount in Words:', rightColX, rightY);
    rightY += 3.5;
    doc.setFont('helvetica', 'oblique');
    doc.setTextColor(100, 100, 100);
    const words = this.amountToWords(grandTotal);
    const wordLines = doc.splitTextToSize(words, contentW * 0.40) as string[];
    doc.text(wordLines, rightColX, rightY);
    rightY += wordLines.length * 3.6;

    // --- SIGNATORY & CLOSING SECTION ---
    y = Math.max(leftY, rightY) + 6;

    const sigHeight = 25;
    if (y + sigHeight > contentBottomY) {
      doc.addPage();
      drawHeader();
      y = margin + headerHeight + L.sectionGapMm + 6;
    }

    // Subject to Jurisdiction
    doc.setFont('helvetica', 'oblique');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    const jText = C.jurisdiction?.trim() ? `Subject to ${C.jurisdiction.trim()} Jurisdiction` : '';
    doc.text(jText, margin, y + 16);

    // Signatory
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`For ${C.legalName || C.signatureEntity}`, rightAlignX, y, { align: 'right' });
    doc.text(sigName, rightAlignX, y + 16, { align: 'right' });
    if (sigPhone) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`Contact: ${sigPhone}`, rightAlignX, y + 20, { align: 'right' });
    }

    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      drawFooter(p, totalPages);
    }

    return doc;
  }

  private amountToWords(amount: number): string {
    const absAmount = Math.floor(Math.abs(amount));
    if (absAmount === 0) return 'Zero Rupees Only';

    const ones = [
      '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const tens = [
      '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
    ];

    const convertLessThanOneThousand = (num: number): string => {
      let str = '';
      if (num >= 100) {
        str += ones[Math.floor(num / 100)] + ' Hundred ';
        num %= 100;
      }
      if (num >= 20) {
        str += tens[Math.floor(num / 10)] + ' ';
        num %= 10;
      }
      if (num > 0) {
        str += ones[num] + ' ';
      }
      return str.trim();
    };

    let remaining = absAmount;
    let word = '';

    // Crores
    if (remaining >= 10000000) {
      word += convertLessThanOneThousand(Math.floor(remaining / 10000000)) + ' Crore ';
      remaining %= 10000000;
    }
    // Lakhs
    if (remaining >= 100000) {
      word += convertLessThanOneThousand(Math.floor(remaining / 100000)) + ' Lakh ';
      remaining %= 100000;
    }
    // Thousands
    if (remaining >= 1000) {
      word += convertLessThanOneThousand(Math.floor(remaining / 1000)) + ' Thousand ';
      remaining %= 1000;
    }
    // Hundreds & Tens
    if (remaining > 0) {
      word += convertLessThanOneThousand(remaining);
    }

    const trimmed = word.trim().replace(/\s+/g, ' ');
    return `${trimmed} Rupees Only.`;
  }

  private measureCompanyHeaderHeight(
    doc: jsPDF,
    company: QuotationPdfCompanyConfig,
    contentW: number,
  ): number {
    let height = 4; // padding top

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const nameLines = doc.splitTextToSize(company.legalName, contentW - 75) as string[];
    height += nameLines.length * 4.2;

    const taglineText = company.brandTagline?.trim() || company.businessLine?.trim() || '';
    if (taglineText) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const taglineLines = doc.splitTextToSize(taglineText, contentW - 75) as string[];
      height += taglineLines.length * 3.6;
    }

    if (company.gstin || company.cin) {
      height += 4;
    }

    height += 8; // Ref and Date lines

    // Ensure min height for logo if present
    const logoFormat = this.logoImageFormat(company.logoContentType);
    const hasLogo = !!(company.logoBase64 && logoFormat);
    if (hasLogo) {
      return Math.max(height, 22) + 2;
    }

    return height + 2;
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
      const safetyBufferMm = 12;
      return blanksThatFit(remaining - closingWithTotal - safetyBufferMm);
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
    const bankDetailsHeight = 22;
    const termsCount = opts.footerRows.length;
    const termsHeight = termsCount * 4.2;

    const leftColHeight = bankDetailsHeight + termsHeight;
    const rightColHeight = 35;

    const sigHeight = 22;

    return Math.max(leftColHeight, rightColHeight) + sigHeight;
  }

  private lineItemRows(items: QuotationLineItemDto[]): RowInput[] {
    if (!items.length) {
      return [['—', 'No line items', '—', '—', '—']];
    }
    return items.map((line, i) => {
      // In reference image: Name (Description) instead of Name — Description.
      // E.g.: Scaffolding Cuplock Vertical (3.0 Metre, Heavy Duty)
      const descParts = [line.itemName];
      if (line.description?.trim()) {
        descParts.push(`(${line.description.trim()})`);
      }
      const desc = descParts.join(' ') || line.itemCode || '—';
      const qty = line.quantity ?? 0;
      const uom = line.uom?.trim() || 'Nos';
      const rate = line.rate ?? 0;
      const total = line.lineTotal || line.amount || 0;
      return [
        String(i + 1),
        desc,
        qty > 0 ? `${this.formatQty(qty)} ${uom}` : '—',
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
