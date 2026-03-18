import type { LogEntry } from '../store';

const encoder = new TextEncoder();

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
}

function lineText(entry: LogEntry) {
  return [
    `${new Date(entry.ts).toLocaleString()}`,
    `[${entry.status.toUpperCase()}]`,
    entry.prompt,
    entry.message,
  ].join(' - ');
}

function markdownText(projectName: string, logs: LogEntry[]) {
  const lines = [
    `# Prompt Log - ${projectName}`,
    '',
    `Generated: ${new Date().toLocaleString()}`,
    '',
  ];

  for (const entry of logs) {
    lines.push(`## ${entry.prompt}`);
    lines.push(`- Time: ${new Date(entry.ts).toLocaleString()}`);
    lines.push(`- Status: ${entry.status}`);
    lines.push(`- Message: ${entry.message}`);
    lines.push('');
  }

  return lines.join('\n');
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(projectName: string, logs: LogEntry[]) {
  const lines = [
    `Prompt Log - ${projectName}`,
    `Generated: ${new Date().toLocaleString()}`,
    '',
    ...logs.map(lineText),
  ];
  const pageHeight = 792;
  const margin = 48;
  const lineHeight = 16;
  const linesPerPage = Math.floor((pageHeight - margin * 2) / lineHeight);

  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    const pageLines = lines.slice(i, i + linesPerPage);
    const content = ['BT', '/F1 12 Tf', `1 0 0 1 ${margin} ${pageHeight - margin} Tm`, `${lineHeight} TL`];
    pageLines.forEach((line, index) => {
      if (index > 0) content.push('T*');
      content.push(`(${escapePdfText(line)}) Tj`);
    });
    content.push('ET');
    pages.push(content.join('\n'));
  }

  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  for (const page of pages) {
    const contentObjectId = objects.length + 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`
    );
    const data = encoder.encode(page);
    objects.push(`<< /Length ${data.length} >>\nstream\n${page}\nendstream`);
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return encoder.encode(pdf);
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { dosTime, dosDate };
}

function uint16(value: number) {
  return [value & 0xff, (value >> 8) & 0xff];
}

function uint32(value: number) {
  return [
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  ];
}

function zipEntries(entries: Array<{ name: string; data: Uint8Array }>) {
  const now = dosDateTime(new Date());
  const localParts: number[] = [];
  const centralParts: number[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const localHeader = [
      ...uint32(0x04034b50),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(now.dosTime),
      ...uint16(now.dosDate),
      ...uint32(crc),
      ...uint32(entry.data.length),
      ...uint32(entry.data.length),
      ...uint16(nameBytes.length),
      ...uint16(0),
      ...nameBytes,
      ...entry.data,
    ];
    localParts.push(...localHeader);

    const centralHeader = [
      ...uint32(0x02014b50),
      ...uint16(20),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(now.dosTime),
      ...uint16(now.dosDate),
      ...uint32(crc),
      ...uint32(entry.data.length),
      ...uint32(entry.data.length),
      ...uint16(nameBytes.length),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(offset),
      ...nameBytes,
    ];
    centralParts.push(...centralHeader);
    offset += localHeader.length;
  });

  const end = [
    ...uint32(0x06054b50),
    ...uint16(0),
    ...uint16(0),
    ...uint16(entries.length),
    ...uint16(entries.length),
    ...uint32(centralParts.length),
    ...uint32(localParts.length),
    ...uint16(0),
  ];

  return new Uint8Array([...localParts, ...centralParts, ...end]);
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildDocx(projectName: string, logs: LogEntry[]) {
  const paragraphs = [
    `Prompt Log - ${projectName}`,
    `Generated: ${new Date().toLocaleString()}`,
    '',
    ...logs.map(lineText),
  ]
    .map((line) =>
      `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`
    )
    .join('');

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"` +
    ` xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"` +
    ` xmlns:o="urn:schemas-microsoft-com:office:office"` +
    ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"` +
    ` xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"` +
    ` xmlns:v="urn:schemas-microsoft-com:vml"` +
    ` xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"` +
    ` xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"` +
    ` xmlns:w10="urn:schemas-microsoft-com:office:word"` +
    ` xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"` +
    ` xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"` +
    ` xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"` +
    ` xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"` +
    ` xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"` +
    ` xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"` +
    ` mc:Ignorable="w14 wp14"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

  return zipEntries([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rels) },
    { name: 'word/document.xml', data: encoder.encode(documentXml) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(docRels) },
  ]);
}

export function exportPromptLog(projectName: string, logs: LogEntry[], format: 'md' | 'pdf' | 'docx') {
  if (format === 'md') {
    return {
      filename: `prompt-log-${slugify(projectName)}.md`,
      bytes: encoder.encode(markdownText(projectName, logs)),
    };
  }
  if (format === 'pdf') {
    return {
      filename: `prompt-log-${slugify(projectName)}.pdf`,
      bytes: buildPdf(projectName, logs),
    };
  }
  return {
    filename: `prompt-log-${slugify(projectName)}.docx`,
    bytes: buildDocx(projectName, logs),
  };
}
