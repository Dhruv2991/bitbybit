const sharp = require('sharp');
const path = require('path');

async function makeBaseTemplate() {
  const inputPath = path.join(__dirname, '..', 'public', 'certificates', 'certificate-template.png');
  const outputPath = path.join(__dirname, '..', 'public', 'certificates', 'certificate-base.png');

  // We want to keep:
  // 1. Top left logo: (x: 100-390, y: 80-330)
  // 2. Top right logo: (x: 1610-1900, y: 80-330)
  // 3. Borders and geometric corner frames
  // 4. Bottom 3 signatures with their lines and coordinator names: (y: 1040-1360)
  //
  // We clear:
  // - Top header text between the two logos: (x: 395 to 1605, y: 100 to 340)
  // - All text below the logos down to the signatures: (x: 90 to 1910, y: 340 to 1035)

  const svgOverlay = Buffer.from(`
    <svg width="2000" height="1414" xmlns="http://www.w3.org/2000/svg">
      <!-- Top header text area between logos -->
      <rect x="395" y="100" width="1210" height="240" fill="#ffffff" />
      
      <!-- Entire middle text zone (Title, Presented To, Name, Description, Activity points) -->
      <rect x="90" y="340" width="1820" height="695" fill="#ffffff" />
    </svg>
  `);

  await sharp(inputPath)
    .composite([{ input: svgOverlay, blend: 'over' }])
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(outputPath);

  console.log('Successfully regenerated public/certificates/certificate-base.png with clean text zones');
}

makeBaseTemplate().catch(console.error);
