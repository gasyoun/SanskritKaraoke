// Teacher dashboard access list — UI gating only (shows/hides teacher.html
// content for a nicer message than a raw Firestore permission error).
// The actual enforcement lives in firestore.rules `isTeacher()`; keep both
// lists in sync when adding/removing a teacher account.
window.TEACHER_EMAILS = [
  'gasyoun@gmail.com'
];
