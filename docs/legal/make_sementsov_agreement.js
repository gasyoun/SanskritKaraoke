// Generates Sementsov_Translation_License_Agreement_DRAFT.docx
// Companion to make_agreement.js (audio). Licenses the RUSSIAN TRANSLATION text
// of V. S. Sementsov for use as karaoke captions + course materials.
// Run from docs/legal/ (resolves ./node_modules/docx):  node make_sementsov_agreement.js
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, Footer, PageNumber, TabStopType,
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

// Annex A: ID | Verse | Russian translation (incipit) | Source
const CW = [1500, 2700, 3026, 1800]; // sums to 9026 (A4 content width)
const annexHeader = new TableRow({
  children: [
    cell(CW[0], 'Translation ID', { bold: true, shade: true }),
    cell(CW[1], 'Verse', { bold: true, shade: true }),
    cell(CW[2], 'Russian translation (incipit)', { bold: true, shade: true }),
    cell(CW[3], 'Source', { bold: true, shade: true }),
  ],
});
const annexRow = (id, verse, ru, src) => new TableRow({
  children: [cell(CW[0], id), cell(CW[1], verse), cell(CW[2], ru), cell(CW[3], src)],
});

const sigLine = (label) => para(
  [t(label, { bold: true }), t('\t_______________________________')],
  { tabStops: [{ type: TabStopType.LEFT, position: 3000 }], spacing: { after: 220 } }
);

const SRC = 'Семенцов В. С., «Бхагавадгита в традиции и в современной научной критике», М.: Наука, 1985';

