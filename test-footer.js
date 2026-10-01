
/* Test en console : un panneau flottant en lecture seule, sur n'importe quel forum Forumactif. */
(function () {
  var ancien = document.getElementById('fam-test');
  if (ancien) ancien.remove();

  var style = document.createElement('style');
  style.textContent =
    '#fam-test{position:fixed;top:16px;right:16px;z-index:2147483647;width:min(400px,calc(100vw - 32px));' +
    'max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;padding:14px 16px;background:#fffdf9;color:#26221d;' +
    'border:1px solid #d9d2c6;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.25);font:14px/1.45 system-ui,sans-serif;text-align:left}' +
    '#fam-test *{box-sizing:border-box}' +
    '#fam-test input,#fam-test select{width:100%;padding:5px 8px;border:1px solid #c9c1b4;border-radius:4px;background:#fff;color:#26221d;font:inherit}' +
    '#fam-test input[type=checkbox]{width:auto}' +
    '#fam-test a{color:#8a4b2d}' +
    '#fam-test-entete{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;font-weight:700}' +
    '#fam-test-fermer{border:0;background:none;font-size:20px;line-height:1;cursor:pointer;color:inherit}';
  document.head.appendChild(style);

  var boite = document.createElement('div');
  boite.id = 'fam-test';
  boite.innerHTML = '<div id="fam-test-entete"><span>fa-moderation · test</span>' +
    '<button type="button" id="fam-test-fermer" title="Fermer">×</button></div><div id="fam-test-corps"></div>';
  document.body.appendChild(boite);
  document.getElementById('fam-test-fermer').onclick = function () { boite.remove(); style.remove(); };

  window.FAModeration.init({
    staff: false,
    lectureSeule: true,
    style: false,
    emplacement: { cible: '#fam-test-corps' },
    recensement: {}
  });

  console.info('[fa-moderation] panneau de test ouvert, en lecture seule : aucun sujet ne peut être déplacé. ' +
    'Recensement sans interface : FAModeration.recenser({ recensement: {} }, "/f12-activites", new Date(2026, 8, 1)).then(console.log)');
})();
