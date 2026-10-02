// ════════════════════════════════════════════════════════════
// src/lib/certificates/pdfGenerator.ts
// ════════════════════════════════════════════════════════════

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import type { CertificateData } from './types';

/**
 * Generates a high-resolution, printable PDF certificate based on the
 * official master certificate base template image (/certificates/certificate-base.png).
 * 
 * Returns a Buffer of the generated PDF.
 */
export async function generateCertificatePdf(data: CertificateData): Promise<Buffer> {
  // A4 Landscape dimensions: 297mm x 210mm
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const width = 297;
  const height = 210;
  const centerX = width / 2;

  // 1. Embed Official Certificate Base Background (Contains borders, seals, signatures, header)
  try {
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
  } catch (err) {
    console.error('[pdfGenerator] Error loading certificate template image:', err);
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, width, height, 'F');
  }

  // 2. Optional Custom Title Overlay (if not CERTIFICATE OF ACHIEVEMENT)
  const isCustomTitle = Boolean(
    data.title &&
    data.title.toUpperCase() !== 'CERTIFICATE OF ACHIEVEMENT' &&
    data.title !== 'Certificate of Achievement'
  );

  if (isCustomTitle) {
    doc.setFillColor(255, 255, 255);
    doc.rect(40, 56, width - 80, 14, 'F');
    doc.setTextColor(17, 24, 39);
    doc.setFont('times', 'bold');
    doc.setFontSize(22);
    doc.text(data.title.toUpperCase(), centerX, 66, { align: 'center' });
  }

  // 3. Dynamic Recipient Name - Centered precisely on the blank area under 'PRESENTED TO'
  doc.setTextColor(9, 9, 11);
  doc.setFont('times', 'bolditalic');
  doc.setFontSize(34);
  doc.text(data.recipientName || 'Recipient Name', centerX, 104, { align: 'center' });

  // 4. Recognition Statement & Event/Date
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

  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(19.5);
  doc.setLineHeightFactor(1.35);
  const wrappedBody = doc.splitTextToSize(bodyText, width - 90);
  const bodyY = 119;
  doc.text(wrappedBody, centerX, bodyY, { align: 'center' });

  const numLines = Array.isArray(wrappedBody) ? wrappedBody.length : 1;
  const activityY = bodyY + (numLines * 9.2) + 4;

  // 5. Activity Points Disclaimer
  const activityText = data.activityPointsText !== undefined
    ? data.activityPointsText
    : 'This certificate is eligible for claiming 1-2 activity points.';

  if (activityText) {
    doc.setTextColor(70, 70, 75);
    doc.setFont('times', 'italic');
    doc.setFontSize(14.5);
    doc.text(activityText, centerX, activityY, { align: 'center' });
  }

  // 6. Revoked Watermark (if status is revoked)
  if (data.status === 'revoked') {
    doc.setTextColor(220, 38, 38);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(44);
    doc.text('REVOKED', centerX, height / 2, { align: 'center', angle: -20 });
  }

  // 7. Verification QR Code (Bottom-Right)
  const verifyUrl = data.verificationUrl || `${process.env.NEXT_PUBLIC_SITE_URL || 'https://bitbybit.club'}/certificate/${data.certificateId}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      margin: 1,
      width: 140,
      color: { dark: '#111111', light: '#FFFFFF' },
    });
    doc.addImage(qrDataUrl, 'PNG', width - 29, height - 29, 17, 17);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text('Scan to Verify', width - 20.5, height - 8.5, { align: 'center' });
  } catch (err) {
    console.error('[pdfGenerator] QR code generation error:', err);
  }

  // 8. Bottom-Left Certificate ID
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  doc.text(`ID: ${data.certificateId}`, 14, height - 8.5);

  // Return PDF as Buffer
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
