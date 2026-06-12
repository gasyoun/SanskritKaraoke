// Generates Usha_Sanka_License_Agreement_DRAFT.docx
// Run: node make_agreement.js   (requires: npm install -g docx, NODE_PATH set to global root)
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, Footer, PageNumber, TabStopType, TabStopPosition,
} = require('docx');

const FONT = 'Arial';
const t = (text, opts = {}) => new TextRun({ text, font: FONT, ...opts });
const para = (children, opts = {}) =>
  new Paragraph({ spacing: { after: 160 }, ...opts, children: Array.isArray(children) ? children : [children] });
const body = (text, opts = {}) => para(t(text), { alignment: AlignmentType.JUSTIFIED, ...opts });
const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 280, after: 160 },
  children: [t(text, { bold: true })],
});

// numbered clause inside a section
const clause = (num, text) => para(
  [t(`${num}  `, { bold: true }), t(text)],
  { alignment: AlignmentType.JUSTIFIED }
);

const border = { style: BorderStyle.SINGLE, size: 1, color: '999999' };
const borders = { top: border, bottom: border, left: border, right: border };
const cellOpts = (w, shade) => ({
  borders,
  width: { size: w, type: WidthType.DXA },
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  ...(shade ? { shading: { fill: 'EFEFEF', type: ShadingType.CLEAR } } : {}),
});
const cell = (w, text, opts = {}) => new TableCell({
  ...cellOpts(w, opts.shade),
  children: [para(t(text, { bold: !!opts.bold, size: 20 }), { spacing: { after: 0 } })],
});

// Annex A table: ID | Verse / Title | Source text | Recording date | Duration
const CW = [1500, 2700, 2526, 1400, 900]; // sums to 9026 (A4 content width)
const annexHeader = new TableRow({
  children: [
    cell(CW[0], 'Recording ID', { bold: true, shade: true }),
    cell(CW[1], 'Verse / Title', { bold: true, shade: true }),
    cell(CW[2], 'Source text', { bold: true, shade: true }),
    cell(CW[3], 'Date', { bold: true, shade: true }),
    cell(CW[4], 'Dur.', { bold: true, shade: true }),
  ],
});
const annexRow = (id, verse, src, date, dur) => new TableRow({
  children: [cell(CW[0], id), cell(CW[1], verse), cell(CW[2], src), cell(CW[3], date), cell(CW[4], dur)],
});

const sigLine = (label) => para(
  [t(label, { bold: true }), t('\t_______________________________')],
  { tabStops: [{ type: TabStopType.LEFT, position: 3000 }], spacing: { after: 220 } }
);

