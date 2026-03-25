const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } = require('docx');
const fs = require('fs');

// Read markdown file
const markdown = fs.readFileSync('/home/node/openclaw/pyramedia-company-profile.md', 'utf-8');

// Parse markdown and create document
const lines = markdown.split('\n');
const children = [];

let inTable = false;
let tableRows = [];
let tableHeaders = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines
    if (line.trim() === '') {
        if (inTable && tableRows.length > 0) {
            // End table
            const table = new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: tableRows.map((row, rowIndex) => 
                    new TableRow({
                        children: row.map(cell => 
                            new TableCell({
                                children: [new Paragraph({
                                    children: [new TextRun({ 
                                        text: cell,
                                        bold: rowIndex === 0
                                    })]
                                })],
                                width: { size: 50, type: WidthType.PERCENTAGE }
                            })
                        )
                    })
                )
            });
            children.push(table);
            children.push(new Paragraph({ text: '' }));
            tableRows = [];
            inTable = false;
        }
        continue;
    }
    
    // Table separator line
    if (line.match(/^\|[-:\s|]+\|$/)) {
        continue;
    }
    
    // Table row
    if (line.startsWith('|') && line.endsWith('|')) {
        inTable = true;
        const cells = line.split('|').filter(c => c.trim() !== '').map(c => c.trim());
        tableRows.push(cells);
        continue;
    }
    
    // Headings
    if (line.startsWith('# ')) {
        children.push(new Paragraph({
            text: line.replace('# ', ''),
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 }
        }));
    } else if (line.startsWith('## ')) {
        children.push(new Paragraph({
            text: line.replace('## ', ''),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 }
        }));
    } else if (line.startsWith('### ')) {
        children.push(new Paragraph({
            text: line.replace('### ', ''),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 }
        }));
    }
    // Blockquotes
    else if (line.startsWith('> ')) {
        children.push(new Paragraph({
            children: [new TextRun({ 
                text: line.replace('> ', '').replace(/\*\*/g, '').replace(/\*/g, ''),
                italics: true 
            })],
            indent: { left: 720 },
            spacing: { before: 100, after: 100 }
        }));
    }
    // List items
    else if (line.startsWith('- ')) {
        const text = line.replace('- ', '').replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        children.push(new Paragraph({
            children: [new TextRun({ text: '• ' + text })],
            indent: { left: 360 }
        }));
    }
    // Horizontal rule
    else if (line === '---') {
        children.push(new Paragraph({ text: '' }));
    }
    // Regular text
    else if (line.trim() && !line.startsWith('*Prepared') && !line.startsWith('*©')) {
        const text = line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        children.push(new Paragraph({
            children: [new TextRun({ text })],
            spacing: { after: 100 }
        }));
    }
}

// Create document
const doc = new Document({
    sections: [{
        properties: {},
        children: children
    }]
});

// Save document
Packer.toBuffer(doc).then(buffer => {
    fs.writeFileSync('/home/node/openclaw/pyramedia-company-profile.docx', buffer);
    console.log('Done! File saved to pyramedia-company-profile.docx');
});
