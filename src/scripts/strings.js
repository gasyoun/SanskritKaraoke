const STRINGS = {
  ru: {
    // App titles & headers
    mainTitle: 'Волновая нотация санскрита',
    settingsTitle: 'Настройки',
    helpTitle: 'Инструкция',
    shlokaInputLabel: 'Ввод шлоки',
    shlokaInputHint: 'Две строфы · каждая с новой строки',
    shlokaPlaceholder: 'Введите текст шлоки...',
    encodingLabel: 'Кодировка:',
    searchLabel: 'Поиск',
    difficultyLabel: 'Сложность',
    sylAuthor: 'Авторское',
    sylStd: 'Стандартное',
    libExportTitle: 'Экспорт в библиотеку',
    libIdLabel: 'ID шлоки',
    libTitleRuLabel: 'Название (RU)',
    libTitleEnLabel: 'Название (EN)',
    libTransRuLabel: 'Перевод (RU)',
    libTransEnLabel: 'Перевод (EN)',
    libTagsLabel: 'Теги',
    libExportBtn: '↓ Скачать JSON',
    beatTapIntro: 'Нажимайте G или L синхронно с подсветкой.',
    emptyStateHint: 'Введите данные и нажмите «Построить диаграмму»',
    
    // Settings labels
    waveHeightLabel: 'Высота волны',
    sylColorsLabel: 'Цвета слогов',
    displayLabel: 'Отображение',
    notificationsLabel: 'Уведомления',
    
    // Google Drive dialog
    newFolderBtn: '+ Папка',
    openBtn: 'Открыть',
    
    // Buttons
    runBtn: 'Запустить',
    resetBtn: 'Сброс',
    settingsBtn: '⚙ Настройки',
    helpBtn: '? Инструкция',
    downloadBtn: 'Скачать',
    showPngBtn: 'Показать PNG',
    altDownloadBtn: 'Скачать PNG',
    karaokeBtn: 'Карaoке MP4',
    storyBtn: 'Story MP4',
    saveSessionBtn: 'Сохранить на Drive',
    loadSessionBtn: 'Загрузить с Drive',
    detectMeterBtn: 'Определить метр',
    meterInfoBtn: 'Инфо о метре',
    timingEditorBtn: 'Редактор тайминга',
    autoBtn: 'Авто',
    
    // Section labels
    sylDivLabel: 'Разделение на слоги',
    schemLabel: 'Схема и метр',
    pngLabel: 'Экспорт PNG',
    mp4Label: 'Экспорт MP4',
    audioLabel: 'Аудио',
    sessionLabel: 'Сессия',
    footerLabel: 'Футер (PNG)',
    driveLabel: 'Google Drive',
    
    // Audio drop zone
    dropZoneText: 'Перетащите сюда аудиофайл или нажмите для выбора',
    dropZoneFormats: 'Поддерживаются: MP3, WAV, M4A',
    dropZoneNoFile: 'Файл не выбран',
    
    // Timing editor
    padaModeLabel: 'Разметка пад',
    sylModeLabel: 'Тайминг слогов',
    
    // Messages
    errNoAudio: 'Сначала загрузите аудиофайл!',
    errNoDiagram: 'Сначала постройте диаграмму (Run)!',
    errNoTiming: 'Сначала разметьте тайминг!',
    okKaraoke: 'Карaoке-видео готово!',
    okPng: 'PNG-изображение готово!',
    iosSaveImage: 'Зажмите на изображение → «Сохранить в Фото» или «Сохранить в Файлах»',
    iosSaveVideo: 'Видео готово. Нажмите «Открыть видео», затем «Поделиться» → «Сохранить видео».',
    iosOpenVideo: 'Открыть видео',
    iosNoCapture: 'Этот вид экспорта не поддерживается в Safari. Используйте Karaoke MP4.',
    okStory: 'Видео для Story готово!',
    mobileExportWarning: 'Экспорт MP4 может не работать на мобильных устройствах из-за ограничений памяти браузера. Для надёжного результата используйте десктоп.\n\nПродолжить на мобильном?',

    // Progress page
    progressTitle: 'Sanskrit Karaoke — Прогресс',
    studyTodayHeading: 'Изучать сегодня',
    catalogHeading: 'Каталог шлок',
    allDoneMsg: 'На сегодня всё! Отличная работа. 🔥',
    
    // Student page
    srsPrompt: 'Как хорошо вы запомнили?',
    modeFull: 'Полный',
    modeDots: 'Кружки',
    modeBlind: 'Вслепую'
  },
  en: {
    // App titles & headers
    mainTitle: 'Sanskrit Wave Notation',
    settingsTitle: 'Settings',
    helpTitle: 'Instructions',
    shlokaInputLabel: 'Verse Input',
    shlokaInputHint: 'Two stanzas · each on a new line',
    shlokaPlaceholder: 'Enter verse text...',
    encodingLabel: 'Encoding:',
    searchLabel: 'Search',
    difficultyLabel: 'Difficulty',
    sylAuthor: 'Authorial',
    sylStd: 'Standard',
    libExportTitle: 'Library Export',
    libIdLabel: 'Verse ID',
    libTitleRuLabel: 'Title (RU)',
    libTitleEnLabel: 'Title (EN)',
    libTransRuLabel: 'Translation (RU)',
    libTransEnLabel: 'Translation (EN)',
    libTagsLabel: 'Tags',
    libExportBtn: '↓ Download JSON',
    beatTapIntro: 'Tap G or L in sync with the highlight.',
    emptyStateHint: 'Enter text and click "Run" to build the diagram',
    
    // Settings labels
    waveHeightLabel: 'Wave Height',
    sylColorsLabel: 'Syllable Colors',
    displayLabel: 'Display Options',
    notificationsLabel: 'Notifications',
    
    // Google Drive dialog
    newFolderBtn: '+ Folder',
    openBtn: 'Open',
    
    // Buttons
    runBtn: 'Run',
    resetBtn: 'Reset',
    settingsBtn: '⚙ Settings',
    helpBtn: '? Help',
    downloadBtn: 'Download',
    showPngBtn: 'Show PNG',
    altDownloadBtn: 'Download PNG',
    karaokeBtn: 'Karaoke MP4',
    storyBtn: 'Story MP4',
    saveSessionBtn: 'Save to Drive',
    loadSessionBtn: 'Load from Drive',
    detectMeterBtn: 'Detect Meter',
    meterInfoBtn: 'Meter Info',
    timingEditorBtn: 'Timing Editor',
    autoBtn: 'Auto',
    
    // Section labels
    sylDivLabel: 'Syllabification',
    schemLabel: 'Schema & Meter',
    pngLabel: 'PNG Export',
    mp4Label: 'MP4 Export',
    audioLabel: 'Audio',
    sessionLabel: 'Session',
    footerLabel: 'Footer (PNG)',
    driveLabel: 'Google Drive',
    
    // Audio drop zone
    dropZoneText: 'Drop audio file here or click to select',
    dropZoneFormats: 'Supported: MP3, WAV, M4A',
    dropZoneNoFile: 'No file selected',
    
    // Timing editor
    padaModeLabel: 'Pada Layout',
    sylModeLabel: 'Syllable Timing',
    
    // Messages
    errNoAudio: 'Please load an audio file first!',
    errNoDiagram: 'Please build the diagram (Run) first!',
    errNoTiming: 'Please mark the timing first!',
    okKaraoke: 'Karaoke video is ready!',
    okPng: 'PNG image is ready!',
    iosSaveImage: 'Long-press the image → "Save to Photos" or "Save to Files"',
    iosSaveVideo: 'Video is ready. Tap "Open video", then "Share" → "Save Video".',
    iosOpenVideo: 'Open video',
    iosNoCapture: 'This export type is not supported in Safari. Use Karaoke MP4 instead.',
    okStory: 'Story video is ready!',
    mobileExportWarning: 'MP4 export may fail on mobile devices due to browser memory limits. For reliable results, use a desktop browser.\n\nContinue on mobile anyway?',

    // Progress page
    progressTitle: 'Sanskrit Karaoke — Progress',
    studyTodayHeading: 'Study Today',
    catalogHeading: 'Verse Catalog',
    allDoneMsg: 'All done for today! Great job. 🔥',
    
    // Student page
    srsPrompt: 'How well did you remember?',
    modeFull: 'Full',
    modeDots: 'Dots',
    modeBlind: 'Blind'
  }
};

let LANG = localStorage.getItem('shloka_lang') || 'ru';

function t(key) {
  return STRINGS[LANG]?.[key] ?? STRINGS.ru[key] ?? key;
}

function setLang(lang) {
  LANG = lang;
  localStorage.setItem('shloka_lang', lang);
  applyI18n();
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  
  const langBtn = document.getElementById('btn-lang');
  if (langBtn) langBtn.textContent = '🌐 ' + LANG.toUpperCase();
}

document.addEventListener('DOMContentLoaded', applyI18n);