const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } }, // 11 pt
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: FONT },
        paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0, alignment: AlignmentType.CENTER } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: FONT },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            t('Agreement SK-LIC-2026-001 · Page ', { size: 18, color: '666666' }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: '666666' }),
            t(' of ', { size: 18, color: '666666' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: '666666' }),
          ],
        })],
      }),
    },
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1,
        children: [t('AUDIO RECORDING LICENSE AGREEMENT')] }),
      para(t('Agreement No. SK-LIC-2026-001 (“Agreement”)', { bold: true }),
        { alignment: AlignmentType.CENTER }),
      para(t('DRAFT FOR REVIEW — NOT YET EXECUTED', { bold: true, color: 'B00000' }),
        { alignment: AlignmentType.CENTER, spacing: { after: 320 } }),

      body('This Agreement is made on the date of the last signature below, between:'),
      para([
        t('(1)  ', { bold: true }),
        t('Usha Sanka', { bold: true }),
        t(', an individual residing in India at [full address], [passport / Aadhaar no., optional] (the “Licensor”); and'),
      ], { alignment: AlignmentType.JUSTIFIED }),
      para([
        t('(2)  ', { bold: true }),
        t('Mārcis Gasūns (Марцис Гасунс)', { bold: true }),
        t(', an individual residing in the Russian Federation at [full address] (the “Licensee”),'),
      ], { alignment: AlignmentType.JUSTIFIED }),
      body('each a “Party” and together the “Parties”.'),

      h2('Background'),
      body('A. The Licensor has composed melodies for, and performed and recorded, chanted renditions of Sanskrit verses, listed in Annex A (the “Recordings”).'),
      body('B. The Licensee operates the “Sanskrit Karaoke” educational project (https://gasyoun.github.io/SanskritKaraoke/), which produces karaoke-style videos and interactive study materials for students of Sanskrit, and teaches paid online Sanskrit courses which those free materials promote.'),
      body('C. The Licensor wishes to permit the Licensee to use the Recordings in that project on the terms below.'),

      h2('1. Grant of license'),
      clause('1.1', 'The Licensor grants the Licensee a non-exclusive, worldwide, royalty-free license, for the full term of copyright and related rights in the Recordings, to: (a) reproduce, store and technically convert the Recordings; (b) synchronise the Recordings with visual material (including syllable-level karaoke animation, captions, transliteration and translations) to create derivative audiovisual works (“Karaoke Videos”); (c) communicate the Recordings and Karaoke Videos to the public on any platform, including the Sanskrit Karaoke web application, Telegram, YouTube, Instagram, TikTok, VK and successor or comparable platforms; and (d) use short excerpts of the Recordings and Karaoke Videos to advertise the Licensee’s Sanskrit courses and the Sanskrit Karaoke project.'),
      clause('1.2', 'The license covers use in a commercial context, including videos distributed free of charge that promote the Licensee’s paid courses, and the inclusion of Karaoke Videos inside the Licensee’s paid course materials.'),
      clause('1.3', 'The Licensee shall not sell or license the unmodified audio Recordings as standalone audio products (e.g. as music downloads or streaming releases) without the Licensor’s separate written consent.'),
      clause('1.4', 'The Licensor retains ownership of the copyright and performer’s rights in the Recordings and remains free to use and license them to others.'),

      h2('2. Attribution and moral rights'),
      clause('2.1', 'The Licensee shall credit the Licensor as “Melody and chanting: Usha Sanka” (or a wording agreed in writing) in the credits, caption or metadata of every Karaoke Video and in the verse metadata of the Sanskrit Karaoke catalogue, where the platform reasonably allows.'),
      clause('2.2', 'The Licensee shall respect the Licensor’s moral rights, including those under Section 57 of the Indian Copyright Act, 1957, and shall not distort or modify the Recordings in a manner prejudicial to the Licensor’s honour or reputation. Technical processing (volume normalisation, noise reduction, trimming, format conversion, synchronisation with visuals) is expressly permitted.'),

      h2('3. Consideration'),
      clause('3.1', 'The Parties agree that the license is granted free of monetary charge, in consideration of the attribution under clause 2.1, the public promotion of the Licensor’s work as a performer, and the mutual interest of the Parties in the dissemination of Sanskrit chanting tradition. [Alternative, if payment is agreed: delete this clause and state the fee and payment terms here.]'),

      h2('4. Licensor’s warranties'),
      clause('4.1', 'The Licensor warrants that: (a) she is the sole performer on the Recordings and the sole owner of the rights licensed here, or has obtained all necessary consents from any co-creators; (b) the Recordings are her original performance and their use as licensed will not infringe the rights of any third party; and (c) she has full capacity to enter into this Agreement.'),
      clause('4.2', 'The Licensor shall inform the Licensee promptly if any third party asserts rights in any Recording.'),

      h2('5. Adding new recordings'),
      clause('5.1', 'The Parties may add further recordings to Annex A by signing an updated Annex or by an exchange of written confirmations (including e-mail or messenger messages from the addresses/accounts stated below), identifying each new recording by its Recording ID. Recordings so added are licensed on the terms of this Agreement.'),

      h2('6. Term and termination'),
      clause('6.1', 'This Agreement takes effect on the date of the last signature and continues for the term stated in clause 1.1.'),
      clause('6.2', 'Either Party may terminate this Agreement by 60 days’ written notice if the other Party materially breaches it and fails to cure the breach within 30 days of notice.'),
      clause('6.3', 'Karaoke Videos created and published before the effective date of termination may remain published; no new uses of the Recordings may begin after termination.'),

      h2('7. General'),
      clause('7.1', 'This Agreement is governed by the laws of [India / the Russian Federation — choose one]. The Parties shall first attempt to settle any dispute amicably by negotiation; failing that, disputes shall be resolved by the competent courts at the defendant’s place of residence.'),
      clause('7.2', 'This Agreement is executed in English in two counterparts, one for each Party. Signed scanned copies exchanged by e-mail have the force of originals. [If a Hindi or Russian translation is made, the English text prevails.]'),
      clause('7.3', 'This Agreement constitutes the entire agreement between the Parties about the Recordings and may be amended only in writing (including the procedure in clause 5.1 for Annex A).'),
      clause('7.4', 'If any provision is held invalid, the remainder of the Agreement stays in force.'),

      new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_2,
        children: [t('Signatures', { bold: true })] }),

      para(t('THE LICENSOR', { bold: true }), { spacing: { before: 200, after: 200 } }),
      sigLine('Name:'),
      sigLine('Address:'),
      sigLine('E-mail / Telegram:'),
      sigLine('Date:'),
      sigLine('Signature:'),

      para(t('THE LICENSEE', { bold: true }), { spacing: { before: 400, after: 200 } }),
      sigLine('Name:'),
      sigLine('Address:'),
      sigLine('E-mail / Telegram:'),
      sigLine('Date:'),
      sigLine('Signature:'),

      new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_2,
        children: [t('Annex A — Licensed Recordings', { bold: true })] }),
      body('Each Recording ID below is referenced as audio.permission_ref in the Sanskrit Karaoke verse catalogue.'),
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: CW,
        rows: [
          annexHeader,
          annexRow('USK-2026-001', 'Bhagavadgītā 2.47 (karmaṇy evādhikāras te…)', 'Bhagavadgītā', '[date]', '[s]'),
          annexRow('USK-2026-002', 'Bhagavadgītā 2.48 (yogasthaḥ kuru karmāṇi…)', 'Bhagavadgītā', '[date]', '[s]'),
          annexRow('USK-2026-003', 'Bhagavadgītā 2.49 (dūreṇa hy avaraṃ karma…)', 'Bhagavadgītā', '[date]', '[s]'),
          annexRow('', '', '', '', ''),
          annexRow('', '', '', '', ''),
        ],
      }),
      para(t('Annex A signed/confirmed by both Parties as part of Agreement SK-LIC-2026-001.', { size: 20, italics: true }),
        { spacing: { before: 240 } }),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(__dirname + '/Usha_Sanka_License_Agreement_DRAFT.docx', buf);
  console.log('written');
});
