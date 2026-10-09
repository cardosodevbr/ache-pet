/* Aplica o tema salvo antes da página aparecer (evita piscar branco). */
(function () {
  try {
    var t = localStorage.getItem('achepet_tema');
    var escuro = t === 'escuro' || t === 'alt' ||
      (t === null && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    if (escuro) document.documentElement.setAttribute('data-tema', 'escuro');
  } catch (e) { /* sem armazenamento: fica no tema claro */ }
})();
