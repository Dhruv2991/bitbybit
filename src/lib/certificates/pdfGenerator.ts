// ════════════════════════════════════════════════════════════
// src/lib/certificates/pdfGenerator.ts
// ════════════════════════════════════════════════════════════

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import type { CertificateData } from './types';

function hexToRgb(hex: string): [number, number, number] {
  if (!hex || typeof hex !== 'string') return [0, 0, 0];
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) || 0,
      parseInt(clean[1] + clean[1], 16) || 0,
      parseInt(clean[2] + clean[2], 16) || 0,
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

/**
 * Generates a high-resolution, printable PDF certificate based on the
 * official master certificate base template or an uploaded custom template.
 * Output is standard printable A4 Landscape (297mm x 210mm).
 */
export async function generateCertificatePdf(data: CertificateData): Promise<Buffer> {
  // A4 Landscape dimensions: 297mm x 210mm (Ratio: 1.4142857)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const width = 297;
  const height = 210;
  const centerX = width / 2;
  const cfg = data.templateConfig || {};

  // 1. Embed Certificate Base Background (Custom Template or Official Default)
  try {
    if (data.customTemplateImage) {
      const img = data.customTemplateImage;
      const fmt = img.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(img, fmt, 0, 0, width, height, undefined, 'FAST');
    } else {
      let templatePath = path.join(process.cwd(), 'public', 'certificates', 'certificate-base.png');
      if (!fs.existsSync(templatePath)) {
        templatePath = path.join(process.cwd(), 'public', 'certificates', 'certificate-template.png');
      }

      if (fs.existsSync(templatePath)) {
        const templateBuffer = fs.readFileSync(templatePath);
        const templateBase64 = `data:image/png;base64,${templateBuffer.toString('base64')}`;
        doc.addImage(templateBase64, 'PNG', 0, 0, width, height, undefined, 'FAST');
      } else {
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, width, height, 'F');
      }
    }
  } catch (err) {
    console.error('[pdfGenerator] Error loading certificate template image:', err);
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, width, height, 'F');
  }

  // 2. Title Overlay
  const isCustomTitle = Boolean(
    data.title &&
    data.title.toUpperCase() !== 'CERTIFICATE OF ACHIEVEMENT' &&
    data.title !== 'Certificate of Achievement'
  );

  const showTitle = cfg.showTitle !== undefined
    ? cfg.showTitle
    : (data.customTemplateImage ? false : isCustomTitle);

  if (showTitle && data.title) {
    const titleY = cfg.titleY !== undefined ? (height * cfg.titleY) / 100 : 66;
    const titleSize = cfg.titleFontSize ?? 22;
    const [tr, tg, tb] = hexToRgb(cfg.titleColor || '#111827');

    if (!data.customTemplateImage) {
      doc.setFillColor(255, 255, 255);
      doc.rect(40, titleY - 7, width - 80, 14, 'F');
    }
    doc.setTextColor(tr, tg, tb);
    doc.setFont('times', 'bold');
    doc.setFontSize(titleSize);
    doc.text(data.title.toUpperCase(), centerX, titleY, { align: 'center', baseline: 'middle' });
  }

  // 3. Dynamic Recipient Name (baseline: middle perfectly matches CSS translateY(-50%))
  const nameY = cfg.nameY !== undefined ? (height * cfg.nameY) / 100 : 104;
  const nameSize = cfg.nameFontSize ?? 34;
  const [nr, ng, nb] = hexToRgb(cfg.nameColor || '#09090b');

  doc.setTextColor(nr, ng, nb);
  doc.setFont('times', 'bolditalic');
  doc.setFontSize(nameSize);
  doc.text(data.recipientName || 'Recipient Name', centerX, nameY, { align: 'center', baseline: 'middle' });

  // 4. Recognition Statement & Event/Date
  const showBody = cfg.showBody !== undefined ? cfg.showBody : true;
  const displayDate = data.dateStr || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const org = data.organizationText || 'from teamcodelocked club';
  const event = data.eventName || 'BitByBit Weekly Contest';
  let ach = data.achievementText || 'securing 1st Place for the';

  let bodyText = data.customDescription;
  if (!bodyText) {
    const achClean = ach.trim();
    const eventClean = event.trim();
    const hasEvent = achClean.toLowerCase().includes(eventClean.toLowerCase());
    const eventSuffix = hasEvent ? '' : ` ${eventClean}`;

    if (achClean.toLowerCase().startsWith('in recognition of')) {
      bodyText = `${org} ${achClean}${eventSuffix} ORGANISED IN ${displayDate.toUpperCase()}`;
    } else if (achClean.toLowerCase().startsWith('for active participation') || achClean.toLowerCase().startsWith('for participating')) {
      bodyText = `${org} ${achClean}${hasEvent ? '' : ` in the ${eventClean}`} ORGANISED IN ${displayDate.toUpperCase()}`;
    } else {
      bodyText = `${org} in recognition of ${achClean}${eventSuffix} ORGANISED IN ${displayDate.toUpperCase()}`;
    }
  }

  const bodyY = cfg.bodyY !== undefined ? (height * cfg.bodyY) / 100 : 119;
  const bodySize = cfg.bodyFontSize ?? 19.5;
  const [br, bg, bb] = hexToRgb(cfg.bodyColor || '#1e1e1e');

  let numLines = 1;
  if (showBody && bodyText) {
    doc.setTextColor(br, bg, bb);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(bodySize);
    doc.setLineHeightFactor(1.35);
    const wrappedBody = doc.splitTextToSize(bodyText, width - 80);
    doc.text(wrappedBody, centerX, bodyY, { align: 'center' });
    numLines = Array.isArray(wrappedBody) ? wrappedBody.length : 1;
  }

  // 5. Activity Points Disclaimer
  const showActivity = cfg.showActivityPoints !== undefined ? cfg.showActivityPoints : true;
  const activityText = data.activityPointsText !== undefined
    ? data.activityPointsText
    : 'This certificate is eligible for claiming 1-2 activity points.';

  if (showActivity && activityText) {
    const activityY = cfg.activityPointsY !== undefined
      ? (height * cfg.activityPointsY) / 100
      : bodyY + (numLines * 9.2) + 4;

    doc.setTextColor(70, 70, 75);
    doc.setFont('times', 'italic');
    doc.setFontSize(14.5);
    doc.text(activityText, centerX, activityY, { align: 'center' });
  }

  // 6. Standalone Date Line (especially for custom templates)
  const showDate = cfg.showDate !== undefined ? cfg.showDate : true;
  if (showDate && data.dateStr && (data.customTemplateImage || cfg.dateX !== undefined)) {
    const dateX = cfg.dateX !== undefined ? (width * cfg.dateX) / 100 : 70;
    const dateY = cfg.dateY !== undefined ? (height * cfg.dateY) / 100 : 185;
    const [dr, dg, db] = hexToRgb(cfg.dateColor || '#374151');
    doc.setTextColor(dr, dg, db);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    const formattedDate = data.dateStr.toLowerCase().startsWith('date:') ? data.dateStr : `Date: ${data.dateStr}`;
    doc.text(formattedDate, dateX, dateY, { align: 'center', baseline: 'middle' });
  }

  // 7. Extra Custom Text Fields (arbitrary user-defined lines)
  const extraFields = cfg.extraFields || data.extraFields;
  if (extraFields && Array.isArray(extraFields)) {
    for (const extra of extraFields) {
      if (!extra.text || !extra.text.trim()) continue;
      const ex = extra.x !== undefined ? (width * extra.x) / 100 : centerX;
      const ey = (height * (extra.y ?? 50)) / 100;
      const [er, eg, eb] = hexToRgb(extra.color || '#374151');
      doc.setTextColor(er, eg, eb);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(extra.fontSize ?? 14);
      doc.text(extra.text.trim(), ex, ey, { align: extra.align || 'center', baseline: 'middle' });
    }
  }

  // 8. Revoked Watermark (if status is revoked)
  if (data.status === 'revoked') {
    doc.setTextColor(220, 38, 38);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(44);
    doc.text('REVOKED', centerX, height / 2, { align: 'center', angle: -20 });
  }

  // 9. Verification QR Code
  const showQr = cfg.showQr !== undefined ? cfg.showQr : true;
  if (showQr) {
    const verifyUrl = data.verificationUrl || `${process.env.NEXT_PUBLIC_SITE_URL || 'https://bitbybit.club'}/certificate/${data.certificateId}`;
    try {
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        margin: 1,
        width: 140,
        color: { dark: '#111111', light: '#FFFFFF' },
      });
      const qrSize = cfg.qrSize ?? 17;
      const qrX = cfg.qrX !== undefined ? (width * cfg.qrX) / 100 - qrSize / 2 : (width - 29);
      const qrY = cfg.qrY !== undefined ? (height * cfg.qrY) / 100 - qrSize / 2 : (height - 29);

      doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(90, 90, 90);
      doc.text('Scan to Verify', qrX + qrSize / 2, qrY + qrSize + 3.5, { align: 'center' });
    } catch (err) {
      console.error('[pdfGenerator] QR code generation error:', err);
    }
  }

  // 10. Certificate ID
  const showCertId = cfg.showCertId !== undefined ? cfg.showCertId : true;
  if (showCertId) {
    const idX = cfg.certIdX !== undefined ? (width * cfg.certIdX) / 100 : 14;
    const idY = cfg.certIdY !== undefined ? (height * cfg.certIdY) / 100 : (height - 8.5);

    doc.setFont('courier', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(70, 70, 70);
    doc.text(`ID: ${data.certificateId}`, idX, idY, { baseline: 'middle' });
  }

  // Return PDF as Buffer
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