const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: FONT },
        paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0, alignment: AlignmentType.CENTER } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: FONT },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
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
            t('Agreement SK-LIC-2026-002 · Page ', { size: 18, color: '666666' }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: '666666' }),
            t(' of ', { size: 18, color: '666666' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: '666666' }),
          ],
        })],
      }),
    },
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1,
        children: [t('TRANSLATION LICENSE AGREEMENT')] }),
      para(t('Agreement No. SK-LIC-2026-002 (“Agreement”)', { bold: true }),
        { alignment: AlignmentType.CENTER }),
      para(t('DRAFT FOR REVIEW — NOT YET EXECUTED', { bold: true, color: 'B00000' }),
        { alignment: AlignmentType.CENTER, spacing: { after: 320 } }),

      body('This Agreement is made on the date of the last signature below, between:'),
      para([
        t('(1)  ', { bold: true }),
        t('[Rights holder of the Russian translation by V. S. Sementsov — the heir(s) / estate of Vsevolod Sergeevich Sementsov (1941–1986), or the publisher holding the exclusive rights to the translation]', { bold: true }),
        t(', of [full address] (the “Licensor”); and'),
      ], { alignment: AlignmentType.JUSTIFIED }),
      para([
        t('(2)  ', { bold: true }),
        t('Mārcis Gasūns (Марцис Гасунс)', { bold: true }),
        t(', an individual residing in the Russian Federation at [full address] (the “Licensee”),'),
      ], { alignment: AlignmentType.JUSTIFIED }),
      body('each a “Party” and together the “Parties”.'),

      h2('Background'),
      body('A. V. S. Sementsov created a Russian-language translation of the Bhagavadgītā, first published in the work cited in Annex A (the “Translation”). The Translation is protected by copyright in the Russian Federation until the end of 2056 (life of the author plus seventy years; Article 1281 of the Civil Code of the Russian Federation).'),
      body('B. The Licensor is the lawful holder of the exclusive rights in the Translation, or is duly authorised to license those rights.'),
      body('C. The Licensee operates the “Sanskrit Karaoke” educational project (https://gasyoun.github.io/SanskritKaraoke/), which produces karaoke-style videos and interactive study materials for students of Sanskrit, distributed free of charge to promote the Licensee’s paid online Sanskrit courses.'),
      body('D. The Licensee wishes to use selected verses of the Translation as on-screen captions and study text on the terms below.'),

      h2('1. Grant of license'),
      clause('1.1', 'The Licensor grants the Licensee a non-exclusive, worldwide, royalty-free license, for the term stated in clause 6.1, to: (a) reproduce and store the verses of the Translation listed in Annex A (the “Licensed Verses”); (b) display and synchronise the Licensed Verses as on-screen captions, subtitles and study text within karaoke-style audiovisual works and interactive materials (“Karaoke Materials”); (c) communicate the Licensed Verses and Karaoke Materials to the public on any platform, including the Sanskrit Karaoke web application, Telegram, YouTube, Instagram, TikTok, VK and successor or comparable platforms; and (d) use the Licensed Verses within, and in short excerpts to advertise, the Licensee’s Sanskrit courses and the Sanskrit Karaoke project.'),
      clause('1.2', 'The license covers use in a commercial context, including materials distributed free of charge that promote the Licensee’s paid courses, and the inclusion of Karaoke Materials inside the Licensee’s paid course materials.'),
      clause('1.3', 'The Licensee shall reproduce the text of each Licensed Verse accurately and shall not sell or license the Translation as a standalone textual product (e.g. an e-book or printed edition) without the Licensor’s separate written consent.'),
      clause('1.4', 'The Licensor retains ownership of the copyright in the Translation and remains free to use and license it to others.'),

      h2('2. Attribution and moral rights'),
      clause('2.1', 'The Licensee shall credit the translator as “Russian translation: V. S. Sementsov” (or a wording agreed in writing) in the credits, caption, description or metadata of every Karaoke Material that uses a Licensed Verse, and in the verse metadata of the Sanskrit Karaoke catalogue, where the platform reasonably allows; the full bibliographic source is recorded in Annex A.'),
      clause('2.2', 'The Licensee shall respect the author’s right of integrity and right of authorship (Articles 1265–1266 of the Civil Code of the Russian Federation) and shall not distort the Translation. Technical presentation (line breaks, font, syllable-level highlighting, segmentation into half-verses to match the chant) is expressly permitted and shall not be treated as a distortion of the text.'),

      h2('3. Consideration'),
      clause('3.1', 'The Parties agree that the license is granted free of monetary charge, in consideration of the attribution under clause 2.1 and the public promotion of the translator’s work. [Alternative, if payment or a royalty is agreed: delete this clause and state the fee and payment terms here.]'),

      h2('4. Licensor’s warranties'),
      clause('4.1', 'The Licensor warrants that: (a) it is the lawful holder of, or is duly authorised to license, the exclusive rights in the Translation; (b) the use licensed here will not infringe the rights of any third party; and (c) it has full capacity to enter into this Agreement.'),
      clause('4.2', 'The Licensor shall inform the Licensee promptly if any third party asserts rights in the Translation.'),

      h2('5. Adding new verses'),
      clause('5.1', 'The Parties may add further verses of the Translation to Annex A by signing an updated Annex or by an exchange of written confirmations (including e-mail or messenger messages from the addresses/accounts stated below), identifying each new verse by its Translation ID. Verses so added are licensed on the terms of this Agreement.'),

      h2('6. Term and termination'),
      clause('6.1', 'This Agreement takes effect on the date of the last signature and continues for the remaining term of copyright in the Translation, unless terminated earlier under clause 6.2.'),
      clause('6.2', 'Either Party may terminate this Agreement by 60 days’ written notice if the other Party materially breaches it and fails to cure the breach within 30 days of notice.'),
      clause('6.3', 'Karaoke Materials created and published before the effective date of termination may remain published; no new uses of the Licensed Verses may begin after termination.'),

      h2('7. General'),
      clause('7.1', 'This Agreement is governed by the laws of the Russian Federation. The Parties shall first attempt to settle any dispute amicably by negotiation; failing that, disputes shall be resolved by the competent courts at the defendant’s place of residence.'),
      clause('7.2', 'This Agreement is executed in Russian and English; [the Russian text prevails]. Signed scanned copies exchanged by e-mail have the force of originals.'),
      clause('7.3', 'This Agreement constitutes the entire agreement between the Parties about the Translation and may be amended only in writing (including the procedure in clause 5.1 for Annex A).'),
      clause('7.4', 'If any provision is held invalid, the remainder of the Agreement stays in force.'),

      new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_2,
        children: [t('Signatures', { bold: true })] }),

      para(t('THE LICENSOR', { bold: true }), { spacing: { before: 200, after: 200 } }),
      sigLine('Name:'),
      sigLine('Capacity (heir / estate / publisher):'),
      sigLine('Address:'),
      sigLine('E-mail:'),
      sigLine('Date:'),
      sigLine('Signature:'),

      para(t('THE LICENSEE', { bold: true }), { spacing: { before: 400, after: 200 } }),
      sigLine('Name:'),
      sigLine('Address:'),
      sigLine('E-mail / Telegram:'),
      sigLine('Date:'),
      sigLine('Signature:'),

      new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_2,
        children: [t('Annex A — Licensed Verses', { bold: true })] }),
      body('Each Translation ID below is referenced as translation.rights.ru.permission_ref in the Sanskrit Karaoke verse catalogue.'),
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: CW,
        rows: [
          annexHeader,
          annexRow('SEM-2026-001', 'Bhagavadgītā 2.47', 'Твое право лишь в действии…', SRC),
          annexRow('SEM-2026-002', 'Bhagavadgītā 2.48', 'Пребывая в йоге, совершай действия…', SRC),
          annexRow('SEM-2026-003', 'Bhagavadgītā 2.49', 'Воистину, действие намного ниже…', SRC),
          annexRow('', '', '', ''),
          annexRow('', '', '', ''),
        ],
      }),
      para(t('Note: confirm whether each Russian line above is the verbatim Sementsov text or an editorial paraphrase; if paraphrased, the attribution wording in clause 2.1 should say “after V. S. Sementsov”.', { size: 20, italics: true }),
        { spacing: { before: 240 } }),
      para(t('Annex A signed/confirmed by both Parties as part of Agreement SK-LIC-2026-002.', { size: 20, italics: true }),
        { spacing: { before: 120 } }),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(__dirname + '/Sementsov_Translation_License_Agreement_DRAFT.docx', buf);
  console.log('written');
});
