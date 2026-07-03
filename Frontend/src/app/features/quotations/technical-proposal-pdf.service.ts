import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { mapCompanyProfile } from '../../core/services/company-profile/company-profile-api.mapper';
import type { QuotationLineItemDto, QuotationUpsertDto } from '../../core/services/quotations/quotation-api.models';
import { DEFAULT_QUOTATION_CURRENCY } from '../../core/services/quotations/quotation-template.constants';
import { formatIntlTelDisplay } from '../../shared/utils/intl-tel.util';
import {
  mergeCompanyProfileForPdf,
  type QuotationPdfCompanyConfig,
} from './company-profile-pdf.mapper';
import {
  TECHNICAL_PROPOSAL_PDF_LAYOUT,
} from './technical-proposal-pdf.config';

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

interface MetaRow {
  left?: {
    label: string;
    value: string;
    underlineValue?: boolean;
    continuation?: string;
  };
  right?: { label: string; value: string };
}

interface LogoDimensions {
  width: number;
  height: number;
}

@Injectable({ providedIn: 'root' })
export class TechnicalProposalPdfService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  async download(quotation: QuotationUpsertDto): Promise<void> {
    const company = await this.withPdfOptimizedLogo(await this.resolveCompanyProfile());
    const doc = this.buildDocument(quotation, company);
    doc.save(this.pdfFilename(quotation.quotationNumber));
  }

  private buildDocument(q: QuotationUpsertDto, company: QuotationPdfCompanyConfig): jsPDF {
    const L = TECHNICAL_PROPOSAL_PDF_LAYOUT;
    const tp = q.technicalProposal ?? {};
    const currencyCode = (tp.currencyCode?.trim() || DEFAULT_QUOTATION_CURRENCY).toUpperCase();

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = L.marginMm;
    const contentW = pageW - margin * 2;
    /** Fixed band below top margin — logo sits top-right; text uses full content width below this band. */
    const logoBandH = L.logoMaxHeightMm + L.logoPadMm;
    const pageBodyStartY = margin + logoBandH + L.titleGapMm;

    const lineDescW =
      contentW -
      L.lineSrWidthMm -
      L.lineQtyWidthMm -
      L.lineWeightWidthMm -
      L.lineRateWidthMm -
      L.lineAmountWidthMm;

    const tableStyles = {
      fontSize: L.fontSize.body,
      cellPadding: L.tableBodyCellPaddingMm,
      lineColor: [0, 0, 0] as [number, number, number],
      lineWidth: 0.15,
      textColor: [0, 0, 0] as [number, number, number],
      fillColor: [255, 255, 255] as [number, number, number],
      valign: 'middle' as const,
      overflow: 'linebreak' as const,
    };

    const footFill = {
      fillColor: L.brandBlue,
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'normal' as const,
      valign: 'middle' as const,
      overflow: 'hidden' as const,
    };

    const contentStartY = (): number => pageBodyStartY;

    const ensureSpace = (y: number, needed: number): number => {
      if (y + needed <= pageH - L.footerReserveMm) return y;
      doc.addPage();
      return contentStartY();
    };

    let y = pageBodyStartY;

    y = this.drawTitleBlock(doc, margin, pageW, y, q, company, contentW);
    y += L.sectionGapMm;
    y = this.drawMetaBlock(doc, margin, y, contentW, q, tp, L);
    y += L.sectionGapMm + 1;

    y = this.drawSalutationIntro(doc, margin, y, contentW, tp.proposalIntro?.trim() ?? '', L, pageH, contentStartY);
    y += L.sectionGapMm;

    for (const section of tp.technicalSections ?? []) {
      y = ensureSpace(y, 10);
      y = this.drawSection(doc, margin, y, contentW, section.title, section.body, L, pageH, contentStartY);
    }

    y = ensureSpace(y, 40);

    const lineRows = this.lineItemRows(q.lineItems ?? []);
    const grandTotal = this.grandTotal(q);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: L.footerReserveMm },
      tableWidth: contentW,
      theme: 'grid',
      head: [
        [
          'Sr. No',
          'Item Particulars',
          'Qty (In Nos.)',
          'Unit Weight',
          `Unit Rate (${currencyCode})`,
          `Gross Rate (${currencyCode})`,
        ],
      ],
      body: lineRows,
      foot: [
        [
          { content: '', styles: footFill },
          { content: 'Total Ex-Works Value', styles: { ...footFill, halign: 'right' } },
          { content: '', styles: footFill },
          { content: '', styles: footFill },
          { content: '', styles: footFill },
          { content: this.formatMoney(grandTotal), styles: { ...footFill, halign: 'right' } },
        ],
      ],
      styles: tableStyles,
      headStyles: {
        fillColor: L.brandBlue,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: L.tableHeadFontSize,
        halign: 'center',
        valign: 'middle',
        cellPadding: L.tableHeadCellPaddingMm,
        minCellHeight: L.tableHeadMinHeightMm,
      },
      footStyles: {
        fillColor: L.brandBlue,
        textColor: [255, 255, 255],
        fontStyle: 'normal',
        fontSize: L.fontSize.body,
        valign: 'middle',
        cellPadding: L.tableBodyCellPaddingMm,
        overflow: 'hidden',
        minCellHeight: 8,
      },
      columnStyles: {
        0: { cellWidth: L.lineSrWidthMm, halign: 'center' },
        1: { cellWidth: lineDescW, halign: 'left' },
        2: { cellWidth: L.lineQtyWidthMm, halign: 'right' },
        3: { cellWidth: L.lineWeightWidthMm, halign: 'right' },
        4: { cellWidth: L.lineRateWidthMm, halign: 'right' },
        5: { cellWidth: L.lineAmountWidthMm, halign: 'right' },
      },
    });

    y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 20;
    y += L.sectionGapMm;

    for (const section of tp.commercialSections ?? []) {
      y = ensureSpace(y, 10);
      y = this.drawSection(doc, margin, y, contentW, section.title, section.body, L, pageH, contentStartY);
    }

    y = this.drawSignatoryBlock(doc, margin, y, contentW, company, L, pageH, contentStartY);

    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      this.drawPageLogo(doc, pageW, margin, company, L);
      this.drawPageFooter(doc, pageW, pageH, margin, company, p, totalPages, L);
    }

    return doc;
  }

  /** Title left + GSTIN right on full width; drawn below logo band. */
  private drawTitleBlock(
    doc: jsPDF,
    margin: number,
    pageW: number,
    y: number,
    q: QuotationUpsertDto,
    company: QuotationPdfCompanyConfig,
    contentW: number,
  ): number {
    const L = TECHNICAL_PROPOSAL_PDF_LAYOUT;
    const qtn = q.quotationNumber?.trim() ?? '';
    const gstin = company.gstin?.trim() ?? '';
    const rightEdge = pageW - margin;
    const lineH = L.titleLineHeightMm;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(L.fontSize.title);
    doc.setTextColor(...L.bodyText);
    doc.setLineWidth(0.25);

    const titleLine = qtn ? `PRICE PROPOSAL N0. # ${qtn}` : 'PRICE PROPOSAL';

    if (gstin) {
      const gstLine = `GSTIN : ${gstin}`;
      const gstW = doc.getTextWidth(gstLine);
      doc.text(gstLine, rightEdge, y + 4, { align: 'right' });
      doc.line(rightEdge - gstW, y + 5, rightEdge, y + 5);

      const maxTitleW = Math.max(40, contentW - gstW - 8);
      const titleLines = doc.splitTextToSize(titleLine, maxTitleW) as string[];
      titleLines.forEach((line: string, idx: number) => {
        doc.text(line, margin, y + 4 + idx * lineH);
      });
      const lastLine = titleLines[titleLines.length - 1] ?? titleLine;
      doc.line(margin, y + 5, margin + doc.getTextWidth(lastLine), y + 5);
      return y + 4 + titleLines.length * lineH + 2;
    }

    doc.text(titleLine, margin, y + 4);
    doc.line(margin, y + 5, margin + doc.getTextWidth(titleLine), y + 5);
    return y + 8;
  }

  /** Two-column meta — fixed label widths, values aligned in each half (full content width). */
  private drawMetaBlock(
    doc: jsPDF,
    margin: number,
    y: number,
    contentW: number,
    q: QuotationUpsertDto,
    tp: NonNullable<QuotationUpsertDto['technicalProposal']>,
    L: typeof TECHNICAL_PROPOSAL_PDF_LAYOUT,
  ): number {
    const halfW = contentW / 2;
    const leftLabelX = margin;
    const leftValueX = margin + L.metaLeftLabelWidthMm;
    const leftValueW = halfW - L.metaLeftLabelWidthMm - 1;
    const rightLabelX = margin + halfW;
    const rightValueX = margin + halfW + L.metaRightLabelWidthMm;
    const rightValueW = halfW - L.metaRightLabelWidthMm - 1;
    const lineH = L.metaLineHeightMm;

    const contact = q.contactPerson?.trim() ?? '';
    const designation = tp.kindAttnDesignation?.trim() ?? '';

    const rows: MetaRow[] = [
      {
        left: {
          label: 'Kind Attn :',
          value: contact,
          underlineValue: true,
          continuation: designation,
        },
        right: { label: 'Date  :', value: this.formatLongDate(q.quotationDate) },
      },
      {
        left: { label: 'M/s.', value: (q.companyName || q.customerName)?.trim() ?? '' },
        right: { label: 'Terms  :', value: tp.commercialTerms?.trim() ?? '' },
      },
      {
        left: {
          label: 'Project :',
          value: (tp.projectName?.trim() || q.siteAddress?.trim()) ?? '',
        },
        right: { label: 'Tax  :', value: tp.taxLabel?.trim() ?? '' },
      },
      {
        left: {
          label: 'Phone :',
          value: formatIntlTelDisplay(q.mobileNumber?.trim()) || q.mobileNumber?.trim() || '',
        },
        right: { label: 'Payment  :', value: tp.paymentTerms?.trim() ?? '' },
      },
      {
        left: { label: 'E-mail:', value: q.emailAddress?.trim() ?? '' },
        right: { label: 'HSN  :', value: tp.hsnCode?.trim() ?? '' },
      },
      {
        left: { label: 'Enquiry Date:', value: this.formatLongDate(q.referenceDate) },
        right: { label: 'Incoterms  :', value: tp.incoterms?.trim() ?? '' },
      },
      {
        left: { label: '', value: '' },
        right: { label: 'Dispatch:', value: tp.dispatchLeadTime?.trim() ?? '' },
      },
    ];

    let rowY = y;
    for (const row of rows) {
      let blockH = lineH;

      if (row.left?.label || row.left?.value || row.left?.continuation) {
        const h = this.drawMetaSide(
          doc,
          leftLabelX,
          leftValueX,
          leftValueW,
          rowY,
          row.left.label,
          row.left.value,
          lineH,
          row.left.underlineValue,
          row.left.continuation,
        );
        blockH = Math.max(blockH, h);
      }

      if (row.right?.label) {
        const h = this.drawMetaSide(
          doc,
          rightLabelX,
          rightValueX,
          rightValueW,
          rowY,
          row.right.label,
          row.right.value,
          lineH,
        );
        blockH = Math.max(blockH, h);
      }

      rowY += blockH;
    }

    return rowY;
  }

  private drawMetaSide(
    doc: jsPDF,
    labelX: number,
    valueX: number,
    valueW: number,
    y: number,
    label: string,
    value: string,
    lineH: number,
    underlineValue = false,
    continuation = '',
  ): number {
    doc.setFont('times', 'bold');
    doc.setFontSize(TECHNICAL_PROPOSAL_PDF_LAYOUT.fontSize.meta);
    doc.setTextColor(...TECHNICAL_PROPOSAL_PDF_LAYOUT.bodyText);

    if (label.trim()) {
      doc.text(label, labelX, y + 3.5);
    }

    let linesUsed = 1;

    if (value.trim()) {
      doc.setFont('times', 'normal');
      const valueLines = doc.splitTextToSize(value, valueW) as string[];
      valueLines.forEach((line: string, idx: number) => {
        const vy = y + 3.5 + idx * lineH;
        doc.text(line, valueX, vy);
        if (underlineValue && idx === 0 && line.trim()) {
          doc.setLineWidth(0.2);
          doc.line(valueX, vy + 0.8, valueX + doc.getTextWidth(line), vy + 0.8);
        }
      });
      linesUsed = Math.max(linesUsed, valueLines.length);
    }

    if (continuation.trim()) {
      doc.setFont('times', 'normal');
      const contY = y + 3.5 + linesUsed * lineH;
      const contLines = doc.splitTextToSize(continuation, valueW) as string[];
      contLines.forEach((line: string, idx: number) => {
        doc.text(line, valueX, contY + idx * lineH);
      });
      linesUsed += contLines.length;
    }

    return lineH * linesUsed;
  }

  /** Intro paragraph at full content width (from quotation proposal intro field). */
  private drawSalutationIntro(
    doc: jsPDF,
    margin: number,
    y: number,
    contentW: number,
    intro: string,
    L: typeof TECHNICAL_PROPOSAL_PDF_LAYOUT,
    pageH: number,
    contentStartY: () => number,
  ): number {
    if (!intro.trim()) return y;

    doc.setFont('times', 'normal');
    doc.setFontSize(L.fontSize.salutation);
    doc.setTextColor(...L.bodyText);
    return this.drawParagraphBlock(doc, margin, y, contentW, intro, L, pageH, contentStartY, 'times');
  }

  private measureLogoSize(
    company: QuotationPdfCompanyConfig,
    L: typeof TECHNICAL_PROPOSAL_PDF_LAYOUT,
  ): LogoDimensions {
    const format = this.logoImageFormat(company.logoContentType);
    const base64 = company.logoBase64?.trim();
    if (base64 && format) {
      const aspect =
        company.logoPixelWidth && company.logoPixelHeight && company.logoPixelHeight > 0
          ? company.logoPixelWidth / company.logoPixelHeight
          : 2.5;

      let fitW = L.logoMaxWidthMm;
      let fitH = fitW / aspect;
      if (fitH > L.logoMaxHeightMm) {
        fitH = L.logoMaxHeightMm;
        fitW = fitH * aspect;
      }
      return { width: fitW, height: fitH };
    }

    const brand = (company.brandName?.trim() || company.legalName?.trim() || '').toUpperCase();
    return brand ? { width: L.logoMaxWidthMm, height: 6 } : { width: 0, height: L.logoMaxHeightMm };
  }

  private drawPageLogo(
    doc: jsPDF,
    pageW: number,
    margin: number,
    company: QuotationPdfCompanyConfig,
    L: typeof TECHNICAL_PROPOSAL_PDF_LAYOUT,
  ): void {
    const format = this.logoImageFormat(company.logoContentType);
    const base64 = company.logoBase64?.trim();
    const logoY = margin;

    if (base64 && format) {
      const size = this.measureLogoSize(company, L);
      const logoX = pageW - margin - size.width;

      try {
        doc.addImage(
          `data:${company.logoContentType};base64,${base64}`,
          format,
          logoX,
          logoY,
          size.width,
          size.height,
        );
        return;
      } catch {
        // Fall through to text brand.
      }
    }

    const brand = (company.brandName?.trim() || company.legalName?.trim() || '').toUpperCase();
    if (!brand) return;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...L.brandBlue);
    doc.text(brand, pageW - margin, logoY + 5, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  private drawPageFooter(
    doc: jsPDF,
    pageW: number,
    pageH: number,
    margin: number,
    _company: QuotationPdfCompanyConfig,
    pageNumber: number,
    totalPages: number,
    L: typeof TECHNICAL_PROPOSAL_PDF_LAYOUT,
  ): void {
    if (totalPages <= 1) return;

    const footerY = pageH - L.footerHeightMm;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(L.fontSize.footer);
    doc.setTextColor(0, 0, 0);
    doc.text(`${pageNumber} of ${totalPages}`, pageW - margin, footerY + 3, { align: 'right' });
  }

  private drawParagraphBlock(
    doc: jsPDF,
    margin: number,
    y: number,
    width: number,
    text: string,
    L: typeof TECHNICAL_PROPOSAL_PDF_LAYOUT,
    pageH: number,
    contentStartY: () => number,
    fontFamily: 'times' | 'helvetica' = 'times',
  ): number {
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(L.fontSize.body);
    doc.setTextColor(...L.bodyText);
    const lines = doc.splitTextToSize(text, width);
    const lineH = L.bodyLineHeightMm;
    for (const line of lines) {
      if (y + lineH > pageH - L.footerReserveMm) {
        doc.addPage();
        y = contentStartY();
      }
      doc.text(line, margin, y + 3.5);
      y += lineH;
    }
    return y;
  }

  private drawSection(
    doc: jsPDF,
    margin: number,
    y: number,
    width: number,
    title: string,
    body: string,
    L: typeof TECHNICAL_PROPOSAL_PDF_LAYOUT,
    pageH: number,
    contentStartY: () => number,
  ): number {
    const heading = title?.trim();
    const content = body?.trim();
    if (!heading && !content) return y;

    if (y > pageH - L.footerReserveMm - 20) {
      doc.addPage();
      y = contentStartY();
    }

    if (heading) {
      doc.setFont('times', 'bold');
      doc.setFontSize(L.fontSize.sectionTitle);
      doc.setTextColor(...L.brandBlue);
      doc.text(heading, margin, y + 3.5);
      doc.setTextColor(...L.bodyText);
      y += 5;
    }

    if (content) {
      y = this.drawParagraphBlock(doc, margin, y, width, content, L, pageH, contentStartY);
    }

    return y + L.sectionGapMm;
  }

  /** Closing footer — logged-in user name/email; company name/address from profile. */
  
  private drawSignatoryBlock(
    doc: jsPDF,
    margin: number,
    y: number,
    width: number,
    company: QuotationPdfCompanyConfig,
    L: typeof TECHNICAL_PROPOSAL_PDF_LAYOUT,
    pageH: number,
    contentStartY: () => number,
  ): number {
    const user = this.auth.user();
    const name = user?.name?.trim() ?? '';
    const email = user?.email?.trim() ?? '';
    const companyLine = (company.legalName?.trim() || company.brandName?.trim() || '').toUpperCase();
    const address = company.address?.trim() ?? '';

    if (!name && !email && !companyLine && !address) return y;

    if (y > pageH - L.footerReserveMm - 30) {
      doc.addPage();
      y = contentStartY();
    }

    y += 4;
    const lineH = L.bodyLineHeightMm;
    const blockW = width * 0.3;
    doc.setFontSize(L.fontSize.body);
    doc.setTextColor(...L.bodyText);

    const drawLines = (text: string, maxW: number, bold = false): void => {
      doc.setFont('times', bold ? 'bold' : 'normal');
      for (const line of doc.splitTextToSize(text, maxW) as string[]) {
        doc.text(line, margin, y + 3.5);
        y += lineH;
      }
    };

    drawLines('If any query, please feel free to contact undersigned,', width);
    y += lineH;
    drawLines('With Warm Regards,', width);
    y += lineH;

    if (name) drawLines(name, blockW, true);
    if (companyLine) drawLines(companyLine, blockW);
    if (address) drawLines(address, blockW);
    if (email) drawLines(email, blockW);

    return y + 4;
  }

  private lineItemRows(items: QuotationLineItemDto[]): RowInput[] {
    if (!items.length) {
      return [['—', '—', '—', '—', '—', '—']];
    }
    return items.map((line, i) => {
      const desc = [line.itemName, line.description].filter((s) => s?.trim()).join('\n') || line.itemCode || '—';
      const qty = line.quantity ?? 0;
      const unitWeight = line.unitWeight > 0 ? line.unitWeight : qty > 0 ? (line.weight ?? 0) / qty : 0;
      const rate = line.rate ?? 0;
      const total = line.lineTotal || line.amount || 0;
      const weightLabel = unitWeight > 0 ? `${this.formatQty(unitWeight)} Kg` : '—';
      return [
        String(i + 1),
        desc,
        qty > 0 ? this.formatQty(qty) : '—',
        weightLabel,
        rate > 0 ? this.formatMoney(rate) : '—',
        total > 0 ? this.formatMoney(total) : '—',
      ];
    });
  }

  private grandTotal(q: QuotationUpsertDto): number {
    if (q.grandTotal != null && q.grandTotal > 0) return q.grandTotal;
    return (q.lineItems ?? []).reduce((s, l) => s + (l.lineTotal || l.amount || 0), 0);
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

  private async withPdfOptimizedLogo(
    company: QuotationPdfCompanyConfig,
  ): Promise<QuotationPdfCompanyConfig> {
    const base64 = company.logoBase64?.trim();
    const contentType = company.logoContentType?.trim();
    if (!base64 || !contentType || !this.logoImageFormat(contentType)) {
      return company;
    }

    const prepared = await this.prepareLogoForPdf(base64, contentType, TECHNICAL_PROPOSAL_PDF_LAYOUT.logoMaxPx);
    if (!prepared) return company;

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

  private pdfFilename(quotationNumber: string): string {
    const base = (quotationNumber?.trim() || 'technical-proposal')
      .replace(/\//g, '-')
      .replace(/[<>:"/\\|?*]+/g, '-')
      .replace(/\s+/g, '-');
    return `${base}.pdf`;
  }

  private formatLongDate(value: string | null | undefined): string {
    if (!value?.trim()) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const day = d.getDate();
    const suffix =
      day % 10 === 1 && day !== 11
        ? 'st'
        : day % 10 === 2 && day !== 12
          ? 'nd'
          : day % 10 === 3 && day !== 13
            ? 'rd'
            : 'th';
    const month = d.toLocaleDateString('en-IN', { month: 'long' });
    const year = d.getFullYear();
    return `${day}${suffix} ${month} ${year}`;
  }

  private formatMoney(value: number): string {
    if (!Number.isFinite(value)) return '—';
    return value.toLocaleString('en-IN', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }

  private formatQty(value: number): string {
    if (!Number.isFinite(value)) return '—';
    return value.toLocaleString('en-IN', { maximumFractionDigits: 4 });
  }
}
