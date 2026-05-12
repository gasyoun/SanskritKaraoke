const STRINGS = {
  ru: {
    runBtn: 'Построить диаграмму',
    resetBtn: 'Сброс',
    downloadPng: '↓ Скачать PNG',
    settingsBtn: '⚙ Настройки',
    helpBtn: '? Инструкция'
    // add other strings as needed
  },
  en: {
    runBtn: 'Build Diagram',
    resetBtn: 'Reset',
    downloadPng: '↓ Download PNG',
    settingsBtn: '⚙ Settings',
    helpBtn: '? Help'
  }
};

let LANG = localStorage.getItem('shloka_lang') || 'ru';

function t(key) { 
  return STRINGS[LANG]?.[key] ?? STRINGS.ru[key] ?? key; 
}

function setLang(lang) {
  LANG = lang;
  localStorage.setItem('shloka_lang', lang);
  if (typeof applyI18n === 'function') {
    applyI18n();
  }
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
}

// apply i18n on load
window.addEventListener('DOMContentLoaded', applyI18n);
