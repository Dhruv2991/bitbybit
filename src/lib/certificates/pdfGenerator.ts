// ════════════════════════════════════════════════════════════
// src/lib/certificates/pdfGenerator.ts
// ════════════════════════════════════════════════════════════

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { CertificateData } from './types';

/**
 * Generates a high-quality, printable vector PDF certificate matching
 * the reference certificate visual design (BMSCE + TeamCodeLocked layout).
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

  // 1. Background Canvas Fill (#FCFBF8 - Ivory)
  doc.setFillColor(252, 251, 248);
  doc.rect(0, 0, width, height, 'F');

  // 2. Double Border Design
  // Outer Gold Border
  doc.setDrawColor(191, 162, 104); // #BFA268 Gold
  doc.setLineWidth(1.0);
  doc.rect(9, 9, width - 18, height - 18);

  // Inner Charcoal Border
  doc.setDrawColor(40, 40, 40); // #282828
  doc.setLineWidth(0.35);
  doc.rect(11.5, 11.5, width - 23, height - 23);

  // Decorative Corner Accents
  doc.setDrawColor(191, 162, 104);
  doc.setLineWidth(0.8);
  // Top-left
  doc.line(14, 14, 25, 14);
  doc.line(14, 14, 14, 25);
  // Top-right
  doc.line(width - 25, 14, width - 14, 14);
  doc.line(width - 14, 14, width - 14, 25);
  // Bottom-left
  doc.line(14, height - 14, 25, height - 14);
  doc.line(14, height - 14, 14, height - 25);
  // Bottom-right
  doc.line(width - 25, height - 14, width - 14, height - 14);
  doc.line(width - 14, height - 14, width - 14, height - 25);

  // 3. Institution Header (BMS College of Engineering)
  doc.setTextColor(20, 20, 20);
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('BMS COLLEGE OF ENGINEERING', centerX, 24, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(70, 70, 70);
  doc.text('ESTD .1946 AUTONOMOUS INSTITUTE, AFFILIATED TO VTU', centerX, 29.5, { align: 'center' });

  // 4. Header Decorative Badges / Logos (Vector approximations)
  // Left: BMSCE Emblem vector circle
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.4);
  doc.circle(28, 26, 9, 'S');
  doc.circle(28, 26, 7.8, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4);
  doc.setTextColor(30, 30, 30);
  doc.text('B.M.S.', 28, 24.5, { align: 'center' });
  doc.setFontSize(3.2);
  doc.text('ENGINEERING', 28, 27.5, { align: 'center' });
  doc.text('BANGALORE', 28, 30, { align: 'center' });

  // Right: TeamCodeLocked Hexagon
  const hexX = width - 28;
  const hexY = 26;
  const r = 9;
  const points: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    points.push([hexX + r * Math.cos(angle), hexY + r * Math.sin(angle)]);
  }
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.4);
  for (let i = 0; i < 6; i++) {
    const next = (i + 1) % 6;
    doc.line(points[i][0], points[i][1], points[next][0], points[next][1]);
  }
  doc.setFont('courier', 'bold');
  doc.setFontSize(4.5);
  doc.setTextColor(20, 20, 20);
  doc.text('CODELOCKED', hexX, hexY + 1.2, { align: 'center' });

  // 5. Main Title
  doc.setTextColor(15, 15, 15);
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.text(data.title || 'CERTIFICATE OF ACHIEVEMENT', centerX, 49, { align: 'center' });

  // 6. "PRESENTED TO" Subtitle
  doc.setTextColor(90, 90, 90);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('P R E S E N T E D   T O', centerX, 59, { align: 'center' });

  // 7. Recipient Name (Visual Focal Point)
  doc.setTextColor(10, 10, 10);
  doc.setFont('times', 'italic');
  doc.setFontSize(28);
  doc.text(data.recipientName || 'Recipient Name', centerX, 77, { align: 'center' });

  // Stylized Name Underline
  doc.setDrawColor(191, 162, 104);
  doc.setLineWidth(0.5);
  doc.line(centerX - 45, 81, centerX + 45, 81);

  // 8. Recognition Statement & Event Information
  doc.setTextColor(35, 35, 35);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  const line1 = `${data.organizationText || 'from teamcodelocked club'} in recognition of securing ${data.achievementText || 'outstanding performance'} for the`;
  doc.text(line1, centerX, 93, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 15, 15);
  const line2 = `${data.eventName || 'Bit By Bit Contest'} ORGANISED in ${data.dateStr || new Date().getFullYear()}`;
  doc.text(line2, centerX, 100, { align: 'center' });

  // 9. Activity Points Statement
  if (data.activityPointsText) {
    doc.setTextColor(80, 80, 80);
    doc.setFont('times', 'italic');
    doc.setFontSize(9.5);
    doc.text(data.activityPointsText, centerX, 112, { align: 'center' });
  }

  // 10. Coordinators / Signatories (3 Columns)
  const coordinators = (data.coordinators && data.coordinators.length >= 3)
    ? data.coordinators.slice(0, 3)
    : [
        { name: 'PROF. NAMRATHA M.', title: 'FACULTY CLUB COORDINATOR', org: 'TEAMCODELOCKED', signatureText: 'Namratha M' },
        { name: 'PANNAG K', title: 'STUDENT CLUB COORDINATOR', org: 'TEAMCODELOCKED', signatureText: 'PannagK' },
        { name: 'AAKANSHYA AGARWAL', title: 'STUDENT CLUB COORDINATOR', org: 'TEAMCODELOCKED', signatureText: 'Aakanshya' },
      ];

  const colPositions = [55, centerX, width - 55];
  const sigY = 146;

  coordinators.forEach((coord, idx) => {
    const colX = colPositions[idx];

    // Cursive signature representation
    doc.setFont('times', 'italic');
    doc.setFontSize(15);
    doc.setTextColor(25, 25, 25);
    doc.text(coord.signatureText || coord.name.split(' ')[0] || 'Signature', colX, sigY, { align: 'center' });

    // Underline
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.35);
    doc.line(colX - 25, sigY + 3, colX + 25, sigY + 3);

    // Name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(20, 20, 20);
    doc.text(coord.name, colX, sigY + 8, { align: 'center' });

    // Title
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(80, 80, 80);
    doc.text(coord.title, colX, sigY + 12, { align: 'center' });

    // Org
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(110, 110, 110);
    doc.text(coord.org, colX, sigY + 15.5, { align: 'center' });
  });

  // 11. Verification QR Code & Certificate ID
  const verifyUrl = data.verificationUrl || `${process.env.NEXT_PUBLIC_SITE_URL || 'https://bitbybit.club'}/certificate/${data.certificateId}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      margin: 1,
      width: 120,
      color: { dark: '#111111', light: '#FCFBF8' },
    });
    // Add QR code to bottom-right
    doc.addImage(qrDataUrl, 'PNG', width - 34, height - 34, 18, 18);
    doc.setFont('courier', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(110, 110, 110);
    doc.text('Scan to Verify', width - 25, height - 13.5, { align: 'center' });
  } catch (err) {
    console.error('[pdfGenerator] QR code generation error:', err);
  }

  // Bottom-left Certificate ID
  doc.setFont('courier', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text(`ID: ${data.certificateId}`, 16, height - 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(130, 130, 130);
  doc.text('Bit by Bit Platform • BMSCE TeamCodeLocked', 16, height - 14);

  // Return PDF as Buffer
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
