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
    const halfW = contentW / 2;

    const lineSrW = 10;
    const lineQtyW = 20;
    const lineRateW = 28;
    const lineAmountW = 30;
    const lineDescW = contentW - lineSrW - lineQtyW - lineRateW - lineAmountW;

    const borderColor: [number, number, number] = [0, 0, 0];

    let y = 0;
    const headerHeight = this.measureCompanyHeaderHeight(doc, C, contentW);
    const pageTopMargin = margin + headerHeight;
    const contentBottomY = pageH - L.footerReserveMm;
    const footerY = pageH - margin - 10;

    const drawPageFrame = (): void => {
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(0.4); // 1.5px outer border
      doc.rect(margin, margin, contentW, pageH - margin * 2);
    };

    const drawHeader = (): void => {
      const headerTop = margin;
      const headerLeft = margin + 3.5;
      const headerRight = margin + contentW - 3.5;
      const padY = 4.0;

      doc.setTextColor(0, 0, 0);

      // Left section
      let textY = headerTop + padY + 3.0;

      // Legal Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(0, 0, 0);
      const nameLines = doc.splitTextToSize(C.legalName, contentW - 65) as string[];
      doc.text(nameLines, headerLeft, textY);
      textY += nameLines.length * 4.0;

      // Business line/tagline
      const taglineText = C.brandTagline?.trim() || C.businessLine?.trim() || '';
      if (taglineText) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        const taglineLines = doc.splitTextToSize(taglineText, contentW - 65) as string[];
        doc.text(taglineLines, headerLeft, textY);
        textY += taglineLines.length * 3.5;
      }

      // GSTIN & CIN
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(0, 0, 0);
      const taxParts: string[] = [];
      if (C.gstin) taxParts.push(`GSTIN: ${C.gstin}`);
      if (C.cin) taxParts.push(`CIN: ${C.cin}`);
      if (taxParts.length) {
        doc.text(taxParts.join(' | '), headerLeft, textY);
        textY += 3.6;
      }

      // Date
      if (q.quotationDate) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.text(`Date: ${this.formatDate(q.quotationDate)}`, headerLeft, textY);
        textY += 1.0;
      }

      // Logo on the right
      const logoFormat = this.logoImageFormat(C.logoContentType);
      const hasLogo = !!(C.logoBase64 && logoFormat);
      let logoBottomY = headerTop;
      if (hasLogo) {
        const logoAspect =
          C.logoPixelWidth && C.logoPixelHeight && C.logoPixelHeight > 0
            ? C.logoPixelWidth / C.logoPixelHeight
            : 1;
        const availH = 20;
        const availW = 42;
        let fitW = availW;
        let fitH = fitW / Math.max(logoAspect, 0.01);
        if (fitH > availH) {
          fitH = availH;
          fitW = fitH * logoAspect;
        }
        const logoX = headerRight - fitW;
        const logoY = headerTop + padY;
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
        logoBottomY = logoY + fitH;
      }

      const topContentBottom = Math.max(textY + padY, logoBottomY + padY);

      // Title Banner: QUOTATION
      const titleBannerH = 6.5;
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(0.25);
      doc.line(margin, topContentBottom, margin + contentW, topContentBottom);
      doc.line(margin, topContentBottom + titleBannerH, margin + contentW, topContentBottom + titleBannerH);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(0, 0, 0);
      doc.text('QUOTATION', pageW / 2, topContentBottom + 4.5, { align: 'center' });

      y = topContentBottom + titleBannerH;
    };

    const drawFooter = (pageNumber: number, totalPages: number): void => {
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);

      // Address line
      const addrLine = `Registered Office: ${C.address}`;
      doc.text(addrLine, pageW / 2, footerY + 2.5, { align: 'center' });

      const emailPart = C.emails.length ? `Email: ${C.emails.join(', ')}` : '';
      const webPart = C.website ? `Web: ${C.website}` : '';
      const contactLine = [emailPart, webPart].filter(Boolean).join(' | ');
      doc.text(contactLine, pageW / 2, footerY + 6, { align: 'center' });

      if (totalPages > 1) {
        doc.setFontSize(6.5);
        doc.text(
          `Page ${pageNumber} of ${totalPages}`,
          margin + contentW - 3.5,
          footerY + 6,
          { align: 'right' },
        );
      }
    };

    drawHeader();

    // Two-column Info Grid
    const infoTopY = y;
    const col1X = margin + 3.5;
    const col2X = margin + halfW + 3.5;
    const colInnerW = halfW - 7;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('QUOTATION FOR', col1X, infoTopY + 3.8);
    doc.text('DETAILS & REFERENCES', col2X, infoTopY + 3.8);

    let metaLeftY = infoTopY + 7.5;

    // Left Column: Customer details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    const custName = q.companyName || q.customerName || '—';
    const custNameLines = doc.splitTextToSize(custName, colInnerW) as string[];
    doc.text(custNameLines, col1X, metaLeftY);
    metaLeftY += custNameLines.length * 3.8 + 0.8;

    // Left Column: Address details
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    const addrText = [q.officeAddress, q.siteAddress ? `Site: ${q.siteAddress}` : ''].filter(Boolean).join('\n');
    if (addrText) {
      const addrLines = doc.splitTextToSize(addrText, colInnerW) as string[];
      doc.text(addrLines, col1X, metaLeftY);
      metaLeftY += addrLines.length * 3.6 + 0.8;
    }

    // Left Column: Attn line
    const attnName = q.contactPerson?.trim();
    const attnPhone = q.mobileNumber?.trim();
    if (attnName) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text('Attn:', col1X, metaLeftY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      const attnValText = attnPhone ? `${attnName} (${attnPhone})` : attnName;
      const attnValLines = doc.splitTextToSize(attnValText, colInnerW - 9) as string[];
      attnValLines.forEach((line, idx) => {
        const x = idx === 0 ? col1X + 9 : col1X;
        doc.text(line, x, metaLeftY + idx * 3.6);
      });
      metaLeftY += attnValLines.length * 3.6 + 0.8;
    }

    // Right Column: Details & References
    let metaRightY = infoTopY + 7.5;

    const getTermValue = (regex: RegExp, fallback: string): string => {
      const found = (C.terms || []).find((t) => regex.test(t.title));
      if (found) {
        return found.body.replace(/^:\s*/, '').trim();
      }
      return fallback;
    };

    // Right Column: Validity
    const valText = getTermValue(/validity/i, '15 Days from Issue Date');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('Validity:', col2X, metaRightY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const valLines = doc.splitTextToSize(valText, colInnerW - 14) as string[];
    valLines.forEach((line, idx) => {
      const x = idx === 0 ? col2X + 14 : col2X;
      doc.text(line, x, metaRightY + idx * 3.6);
    });
    metaRightY += valLines.length * 3.6 + 1.2;

    // Right Column: Enquiry Ref
    const refValText =
      q.quotationNumber?.trim() ||
      (q as unknown as Record<string, unknown>)['quotation_number']?.toString().trim() ||
      (q as unknown as Record<string, unknown>)['name']?.toString().trim() ||
      '—';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('Enquiry Ref:', col2X, metaRightY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const enquiryRefLines = doc.splitTextToSize(refValText, colInnerW - 20) as string[];
    enquiryRefLines.forEach((line, idx) => {
      const x = idx === 0 ? col2X + 20 : col2X;
      doc.text(line, x, metaRightY + idx * 3.6);
    });
    metaRightY += enquiryRefLines.length * 3.6 + 1.2;

    // Right Column: Payment Terms
    const payText = getTermValue(/payment terms/i, '70% Advance, 30% Before Dispatch');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('Payment Terms:', col2X, metaRightY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const payLines = doc.splitTextToSize(payText, colInnerW - 24) as string[];
    payLines.forEach((line, idx) => {
      const x = idx === 0 ? col2X + 24 : col2X;
      doc.text(line, x, metaRightY + idx * 3.6);
    });
    metaRightY += payLines.length * 3.6 + 1.2;

    // Right Column: Dispatch Port
    const dispText = getTermValue(/dispatch/i, q.transportationLabel || 'Wakad Works, Pune');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('Dispatch Port:', col2X, metaRightY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const dispLines = doc.splitTextToSize(dispText, colInnerW - 21) as string[];
    dispLines.forEach((line, idx) => {
      const x = idx === 0 ? col2X + 21 : col2X;
      doc.text(line, x, metaRightY + idx * 3.6);
    });
    metaRightY += dispLines.length * 3.6 + 1.2;

    const infoBottomY = Math.max(metaLeftY, metaRightY, infoTopY + 28) + 1.5;

    // Vertical Divider
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.25);
    doc.line(margin + halfW, infoTopY, margin + halfW, infoBottomY);

    // Horizontal Bottom Border
    doc.setLineWidth(0.25);
    doc.line(margin, infoBottomY, margin + contentW, infoBottomY);

    y = infoBottomY;

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

    const rawItems = q.lineItems ?? [];
    const rawItemsCount = rawItems.length;
    const lineRows = this.lineItemRows(rawItems);

    const productHeadLabels = [
      '#',
      'DESCRIPTION',
      'QTY',
      'RATE (Rs.)',
      'AMOUNT (Rs.)',
    ];

    const tableStartY = y;

    autoTable(doc, {
      startY: tableStartY,
      margin: { left: margin, right: margin, top: pageTopMargin, bottom: L.footerReserveMm },
      tableWidth: contentW,
      theme: 'grid',
      head: [productHeadLabels],
      body: lineRows,
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        fontSize: 8,
        cellPadding: 2.2,
        minCellHeight: 6.8,
        lineWidth: 0.25,
        lineColor: borderColor,
        textColor: [0, 0, 0],
        valign: 'middle',
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
        minCellHeight: 6.5,
        lineWidth: 0.25,
        lineColor: borderColor,
      },
      columnStyles: {
        0: { cellWidth: lineSrW, halign: 'center' as const },
        1: { cellWidth: lineDescW, halign: 'left' as const },
        2: { cellWidth: lineQtyW, halign: 'center' as const },
        3: { cellWidth: lineRateW, halign: 'right' as const },
        4: { cellWidth: lineAmountW, halign: 'right' as const },
      },
      willDrawCell: (data) => {
        if (data.column.index === 1 && data.row.section === 'body' && data.row.index < rawItemsCount) {
          data.cell.text = [];
        }
      },
      didDrawCell: (data) => {
        if (data.column.index === 1 && data.row.section === 'body' && data.row.index < rawItemsCount) {
          const line = rawItems[data.row.index];
          if (line) {
            let mainName = line.itemName || line.itemCode || '—';
            let description = line.description?.trim() || '';

            const parenIndex = mainName.indexOf('(');
            if (parenIndex >= 0) {
              const extractedDesc = mainName.slice(parenIndex).trim();
              mainName = mainName.slice(0, parenIndex).trim();
              description = description ? `${extractedDesc} ${description}` : extractedDesc;
            }

            if (description && !description.startsWith('(')) {
              description = `(${description})`;
            }

            const fullText = description ? `${mainName} ${description}` : mainName;

            doc.setFontSize(8);
            const lines = doc.splitTextToSize(fullText, data.cell.width - 4) as string[];
            const cellH = data.cell.height;
            const textHeight = lines.length * 3.5;
            const textY = data.cell.y + (cellH - textHeight) / 2 + 2.4;

            let charIndex = 0;
            lines.forEach((lText, idx) => {
              const lineY = textY + idx * 3.5;
              let currentX = data.cell.x + 2;

              const lineStart = charIndex;
              const lineEnd = charIndex + lText.length;
              const Llen = mainName.length;

              if (lineEnd <= Llen) {
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(lText, currentX, lineY);
              } else if (lineStart >= Llen) {
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(0, 0, 0);
                doc.text(lText, currentX, lineY);
              } else {
                const boldPart = fullText.slice(lineStart, Llen);
                const normalPart = fullText.slice(Llen, lineEnd);

                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(boldPart, currentX, lineY);

                const boldWidth = doc.getTextWidth(boldPart);
                currentX += boldWidth;

                doc.setFont('helvetica', 'normal');
                doc.setTextColor(0, 0, 0);
                doc.text(normalPart, currentX, lineY);
              }

              const foundIndex = fullText.indexOf(lText, charIndex);
              if (foundIndex >= 0) {
                charIndex = foundIndex + lText.length;
              } else {
                charIndex += lText.length + 1;
              }
            });

            doc.setFont('helvetica', 'normal');
          }
        }
      },
      willDrawPage: (data) => {
        if (data.pageNumber > 1) {
          drawHeader();
        }
      },
    });

    const itemsEndTableY = (doc as DocWithTable).lastAutoTable?.finalY ?? y;
    const rightW = lineQtyW + lineRateW + lineAmountW;
    const leftW = contentW - rightW;
    const dividerX = margin + leftW;

    const closingHeight = this.measureClosingBlocksHeight({
      doc,
      C,
      contentW,
      grandTotal,
      sigPhone,
    });

    const minTableHeightMm = 85; // ~320px minimum table height
    const pageTableBottomY = footerY - 2 - closingHeight;
    let tableBottomY = itemsEndTableY;

    if (itemsEndTableY > pageTableBottomY) {
      tableBottomY = Math.max(itemsEndTableY, tableStartY + minTableHeightMm);
    } else {
      tableBottomY = pageTableBottomY;
    }

    // Render continuous vertical divider lines for empty vertical space down to summary footer
    if (tableBottomY > itemsEndTableY) {
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(0.25);

      // Outer left & right borders
      doc.line(margin, itemsEndTableY, margin, tableBottomY);
      doc.line(margin + contentW, itemsEndTableY, margin + contentW, tableBottomY);

      // Column vertical dividers (# | DESC | QTY | RATE | AMOUNT)
      const col1X_v = margin + lineSrW;
      const col2X_v = col1X_v + lineDescW;
      const col3X_v = col2X_v + lineQtyW;
      const col4X_v = col3X_v + lineRateW;

      doc.line(col1X_v, itemsEndTableY, col1X_v, tableBottomY);
      doc.line(col2X_v, itemsEndTableY, col2X_v, tableBottomY);
      doc.line(col3X_v, itemsEndTableY, col3X_v, tableBottomY);
      doc.line(col4X_v, itemsEndTableY, col4X_v, tableBottomY);

      // Bottom border line of table
      doc.line(margin, tableBottomY, margin + contentW, tableBottomY);
    }

    if (tableBottomY + closingHeight > footerY - 2) {
      doc.addPage();
      drawHeader();
      tableBottomY = pageTopMargin;
    }

    const summaryTopY = tableBottomY;

    // --- LEFT BOX: Bank Details & Terms ---
    let leftY = summaryTopY;
    const bankBannerH = 4.8;
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.25);
    doc.line(margin, leftY + bankBannerH, dividerX, leftY + bankBannerH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text('BANK DETAILS FOR PAYMENT', margin + 3, leftY + 3.3);

    const padBankY = 3.0;
    leftY += bankBannerH + padBankY + 2.4;

    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);

    // Account Name
    let acctX = margin + 3;
    doc.setFont('helvetica', 'bold');
    doc.text('Account Name: ', acctX, leftY);
    acctX += doc.getTextWidth('Account Name: ');
    doc.setFont('helvetica', 'normal');
    doc.text(`${C.legalName || C.signatureEntity}`, acctX, leftY);
    leftY += 3.8;

    // Bank Name
    let bankX = margin + 3;
    doc.setFont('helvetica', 'bold');
    doc.text('Bank: ', bankX, leftY);
    bankX += doc.getTextWidth('Bank: ');
    doc.setFont('helvetica', 'normal');
    const bankVal = C.bankName ? (C.branchName ? `${C.bankName}, ${C.branchName}` : C.bankName) : '—';
    doc.text(`${bankVal}`, bankX, leftY);
    leftY += 3.8;

    // A/C No & IFSC
    let noX = margin + 3;
    doc.setFont('helvetica', 'bold');
    doc.text('A/C No: ', noX, leftY);
    noX += doc.getTextWidth('A/C No: ');

    doc.setFont('helvetica', 'normal');
    const acctNumText = `${C.accountNumber || '—'}  |  `;
    doc.text(acctNumText, noX, leftY);
    noX += doc.getTextWidth(acctNumText);

    doc.setFont('helvetica', 'bold');
    doc.text('IFSC: ', noX, leftY);
    noX += doc.getTextWidth('IFSC: ');

    doc.setFont('helvetica', 'normal');
    doc.text(`${C.ifscCode || '—'}`, noX, leftY);
    leftY += padBankY + 1.2;

    // Terms Banner
    const termsBannerH = 4.8;
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.25);
    doc.line(margin, leftY, dividerX, leftY);
    doc.line(margin, leftY + termsBannerH, dividerX, leftY + termsBannerH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text('TERMS & CONDITIONS', margin + 3, leftY + 3.3);
    leftY += termsBannerH + 2.5;

    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    const termsList = C.terms || [];
    termsList.forEach((term, index) => {
      doc.setFont('helvetica', 'normal');
      const termBodyClean = term.body.replace(/^:\s*/, '').trim();
      const termText = `${index + 1}. ${term.title}: ${termBodyClean}`;
      const termLines = doc.splitTextToSize(termText, leftW - 6) as string[];
      doc.text(termLines, margin + 3, leftY);
      leftY += termLines.length * 3.3;
    });

    // --- RIGHT BOX: Totals Grid ---
    let rightY = summaryTopY;
    const rPad = 3;
    const rLabelX = dividerX + rPad;
    const rValX = margin + contentW - rPad;

    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);

    // Subtotal Row
    rightY += 3.5;
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal:', rLabelX, rightY);
    doc.setFont('helvetica', 'bold');
    doc.text(`Rs. ${this.formatMoney(subtotal)}`, rValX, rightY, { align: 'right' });
    rightY += 1.8;
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.25);
    doc.line(dividerX, rightY, margin + contentW, rightY);

    // GST Row
    rightY += 3.5;
    doc.setFont('helvetica', 'normal');
    doc.text(`GST @ ${gstPercent}%:`, rLabelX, rightY);
    doc.setFont('helvetica', 'bold');
    doc.text(`Rs. ${this.formatMoney(taxTotal)}`, rValX, rightY, { align: 'right' });
    rightY += 1.8;
    doc.line(dividerX, rightY, margin + contentW, rightY);

    // Freight & Handling Row
    rightY += 3.5;
    doc.setFont('helvetica', 'normal');
    doc.text('Freight & Handling:', rLabelX, rightY);
    doc.setFont('helvetica', 'bold');
    doc.text(`Rs. ${this.formatMoney(additionalTotal)}`, rValX, rightY, { align: 'right' });
    rightY += 1.8;
    doc.line(dividerX, rightY, margin + contentW, rightY);

    // Transportation Label Row
    const transLabel =
      q.transportationLabel?.trim() ||
      (q as unknown as Record<string, unknown>)['transportation_label']?.toString().trim() ||
      'Extra at actual';
    rightY += 3.5;
    doc.setFont('helvetica', 'normal');
    doc.text('Transportation:', rLabelX, rightY);
    doc.setFont('helvetica', 'normal');
    doc.text(transLabel, rValX, rightY, { align: 'right' });
    rightY += 1.8;
    doc.line(dividerX, rightY, margin + contentW, rightY);

    // Total Amount Row (Clean border lines, pure black/white)
    const totalRowH = 6.5;
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.25);
    doc.line(dividerX, rightY + totalRowH, margin + contentW, rightY + totalRowH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Total Amount:', rLabelX, rightY + 4.5);
    doc.text(`Rs. ${this.formatMoney(grandTotal)}`, rValX, rightY + 4.5, { align: 'right' });
    rightY += totalRowH + 2.5;

    // Amount in Words
    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Amount in Words:', rLabelX, rightY);
    rightY += 3.5;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    const words = this.amountToWords(grandTotal);
    const wordLines = doc.splitTextToSize(words, rightW - 6) as string[];
    wordLines.forEach((wLine) => {
      doc.text(wLine, rLabelX, rightY);
      rightY += 3.3;
    });

    const summaryBottomY = Math.max(leftY, rightY, summaryTopY + 38) + 2;

    // Vertical Divider Line between Left & Right Boxes
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.25);
    doc.line(dividerX, summaryTopY, dividerX, summaryBottomY);

    // Horizontal Bottom Border below Summary Boxes
    doc.setLineWidth(0.25);
    doc.line(margin, summaryBottomY, margin + contentW, summaryBottomY);

    // --- SIGNATORY & CLOSING BLOCK ---
    const sigTopY = summaryBottomY;
    const sigBottomY = footerY - 2;

    // Jurisdiction on Left
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    let jText = C.jurisdiction?.trim() || '';
    if (jText) {
      if (!jText.toLowerCase().startsWith('subject to')) {
        jText = `Subject to ${jText}`;
      }
      if (!jText.toLowerCase().endsWith('jurisdiction')) {
        jText = `${jText} Jurisdiction`;
      }
    }
    doc.text(jText, margin + 3.5, sigTopY + 14);

    // Signatory on Right
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`For ${C.legalName || C.signatureEntity}`, margin + contentW - 3.5, sigTopY + 4, { align: 'right' });
    doc.text(sigName || 'Authorized Signatory', margin + contentW - 3.5, sigTopY + 14, { align: 'right' });
    if (sigPhone) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(0, 0, 0);
      doc.text(`Contact: ${sigPhone}`, margin + contentW - 3.5, sigTopY + 18, { align: 'right' });
    }

    // Divider line above Registered Office footer
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.25);
    doc.line(margin, sigBottomY, margin + contentW, sigBottomY);

    // Draw page decorations and footers for all pages
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      drawPageFrame();
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
    const padY = 4.0;
    let textY = padY + 3.0;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    const nameLines = doc.splitTextToSize(company.legalName, contentW - 65) as string[];
    textY += nameLines.length * 4.0;

    const taglineText = company.brandTagline?.trim() || company.businessLine?.trim() || '';
    if (taglineText) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const taglineLines = doc.splitTextToSize(taglineText, contentW - 65) as string[];
      textY += taglineLines.length * 3.5;
    }

    if (company.gstin || company.cin) {
      textY += 3.6;
    }

    textY += 1.0; // Date line

    const logoFormat = this.logoImageFormat(company.logoContentType);
    const hasLogo = !!(company.logoBase64 && logoFormat);
    let logoBottom = 0;
    if (hasLogo) {
      const logoAspect =
        company.logoPixelWidth && company.logoPixelHeight && company.logoPixelHeight > 0
          ? company.logoPixelWidth / company.logoPixelHeight
          : 1;
      const availH = 20;
      const availW = 42;
      let fitW = availW;
      let fitH = fitW / Math.max(logoAspect, 0.01);
      if (fitH > availH) {
        fitH = availH;
      }
      logoBottom = padY + fitH;
    }

    const topContentBottom = Math.max(textY + padY, logoBottom + padY);
    return topContentBottom + 6.5; // title banner height
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
    return 0;
  }

  /** Probe-render terms + signature with the same styles as the real document. */
  private measureClosingBlocksHeight(opts: {
    doc: jsPDF;
    C: QuotationPdfCompanyConfig;
    contentW: number;
    grandTotal: number;
    sigPhone: string;
  }): number {
    const doc = opts.doc;
    const C = opts.C;
    const contentW = opts.contentW;
    const lineQtyW = 20;
    const lineRateW = 28;
    const lineAmountW = 30;
    const rightW = lineQtyW + lineRateW + lineAmountW;
    const leftW = contentW - rightW;

    // Left Column Height
    let leftColHeight = 4.8 + 3.0 + 2.4 + 3.8 + 3.8 + (3.0 + 1.2) + 4.8 + 2.5; // Bank banner, details, terms banner
    const termsList = C.terms || [];
    termsList.forEach((term, index) => {
      const termBodyClean = term.body.replace(/^:\s*/, '').trim();
      const termText = `${index + 1}. ${term.title}: ${termBodyClean}`;
      const termLines = doc.splitTextToSize(termText, leftW - 6) as string[];
      leftColHeight += termLines.length * 3.3;
    });

    // Right Column Height (Subtotal, GST, Freight, Transportation, Total, Amount in Words)
    const words = this.amountToWords(opts.grandTotal);
    const wordLines = doc.splitTextToSize(words, rightW - 6) as string[];
    const rightColHeight = (3.5 + 1.8) * 4 + 6.5 + 2.5 + 3.5 + (wordLines.length * 3.3);

    const summaryHeight = Math.max(leftColHeight, rightColHeight, 38) + 2;
    const sigHeight = 22; // Signatory block height

    return summaryHeight + sigHeight;
  }

  private lineItemRows(items: QuotationLineItemDto[]): RowInput[] {
    if (!items.length) {
      return [];
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
