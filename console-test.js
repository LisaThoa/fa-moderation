/*!
 * fa-moderation — outils de modération pour Forumactif.
 * Configuration : config.js. Styles : config.css. Documentation : README.md.
 * Licence MIT.
 */

(function (window, document) {
  'use strict';

  var VERSION = '0.5.0';
  var MON_URL = (document.currentScript && document.currentScript.src) || '';

  var DEFAUTS = {
    emplacement: { cible: '#fa-moderation', position: 'fin' },
    staff: true,
    lectureSeule: false,
    style: true,
    simultanes: 2,
    pause: 150,
    balisage: {
      message: '.post',
      auteur: '.postprofile a[href^="/u"], .postprofile-name a, .post_pseudo a, .postauthor a, .name a',
      nomAuteur: '.postprofile-name, .postprofile .name, .post_pseudo, .postauthor, .name',
      date: '.topic-date, .post-date, .postdetails, .author',
      auteurSujet: '.topic-author, .topicslist-author, .authorlist, .author',
      reponses: '.posts, .topicslist-replies, .topics-replies',
      typeSujet: '.topic-type, .fal-sujet__type'
    },
    recensement: null,
    chargeur: null
  };

  var DEFAUTS_RECENSEMENT = {
    activites: '',
    archive: '',
    reponses: 1,
    absences: '',
    nouveaux: null,
    periode: 'mois',
    membres: { groupes: [] },
    exclure: { groupes: [], membres: [] },
    mention: '@"{pseudo}"'
  };

  var POSITIONS = { debut: 'afterbegin', fin: 'beforeend', avant: 'beforebegin', apres: 'afterend' };

  function fusion() {
    var out = {}, i, k;
    for (i = 0; i < arguments.length; i++) {
      var src = arguments[i] || {};
      for (k in src) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
    }
    return out;
  }

  function el(tag, cls, texte) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (texte != null) n.textContent = texte;
    return n;
  }

  function texteDe(node) {
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function estStaff() {
    var u = window._userdata;
    return !!(u && (+u.user_level === 1 || +u.user_level === 2));
  }

  var MOIS = {
    jan: 0, fév: 1, fev: 1, mar: 2, avr: 3, mai: 4, juin: 5,
    juil: 6, aoû: 7, aou: 7, sep: 8, oct: 9, nov: 10, déc: 11, dec: 11
  };

  function dateFr(txt) {
    if (!txt) return null;
    var s = txt.replace(/\s+/g, ' ').trim();
    var hm = s.match(/(\d{1,2})\s*:\s*(\d{2})/);
    var h = hm ? +hm[1] : 0, mn = hm ? +hm[2] : 0;
    var d;

    if (/aujourd/i.test(s)) { d = new Date(); d.setHours(h, mn, 0, 0); return d; }
    if (/hier/i.test(s)) { d = new Date(); d.setDate(d.getDate() - 1); d.setHours(h, mn, 0, 0); return d; }

    var m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], h, mn);
    m = s.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);
    if (m) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1], h, mn);
    m = s.match(/(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\.?(?:\s+(\d{4}))?/);
    if (!m) return null;
    var mois = MOIS[m[2].slice(0, 4).toLowerCase()];
    if (mois == null) mois = MOIS[m[2].slice(0, 3).toLowerCase()];
    if (mois == null) return null;
    if (m[3]) return new Date(+m[3], mois, +m[1], h, mn);
    // Format sans année : l'année en cours, ou la précédente si la date tomberait dans le futur.
    d = new Date(new Date().getFullYear(), mois, +m[1], h, mn);
    if (d > new Date()) d.setFullYear(d.getFullYear() - 1);
    return d;
  }

  function dateCourte(d) {
    return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  }

  function versChamp(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function debutPeriode(periode) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    if (typeof periode === 'number') {
      d.setDate(d.getDate() - periode);
      return d;
    }
    // Un recensement se fait en fin de mois ou au début du suivant : pendant les 7 premiers jours,
    // la période proposée est le mois précédent.
    if (d.getDate() <= 7) d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    return d;
  }

  /** « /f7-activite-rps », « https://…/t12-sujet », « f7 », « 7 » → { type, id, url }. */
  function cible(valeur) {
    var s = String(valeur == null ? '' : valeur).trim();
    if (!s) return null;
    var chemin = s.replace(/^https?:\/\/[^/]+/i, '');
    var m = chemin.match(/^\/?([ft])(\d+)(?:p\d+)?(-[^#?]*)?/i);
    if (m) {
      var type = m[1].toLowerCase() === 't' ? 'sujet' : 'forum';
      return { type: type, id: +m[2], url: '/' + m[1].toLowerCase() + m[2] + (m[3] || '-') };
    }
    if (/^\d+$/.test(s)) return { type: 'forum', id: +s, url: '/f' + s + '-' };
    return null;
  }

  // File d'attente : Forumactif répond mal à une rafale de requêtes.
  function file(cfg) {
    var actifs = 0, attente = [];
    function suivant() {
      if (actifs >= cfg.simultanes || !attente.length) return;
      var t = attente.shift();
      actifs++;
      var fini = function () { setTimeout(function () { actifs--; suivant(); }, cfg.pause); };
      t.fn().then(function (v) { fini(); t.ok(v); }, function (e) { fini(); t.ko(e); });
    }
    return function (fn) {
      return new Promise(function (ok, ko) { attente.push({ fn: fn, ok: ok, ko: ko }); suivant(); });
    };
  }

  function chargeurDe(cfg) {
    var enFile = file(cfg);
    return function (url) {
      return enFile(function () {
        if (cfg.chargeur) return Promise.resolve(cfg.chargeur(url));
        return fetch(url, { credentials: 'same-origin' }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status + ' sur ' + url);
          return r.text();
        });
      }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        doc.famBrut = html;
        return doc;
      });
    };
  }

  function estInterdit(doc) {
    return !!doc.querySelector('input[type="password"]');
  }

  // Lu dans le source brut : certains templates mettent la pagination d'origine en commentaire
  // et la remplacent par des boutons en JavaScript.
  function decalages(doc, motif) {
    var vus = {};
    var brut = doc.famBrut || doc.documentElement.outerHTML;
    var re = /href\s*=\s*["']([^"']+)["']/gi, h;
    while ((h = re.exec(brut))) {
      var href = h[1].replace(/&amp;/g, '&').replace(/^https?:\/\/[^/]+/i, '');
      var m = href.match(motif);
      if (m) vus[+m[1]] = href;
    }
    return vus;
  }

  function idProfil(lien) {
    return lien ? ((lien.getAttribute('href') || '').match(/^\/u(\d+)/) || [])[1] || null : null;
  }

  function lireSection(doc, cfg) {
    var b = cfg.balisage;
    var sujets = [], vus = {};
    [].forEach.call(doc.querySelectorAll('a.topictitle'), function (a) {
      var href = (a.getAttribute('href') || '').split('#')[0];
      var id = (href.match(/\/t(\d+)/) || [])[1];
      if (!id || vus[id]) return;
      vus[id] = 1;
      var ligne = a.closest('li.row, tr, li, .topic') || a.parentElement;

      var blocAuteur = ligne.querySelector(b.auteurSujet);
      var lien = blocAuteur && blocAuteur.querySelector('a[href^="/u"]');
      var nom = lien ? texteDe(lien) : texteDe(blocAuteur).replace(/^par\s+/i, '');

      var noeudReponses = ligne.querySelector(b.reponses);
      var reponses = noeudReponses ? parseInt(texteDe(noeudReponses).replace(/\D+/g, ''), 10) : NaN;

      // Forumactif appelle le post-it « Note ». Beaucoup de templates ne l'indiquent que par
      // l'icône de statut (announce…, sticky…) ou son infobulle.
      var type = texteDe(ligne.querySelector(b.typeSujet));
      var infobulles = [].map.call(ligne.querySelectorAll('[title], img[alt], [aria-label]'), function (n) {
        return [n.getAttribute('title'), n.getAttribute('alt'), n.getAttribute('aria-label')].join(' ');
      }).join(' ');
      var icones = (ligne.outerHTML.match(/(?:src=|url\()[^)>\s]+/gi) || []).join(' ');
      var epingle = /^\s*(annonce|note|post-it)/i.test(type) ||
        /\b(annonce|post-it|épinglé)|(^|\s)note(\s|$|:)/i.test(infobulles) ||
        /announce|sticky|global/i.test(icones);

      var bloc = ligne.querySelector('.lastpost, .topicslist-lastpost, .lastpost-infos') || ligne;
      var morceaux = bloc.innerHTML.split(/<br\s*\/?>/i);
      var date = null;
      for (var i = morceaux.length - 1; i >= 0 && !date; i--) {
        var tmp = doc.createElement('div');
        tmp.innerHTML = morceaux[i];
        date = dateFr(texteDe(tmp));
      }

      sujets.push({
        id: id, url: href, titre: texteDe(a),
        auteur: { id: idProfil(lien), nom: nom },
        reponses: isNaN(reponses) ? null : reponses,
        epingle: epingle,
        date: date
      });
    });
    return sujets;
  }

  // Replis pour les templates entièrement personnalisés : le premier lien de profil qui porte un
  // texte (celui de l'avatar n'en a pas), et les éléments dont la classe évoque une date.
  function lienAuteur(post, b) {
    var desig = [].slice.call(post.querySelectorAll(b.auteur));
    var avecTexte = function (a) { return texteDe(a); };
    return desig.filter(avecTexte)[0] || [].filter.call(post.querySelectorAll('a[href]'), function (a) {
      return /^\/u\d+$/.test(a.getAttribute('href') || '') && texteDe(a);
    })[0] || desig[0] || null;
  }

  function dateDuMessage(post, b) {
    var noeuds = [post.querySelector(b.date)].concat([].slice.call(post.querySelectorAll('[class*="date"], [class*="time"], time')));
    for (var i = 0; i < noeuds.length; i++) {
      var d = noeuds[i] && dateFr(texteDe(noeuds[i]));
      if (d) return d;
    }
    return null;
  }

  function lireMessages(doc, cfg) {
    var b = cfg.balisage;
    return [].map.call(doc.querySelectorAll(b.message), function (post) {
      var lien = lienAuteur(post, b);
      return {
        id: idProfil(lien),
        nom: texteDe(lien) || texteDe(post.querySelector(b.nomAuteur)),
        date: dateDuMessage(post, b),
        ancre: (post.id || '').replace(/^p/, '')
      };
    }).filter(function (m) { return m.nom || m.id; });
  }

  /** Plus grand ancêtre du lien qui ne contient que ce membre : ligne de tableau ou bloc d'un template libre. */
  function blocMembre(a) {
    var bloc = a;
    while (bloc.parentElement && !/^(BODY|TABLE|TBODY|THEAD|UL|OL)$/.test(bloc.parentElement.tagName)) {
      var ids = {};
      [].forEach.call(bloc.parentElement.querySelectorAll('a[href^="/u"]'), function (x) {
        var m = (x.getAttribute('href') || '').match(/^\/u(\d+)/);
        if (m) ids[m[1]] = 1;
      });
      if (Object.keys(ids).length > 1) break;
      bloc = bloc.parentElement;
    }
    return bloc;
  }

  function lireMembres(doc) {
    var membres = [];
    var zone = doc.querySelector('.memberlist, #memberlist, table.table1, table.forumline') || doc;
    [].forEach.call(zone.querySelectorAll('a[href^="/u"]'), function (a) {
      var m = (a.getAttribute('href') || '').match(/^\/u(\d+)$/);
      var nom = texteDe(a);
      if (!m || !nom) return;
      var inscription = (texteDe(blocMembre(a)).match(/\d{1,2}\/\d{1,2}\/\d{4}/) || [])[0];
      membres.push({ id: m[1], nom: nom, inscription: inscription ? dateFr(inscription) : null });
    });
    return membres;
  }

  /** Parcourt toutes les pages d'une liste ; `motif` capture le décalage dans les liens de pagination. */
  function toutesLesPages(url, motif, charger, lire, cle) {
    var vus = {}, tous = [], lues = {};
    function page(u, depart) {
      lues[depart] = 1;
      return charger(u).then(function (doc) {
        if (estInterdit(doc)) throw new Error('accès refusé : ' + url);
        var nouveaux = lire(doc).filter(function (x) {
          var k = cle(x);
          if (vus[k]) return false;
          vus[k] = 1;
          return true;
        });
        tous = tous.concat(nouveaux);
        var liens = decalages(doc, motif);
        var prochain = Object.keys(liens).map(Number)
          .filter(function (n) { return n > depart && !lues[n]; })
          .sort(function (a, b) { return a - b; })[0];
        if (prochain == null) return tous;
        return page(liens[prochain], prochain);
      });
    }
    return page(url, 0);
  }

  function listeMembres(url, charger) {
    return toutesLesPages(url, /(?:[?&]start=|\/g\d+p)(\d+)/, charger, lireMembres, function (m) { return m.id; });
  }

  // /groups affiche en liens les groupes du membre connecté, et tous les autres dans <select name="g">.
  function lireGroupes(doc) {
    var vus = {}, groupes = [];
    function ajouter(id, nom) {
      if (!id || !nom || vus[id]) return;
      vus[id] = 1;
      groupes.push({ id: +id, nom: nom });
    }
    [].forEach.call(doc.querySelectorAll('a[href]'), function (a) {
      ajouter(((a.getAttribute('href') || '').match(/^\/g(\d+)-/) || [])[1], texteDe(a));
    });
    [].forEach.call(doc.querySelectorAll('select[name="g"] option'), function (o) {
      if (/^\d+$/.test(o.value)) ajouter(o.value, texteDe(o));
    });
    return groupes.sort(function (a, b) { return a.nom.localeCompare(b.nom, 'fr'); });
  }

  /** Membres recensés, et ceux écartés par `exclure` ({ groupes: [numéros], membres: [pseudos] }). */
  function membresDuForum(rc, charger, exclure) {
    var groupesExclus = rc.exclure.groupes.concat(exclure && exclure.groupes || []);
    var pseudosExclus = rc.exclure.membres.concat(exclure && exclure.membres || []);
    var sources = rc.membres.groupes.length
      ? rc.membres.groupes.map(function (g) { return '/g' + g + '-'; })
      : ['/memberlist?mode=joined&order=ASC'];
    return Promise.all([
      Promise.all(sources.map(function (u) { return listeMembres(u, charger); })),
      Promise.all(groupesExclus.map(function (g) { return listeMembres('/g' + g + '-', charger); }))
    ]).then(function (r) {
      var horsJeu = {};
      r[1].forEach(function (l) { l.forEach(function (m) { horsJeu[m.id] = 1; }); });
      pseudosExclus.forEach(function (n) { horsJeu['nom:' + String(n).trim().toLowerCase()] = 1; });
      var vus = {}, membres = [], exclus = [];
      r[0].forEach(function (l) {
        l.forEach(function (m) {
          if (vus[m.id]) return;
          vus[m.id] = 1;
          (horsJeu[m.id] || horsJeu['nom:' + m.nom.toLowerCase()] ? exclus : membres).push(m);
        });
      });
      return { membres: membres, exclus: exclus };
    });
  }

  function sujetsDuForum(f, cfg, charger) {
    return toutesLesPages(f.url, new RegExp('^/f' + f.id + 'p(\\d+)-'), charger,
      function (doc) { return lireSection(doc, cfg); }, function (s) { return s.id; });
  }

  function messagesDuSujet(t, depuis, cfg, charger, lecture) {
    var rang = 0;
    var parAncre = function (m) { return m.ancre || 'rang' + (rang++); };
    return toutesLesPages(t.url, new RegExp('^/t' + t.id + 'p(\\d+)-'), charger,
      function (doc) { return lireMessages(doc, cfg); }, parAncre)
      .then(function (messages) {
        if (lecture) {
          lecture.lus += messages.length;
          lecture.sansDate += messages.filter(function (m) { return !m.date; }).length;
        }
        return messages.filter(function (m) { return !depuis || (m.date && m.date >= depuis); });
      });
  }

  function cleDe(x) { return x.id ? 'u' + x.id : 'nom:' + String(x.nom).toLowerCase(); }

  /** « /f12-absences, /t40-absences » ou ['/f12-…', 40] → liste de cibles valides. */
  function cibles(valeur) {
    var liste = Array.isArray(valeur) ? valeur : String(valeur || '').split(/[,;\n]+/);
    return liste.map(cible).filter(Boolean);
  }

  /** Section : auteurs des sujets actifs depuis `depuis`. Sujet unique : auteurs des messages postés depuis `depuis`. */
  function absents(sources, depuis, cfg, charger) {
    return Promise.all(sources.map(function (c) {
      var lecture = c.type === 'sujet'
        ? messagesDuSujet(c, depuis, cfg, charger)
        : sujetsDuForum(c, cfg, charger).then(function (sujets) {
            return sujets.filter(function (s) { return !s.epingle && (!s.date || s.date >= depuis); })
              .map(function (s) { return s.auteur; });
          });
      return lecture.catch(function (e) {
        if (window.console) console.warn('[fa-moderation] absences', c.url, e);
        return [];
      });
    })).then(function (listes) {
      var vus = {};
      listes.forEach(function (l) { l.forEach(function (m) { vus[cleDe(m)] = 1; }); });
      return vus;
    });
  }

  /** Date à partir de laquelle un inscrit est exempté : `jours` vide → début de période, 0 → aucune exemption. */
  function limiteNouveaux(jours, depuis) {
    if (jours === '' || jours == null) return depuis;
    if (+jours <= 0) return null;
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - +jours);
    return d;
  }

  /**
   * Mode section : un membre est à jour s'il est l'auteur d'au moins un sujet de la section
   * ayant le nombre de réponses requis. Mode sujet : s'il a posté dans le sujet depuis `depuis`.
   * options.absences : cibles des absences ; options.nouveaux : date d'inscription exemptée (ou null).
   */
  function recenser(cfg, source, depuis, options) {
    var rc = cfg.recensement;
    var charger = chargeurDe(cfg);
    var lecture = { lus: 0, sansDate: 0 };
    var activite = source.type === 'sujet'
      ? messagesDuSujet(source, depuis, cfg, charger, lecture).then(function (messages) {
          return { sujets: [{ id: String(source.id), url: source.url, titre: 'sujet ' + source.id }], lecture: lecture, contributions: messages.map(function (m) {
            return { membre: m, lien: source.url + (m.ancre ? '#' + m.ancre : ''), date: m.date, valide: true };
          }) };
        })
      : sujetsDuForum(source, cfg, charger).then(function (sujets) {
          return { sujets: sujets, contributions: sujets.filter(function (s) { return !s.epingle; }).map(function (s) {
            return { membre: s.auteur, lien: s.url, titre: s.titre, reponses: s.reponses, date: s.date, valide: s.reponses == null || s.reponses >= rc.reponses };
          }) };
        });

    return Promise.all([membresDuForum(rc, charger, options.exclure), activite, absents(options.absences, depuis, cfg, charger)]).then(function (r) {
      var membres = r[0].membres, act = r[1], excuses = r[2];
      var parMembre = {};
      act.contributions.forEach(function (c) {
        var k = cleDe(c.membre);
        (parMembre[k] || (parMembre[k] = [])).push(c);
      });

      var bilan = { danger: [], insuffisants: [], absents: [], nouveaux: [], ajour: [], sujets: act.sujets, membres: membres.length,
        exclus: r[0].exclus.map(function (m) { return { membre: m, contributions: [] }; }) };
      membres.forEach(function (mb) {
        var contributions = parMembre['u' + mb.id] || parMembre['nom:' + mb.nom.toLowerCase()] || [];
        var ligne = { membre: mb, contributions: contributions };
        var valide = contributions.some(function (c) { return c.valide; });
        if (valide) bilan.ajour.push(ligne);
        else if (excuses['u' + mb.id] || excuses['nom:' + mb.nom.toLowerCase()]) bilan.absents.push(ligne);
        else if (options.nouveaux && mb.inscription && mb.inscription >= options.nouveaux) bilan.nouveaux.push(ligne);
        else if (contributions.length) bilan.insuffisants.push(ligne);
        else bilan.danger.push(ligne);
      });
      var parNom = function (a, b) { return a.membre.nom.localeCompare(b.membre.nom, 'fr'); };
      ['danger', 'insuffisants', 'absents', 'nouveaux', 'ajour', 'exclus'].forEach(function (k) { bilan[k].sort(parNom); });

      // Diagnostic : auteurs absents de la liste des membres (exclus, PNJ, ou lecture ratée),
      // et sujets dont le nombre de réponses n'a pas pu être lu (comptés à jour par défaut).
      var connus = {};
      membres.concat(r[0].exclus).forEach(function (mb) { connus['u' + mb.id] = connus['nom:' + mb.nom.toLowerCase()] = 1; });
      var inconnus = {};
      act.contributions.forEach(function (c) {
        if (!connus[cleDe(c.membre)]) inconnus[c.membre.nom || '(sans nom)'] = 1;
      });
      bilan.inconnus = Object.keys(inconnus).sort(function (a, b) { return a.localeCompare(b, 'fr'); });
      bilan.reponsesIlisibles = act.contributions.filter(function (c) { return c.reponses === null; }).length;
      bilan.lecture = act.lecture || null;
      return bilan;
    });
  }

  function lienMembre(mb) {
    var a = el('a', 'fam-membre', mb.nom);
    a.href = '/u' + mb.id;
    return a;
  }

  function copier(valeur) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(valeur);
    var t = el('textarea');
    t.value = valeur;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
    return Promise.resolve();
  }

  function boutonCopier(texte, valeur) {
    var b = el('button', 'fam-bouton fam-bouton--discret', texte);
    b.type = 'button';
    b.addEventListener('click', function () {
      copier(valeur()).then(function () {
        b.textContent = 'Copié';
        setTimeout(function () { b.textContent = texte; }, 1500);
      });
    });
    return b;
  }

  function detailContributions(l) {
    if (!l.contributions.length) return null;
    var s = el('span', 'fam-detail');
    l.contributions.forEach(function (c, i) {
      if (i) s.appendChild(document.createTextNode(', '));
      var a = el('a', null, c.reponses != null
        ? c.reponses + ' réponse' + (c.reponses > 1 ? 's' : '')
        : dateCourte(c.date));
      a.href = c.lien;
      if (c.titre) a.title = c.titre;
      s.appendChild(a);
    });
    return s;
  }

  function groupe(titre, lignes, rc, options) {
    var bloc = el(options.replie ? 'details' : 'section', 'fam-groupe fam-groupe--' + options.classe);
    bloc.appendChild(el(options.replie ? 'summary' : 'h4', 'fam-groupe__titre', titre + ' (' + lignes.length + ')'));
    if (!lignes.length) {
      bloc.appendChild(el('p', 'fam-vide', 'Aucun membre.'));
      return bloc;
    }
    var ul = el('ul', 'fam-liste');
    lignes.forEach(function (l) {
      var li = el('li', 'fam-ligne');
      li.appendChild(lienMembre(l.membre));
      var d = options.detail && options.detail(l);
      if (d) li.appendChild(d);
      ul.appendChild(li);
    });
    bloc.appendChild(ul);
    if (options.copier) {
      var outils = el('div', 'fam-outils');
      outils.appendChild(boutonCopier('Copier les mentions', function () {
        return lignes.map(function (l) { return rc.mention.replace('{pseudo}', l.membre.nom).replace('{id}', l.membre.id); }).join(' ');
      }));
      outils.appendChild(boutonCopier('Copier la liste BBCode', function () {
        return '[list]' + lignes.map(function (l) { return '[*][url=/u' + l.membre.id + ']' + l.membre.nom + '[/url]'; }).join('') + '[/list]';
      }));
      bloc.appendChild(outils);
    }
    return bloc;
  }

  function blocArchivage(sujets, archive, cfg) {
    var bloc = el('section', 'fam-groupe fam-groupe--archivage');
    var epingles = sujets.length;
    sujets = sujets.filter(function (s) { return !s.epingle; });
    epingles -= sujets.length;
    bloc.appendChild(el('h4', 'fam-groupe__titre', 'Archivage (' + sujets.length + ' sujet' + (sujets.length > 1 ? 's' : '') + ')'));
    if (epingles) bloc.appendChild(el('p', 'fam-champ__aide', epingles + ' annonce(s) ou note(s) laissée(s) en place.'));
    if (!archive) {
      bloc.appendChild(el('p', 'fam-vide', 'Aucune section d\'archivage indiquée.'));
      return bloc;
    }
    var ul = el('ul', 'fam-liste');
    var cases = [];
    sujets.forEach(function (s) {
      var li = el('li', 'fam-ligne');
      var lab = el('label', 'fam-case');
      var c = el('input');
      c.type = 'checkbox';
      c.checked = true;
      c.value = s.id;
      cases.push(c);
      lab.appendChild(c);
      var a = el('a', null, s.titre);
      a.href = s.url;
      lab.appendChild(a);
      li.appendChild(lab);
      ul.appendChild(li);
    });
    bloc.appendChild(ul);
    if (cfg.lectureSeule) {
      cases.forEach(function (c) { c.disabled = true; });
      bloc.appendChild(el('p', 'fam-champ__aide', 'Lecture seule : aucun sujet ne peut être déplacé.'));
      return bloc;
    }

    var bouton = el('button', 'fam-bouton', 'Déplacer les sujets cochés');
    bouton.type = 'button';
    var etat = el('p', 'fam-progression');
    etat.hidden = true;
    bouton.addEventListener('click', function () {
      var ids = cases.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
      if (!ids.length) return;
      if (!window.confirm(ids.length + ' sujet' + (ids.length > 1 ? 's' : '') + ' vont être déplacés vers ' + archive.url + '. Confirmer ?')) return;
      bouton.disabled = true;
      etat.hidden = false;
      etat.textContent = 'Déplacement en cours…';
      deplacer(ids, archive.id, cfg).then(function (r) {
        etat.textContent = r.faits.length + ' sujet' + (r.faits.length > 1 ? 's' : '') + ' déplacé' + (r.faits.length > 1 ? 's' : '') + '.' +
          (r.deja.length ? ' Déjà dans la section : ' + r.deja.length + '.' : '') +
          (r.echecs.length ? ' Échec pour : ' + r.echecs.join(', ') + '.' : '');
      }, function (e) {
        etat.textContent = 'Le déplacement a échoué : ' + e.message;
        bouton.disabled = false;
      });
    });
    bloc.appendChild(el('p', 'fam-champ__aide', 'Destination : ' + archive.url));
    var outils = el('div', 'fam-outils');
    outils.appendChild(bouton);
    bloc.appendChild(outils);
    bloc.appendChild(etat);
    return bloc;
  }

  function envoyer(form, valeurs) {
    var donnees = new FormData(form);
    Object.keys(valeurs).forEach(function (k) { donnees.set(k, valeurs[k]); });
    donnees.delete('cancel');
    return fetch(form.getAttribute('action'), { method: 'POST', body: donnees, credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      });
  }

  function sectionDuSujet(doc) {
    var fil = doc.querySelectorAll('a.nav[href^="/f"]');
    var dernier = fil[fil.length - 1];
    return dernier ? +((dernier.getAttribute('href').match(/^\/f(\d+)/) || [])[1]) : null;
  }

  /**
   * Déplace chaque sujet par le formulaire de modération de Forumactif (/modcp?mode=move), puis
   * vérifie dans le fil d'Ariane qu'il est arrivé. Le jeton tid, lu sur la page du sujet, peut
   * expirer entre deux lectures : un sujet resté en place a droit à un second essai.
   */
  function deplacer(ids, forumId, cfg) {
    if (cfg.lectureSeule) return Promise.reject(new Error('lecture seule'));
    forumId = +forumId;
    var charger = chargeurDe(fusion(cfg, { chargeur: null }));
    var faits = [], deja = [], echecs = [];

    function essai(id, reste) {
      return charger('/t' + id + '-').then(function (doc) {
        if (sectionDuSujet(doc) === forumId) return 'deja';
        var lien = doc.querySelector('a[href*="/modcp?"][href*="tid="]');
        var tid = lien && (lien.getAttribute('href').match(/tid=(\w+)/) || [])[1];
        if (!tid) throw new Error('outils de modération absents');
        return charger('/modcp?mode=move&t=' + id + '&tid=' + tid).then(function (d) {
          var select = d.querySelector('form[action*="/modcp"] select[name="new_forum"]');
          if (!select) throw new Error('formulaire de déplacement introuvable');
          if (!select.querySelector('option[value="f' + forumId + '"]')) throw new Error("section d'archivage introuvable");
          return envoyer(select.form, { new_forum: 'f' + forumId, confirm: 'Oui' });
        }).then(function () {
          return charger('/t' + id + '-');
        }).then(function (d) {
          if (sectionDuSujet(d) === forumId) return 'fait';
          if (reste) return essai(id, reste - 1);
          throw new Error('sujet toujours dans sa section');
        });
      });
    }

    return ids.reduce(function (suite, id) {
      return suite.then(function () {
        return essai(id, 1).then(function (r) {
          (r === 'deja' ? deja : faits).push(id);
        }, function (e) {
          echecs.push('t' + id + ' (' + e.message + ')');
        });
      });
    }, Promise.resolve()).then(function () { return { faits: faits, deja: deja, echecs: echecs }; });
  }

  function afficherBilan(zone, bilan, source, archive, depuis, options, cfg) {
    var rc = cfg.recensement;
    zone.textContent = '';
    var exigence = source.type === 'sujet'
      ? 'sans message dans le sujet depuis le ' + dateCourte(depuis)
      : 'sans sujet d\'activité ayant ' + (rc.reponses > 1 ? 'au moins ' + rc.reponses + ' réponses' : 'au moins une réponse');
    zone.appendChild(el('p', 'fam-resume', bilan.danger.length + bilan.insuffisants.length + ' membre(s) sur ' + bilan.membres + ' ' + exigence + '.'));
    if (bilan.lecture) {
      var lu = bilan.lecture;
      zone.appendChild(el('p', 'fam-champ__aide', lu.lus + ' message(s) lu(s) dans le sujet, toutes périodes confondues.'));
      if (!lu.lus) {
        zone.appendChild(el('p', 'fam-alerte', 'Aucun message trouvé dans le sujet : vérifier le réglage balisage.message.'));
      } else if (lu.sansDate) {
        zone.appendChild(el('p', 'fam-alerte', 'Date illisible pour ' + lu.sansDate + ' message(s), ignorés : vérifier le réglage balisage.date.'));
      }
    }
    if (bilan.reponsesIlisibles) {
      zone.appendChild(el('p', 'fam-alerte', 'Nombre de réponses illisible pour ' + bilan.reponsesIlisibles + ' sujet(s) : leurs auteurs sont comptés à jour. Vérifier le réglage balisage.reponses.'));
    }
    zone.appendChild(groupe('En danger', bilan.danger, rc, { classe: 'danger', copier: true }));
    if (source.type !== 'sujet') {
      zone.appendChild(groupe('Sujet sans réponse suffisante', bilan.insuffisants, rc, { classe: 'insuffisants', copier: true, detail: detailContributions }));
    }
    if (options.absences.length) zone.appendChild(groupe('Absences signalées', bilan.absents, rc, { classe: 'absents' }));
    if (options.nouveaux) {
      zone.appendChild(groupe('Inscrits depuis le ' + dateCourte(options.nouveaux), bilan.nouveaux, rc, { classe: 'nouveaux', detail: function (l) {
        return el('span', 'fam-detail', 'inscrit le ' + dateCourte(l.membre.inscription));
      } }));
    }
    zone.appendChild(groupe('À jour', bilan.ajour, rc, { classe: 'ajour', replie: true, detail: detailContributions }));
    if (bilan.exclus.length) zone.appendChild(groupe('Exclus du recensement', bilan.exclus, rc, { classe: 'exclus', replie: true }));
    if (bilan.inconnus.length) {
      var hors = el('details', 'fam-groupe fam-groupe--inconnus');
      hors.appendChild(el('summary', 'fam-groupe__titre', 'Auteurs hors de la liste des membres (' + bilan.inconnus.length + ')'));
      hors.appendChild(el('p', 'fam-vide', 'Membres exclus, comptes supprimés ou pseudos mal lus : ' + bilan.inconnus.join(', ') + '.'));
      zone.appendChild(hors);
    }
    zone.appendChild(blocArchivage(bilan.sujets, archive, cfg));
  }

  var CLE = 'fam-recensement';

  function lireReglages() {
    try { return JSON.parse(localStorage.getItem(CLE) || 'null') || {}; } catch (e) { return {}; }
  }

  function ecrireReglages(r) {
    try { localStorage.setItem(CLE, JSON.stringify(r)); } catch (e) { void e; }
  }

  function champ(form, nom, aide, input) {
    var lab = el('label', 'fam-champ');
    lab.appendChild(el('span', 'fam-champ__nom', nom));
    lab.appendChild(input);
    if (aide) lab.appendChild(el('span', 'fam-champ__aide', aide));
    form.appendChild(lab);
    return input;
  }

  /**
   * Champ « Exclure » : cases des groupes du forum (lus sur /groups) et pseudos en étiquettes,
   * avec autocomplétion sur la liste des membres, chargée à la première saisie.
   */
  function champExclusions(form, cfg, depart) {
    var charger = chargeurDe(cfg);
    var bloc = el('div', 'fam-champ fam-exclusions');
    bloc.appendChild(el('span', 'fam-champ__nom', 'Exclure'));

    var groupes = el('div', 'fam-exclusions__groupes', 'Chargement des groupes…');
    bloc.appendChild(groupes);
    var coches = (depart.groupes || []).map(Number);
    charger('/groups').then(function (doc) {
      var liste = lireGroupes(doc);
      groupes.textContent = liste.length ? '' : 'Aucun groupe trouvé.';
      liste.forEach(function (g) {
        var lab = el('label', 'fam-case');
        var c = el('input');
        c.type = 'checkbox';
        c.value = String(g.id);
        c.checked = coches.indexOf(g.id) !== -1;
        lab.appendChild(c);
        lab.appendChild(document.createTextNode(g.nom));
        groupes.appendChild(lab);
      });
    }, function () { groupes.textContent = 'Liste des groupes illisible.'; });

    var pseudos = (depart.membres || []).slice();
    var etiquettes = el('div', 'fam-exclusions__pseudos');
    function dessiner() {
      etiquettes.textContent = '';
      pseudos.forEach(function (p, i) {
        var e = el('span', 'fam-etiquette', p);
        var x = el('button', 'fam-etiquette__retirer', '×');
        x.type = 'button';
        x.title = 'Retirer';
        x.addEventListener('click', function () { pseudos.splice(i, 1); dessiner(); });
        e.appendChild(x);
        etiquettes.appendChild(e);
      });
    }
    dessiner();

    var ligne = el('div', 'fam-exclusions__ajout');
    var saisie = el('input');
    saisie.type = 'text';
    saisie.placeholder = 'Pseudo';
    var idListe = 'fam-pseudos-' + Math.random().toString(36).slice(2, 8);
    saisie.setAttribute('list', idListe);
    var proposition = el('datalist');
    proposition.id = idListe;
    var chargee = false;
    saisie.addEventListener('focus', function () {
      if (chargee) return;
      chargee = true;
      listeMembres('/memberlist?mode=joined&order=ASC', charger).then(function (membres) {
        membres.sort(function (a, b) { return a.nom.localeCompare(b.nom, 'fr'); }).forEach(function (m) {
          var o = el('option');
          o.value = m.nom;
          proposition.appendChild(o);
        });
      }, function () { chargee = false; });
    });
    function ajouter() {
      var p = saisie.value.trim();
      if (p && !pseudos.some(function (x) { return x.toLowerCase() === p.toLowerCase(); })) pseudos.push(p);
      saisie.value = '';
      dessiner();
    }
    saisie.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); ajouter(); }
    });
    var bouton = el('button', 'fam-bouton fam-bouton--discret', 'Ajouter');
    bouton.type = 'button';
    bouton.addEventListener('click', ajouter);
    ligne.appendChild(saisie);
    ligne.appendChild(bouton);
    bloc.appendChild(ligne);
    bloc.appendChild(proposition);
    bloc.appendChild(etiquettes);
    bloc.appendChild(el('span', 'fam-champ__aide', 'Groupes entiers (staff, PNJ…) et pseudos, par exemple les autres personnages d\'un membre absent.'));
    form.appendChild(bloc);

    return function () {
      return {
        groupes: [].filter.call(groupes.querySelectorAll('input'), function (c) { return c.checked; }).map(function (c) { return +c.value; }),
        membres: pseudos.slice()
      };
    };
  }

  function moduleRecensement(cfg) {
    var rc = cfg.recensement;
    var reglages = lireReglages();
    var racine = el('section', 'fam-module fam-recensement');
    racine.appendChild(el('h3', 'fam-module__titre', 'Recensement'));

    var form = el('form', 'fam-formulaire');
    var activites = el('input');
    activites.type = 'text';
    activites.value = reglages.activites || rc.activites || '';
    activites.placeholder = '/f7-activites-rp';
    champ(form, 'Activités RP', 'Lien ou numéro d\'une section, ou lien d\'un sujet unique.', activites);

    var archive = el('input');
    archive.type = 'text';
    archive.value = reglages.archive || rc.archive || '';
    archive.placeholder = '/f2-corbeille';
    champ(form, 'Archivage', 'Section où déplacer les sujets de la période.', archive);

    var absences = el('input');
    absences.type = 'text';
    absences.value = reglages.absences != null ? reglages.absences : [].concat(rc.absences || []).join(', ');
    absences.placeholder = '/f12-absences';
    champ(form, 'Absences', 'Facultatif. Section ou sujet unique ; plusieurs valeurs séparées par des virgules.', absences);

    var nouveaux = el('input');
    nouveaux.type = 'number';
    nouveaux.min = '0';
    nouveaux.value = reglages.nouveaux != null ? reglages.nouveaux : (rc.nouveaux == null ? '' : String(rc.nouveaux));
    nouveaux.placeholder = 'début de la période';
    champ(form, 'Délai des nouveaux inscrits (jours)', 'Les membres inscrits depuis moins de ce nombre de jours ne sont pas mis en danger. Vide : inscrits depuis le début de la période. 0 : aucune exemption.', nouveaux);

    var exclusions = champExclusions(form, cfg, reglages.exclure || { groupes: [], membres: [] });

    var date = el('input');
    date.type = 'date';
    date.value = versChamp(debutPeriode(rc.periode));
    champ(form, 'Début de la période', 'Sert au mode sujet, aux absences et, par défaut, aux nouveaux inscrits.', date);

    var lancer = el('button', 'fam-bouton', 'Lancer le recensement');
    lancer.type = 'submit';
    form.appendChild(lancer);
    racine.appendChild(form);

    var progression = el('p', 'fam-progression');
    progression.hidden = true;
    racine.appendChild(progression);
    var resultats = el('div', 'fam-resultats');
    racine.appendChild(resultats);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      resultats.textContent = '';
      var source = cible(activites.value);
      var dest = cible(archive.value);
      if (!source) {
        resultats.appendChild(el('p', 'fam-alerte', 'Activités RP : indiquer le lien ou le numéro d\'une section, ou le lien d\'un sujet.'));
        return;
      }
      if (archive.value.trim() && (!dest || dest.type !== 'forum')) {
        resultats.appendChild(el('p', 'fam-alerte', 'Archivage : indiquer le lien ou le numéro d\'une section.'));
        return;
      }
      var sourcesAbsences = cibles(absences.value);
      if (absences.value.trim() && !sourcesAbsences.length) {
        resultats.appendChild(el('p', 'fam-alerte', "Absences : indiquer le lien ou le numéro d'une section, ou le lien d'un sujet."));
        return;
      }
      var exclure = exclusions();
      ecrireReglages({ activites: activites.value.trim(), archive: archive.value.trim(), absences: absences.value.trim(), nouveaux: nouveaux.value.trim(), exclure: exclure });
      var depuis = date.value ? new Date(date.value + 'T00:00:00') : debutPeriode(rc.periode);
      var options = { absences: sourcesAbsences, nouveaux: limiteNouveaux(nouveaux.value.trim(), depuis), exclure: exclure };
      lancer.disabled = true;
      progression.hidden = false;
      progression.textContent = 'Recensement en cours…';
      recenser(cfg, source, depuis, options).then(function (bilan) {
        afficherBilan(resultats, bilan, source, dest, depuis, options, cfg);
      }, function (e) {
        resultats.appendChild(el('p', 'fam-alerte', 'Le recensement a échoué : ' + e.message));
        if (window.console) console.error('[fa-moderation]', e);
      }).then(function () {
        progression.hidden = true;
        lancer.disabled = false;
      });
    });

    return racine;
  }

  function poserStyle(cfg) {
    if (cfg.style === false || document.getElementById('fam-css')) return;
    var href = typeof cfg.style === 'string' ? cfg.style : MON_URL.replace(/\.js(\?.*)?$/, '.css');
    if (!href || href === MON_URL) return;
    var l = document.createElement('link');
    l.id = 'fam-css';
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }

  function ancrer(cfg) {
    var e = cfg.emplacement;
    if (typeof e === 'string' || (e && e.nodeType)) e = { cible: e };
    e = e || {};
    var noeud = typeof e.cible === 'string' ? document.querySelector(e.cible) : e.cible;
    if (!noeud) {
      if (window.console) console.warn('[fa-moderation] emplacement introuvable :', e.cible);
      return null;
    }
    if (noeud.famRacine && noeud.famRacine.parentNode) noeud.famRacine.parentNode.removeChild(noeud.famRacine);
    var racine = el('div', 'fam-root');
    noeud.insertAdjacentElement(POSITIONS[e.position] || 'beforeend', racine);
    noeud.famRacine = racine;
    return racine;
  }

  function preparer(config) {
    var cfg = fusion(DEFAUTS, config);
    cfg.balisage = fusion(DEFAUTS.balisage, config && config.balisage);
    if (cfg.recensement) {
      var rc = fusion(DEFAUTS_RECENSEMENT, cfg.recensement);
      rc.membres = fusion(DEFAUTS_RECENSEMENT.membres, rc.membres);
      rc.exclure = fusion(DEFAUTS_RECENSEMENT.exclure, rc.exclure);
      cfg.recensement = rc;
    }
    return cfg;
  }

  function init(config) {
    var cfg = preparer(config);
    if (cfg.staff && !estStaff()) return null;
    poserStyle(cfg);
    var racine = ancrer(cfg);
    if (!racine) return null;
    if (cfg.recensement) racine.appendChild(moduleRecensement(cfg));
    return racine;
  }

  var config = window.FA_MODERATION_CONFIG;
  if (config && config.staff !== false && !estStaff()) return;

  window.FAModeration = {
    version: VERSION,
    init: init,
    deplacer: function (ids, forumId, cfgBrute) { return deplacer([].concat(ids).map(String), forumId, preparer(cfgBrute)); },
    recenser: function (cfgBrute, source, depuis) {
      var cfg = preparer(cfgBrute);
      var rc = cfg.recensement;
      depuis = depuis || debutPeriode(rc.periode);
      return recenser(cfg, cible(source || rc.activites), depuis, { absences: cibles(rc.absences), nouveaux: limiteNouveaux(rc.nouveaux, depuis) });
    },
    _interne: {
      membres: function (cfgBrute) {
        var cfg = preparer(fusion({ recensement: {} }, cfgBrute));
        return membresDuForum(cfg.recensement, chargeurDe(cfg)).then(function (r) { return r.membres; });
      },
      dateFr: dateFr, cible: cible, lireSection: lireSection, lireMessages: lireMessages, lireMembres: lireMembres, preparer: preparer }
  };

  if (config && !config.manuel) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(config); });
    else init(config);
  }
})(window, document);

(function () {
  if (document.getElementById('fam-css')) return;
  var s = document.createElement('style');
  s.id = 'fam-css';
  s.textContent = ":where(.fam-root) {\n  --fam-texte: inherit;\n  --fam-texte-doux: color-mix(in srgb, currentColor 62%, transparent);\n  --fam-accent: #8a4b2d;\n  --fam-accent-contraste: #ffffff;\n  --fam-trait: 1px;\n  --fam-arrondi: 4px;\n  --fam-espace: 14px;\n  --fam-taille: 14px;\n  --fam-taille-petite: 12px;\n  --fam-taille-titre: 16px;\n}\n.fam-root {\n  display: grid;\n  gap: var(--fam-espace);\n  color: var(--fam-texte);\n  font-size: var(--fam-taille);\n  line-height: 1.45;\n}\n\n/* Les thèmes de forum stylent button, input, summary et les titres sans classe :\n   remise à zéro de ce qui déborde sur le plugin (majuscules, fonds, ombres, marges). */\n.fam-root button,\n.fam-root input,\n.fam-root select,\n.fam-root summary,\n.fam-root h3,\n.fam-root h4 {\n  text-transform: none;\n  letter-spacing: normal;\n  text-shadow: none;\n  box-shadow: none;\n}\n.fam-root button,\n.fam-root input,\n.fam-root select {\n  font: inherit;\n  margin: 0;\n  min-height: 0;\n  height: auto;\n  line-height: 1.3;\n  vertical-align: middle;\n}\n.fam-root input[type=\"text\"],\n.fam-root input[type=\"number\"],\n.fam-root input[type=\"date\"],\n.fam-root select {\n  width: 100%;\n  max-width: 100%;\n  box-sizing: border-box;\n}\n\n.fam-root .fam-module { display: grid; gap: var(--fam-espace); }\n.fam-root .fam-module__titre { margin: 0; font-size: var(--fam-taille-titre); }\n\n.fam-root .fam-formulaire { display: grid; gap: calc(var(--fam-espace) * .75); }\n.fam-root .fam-champ { display: grid; gap: .3em; min-width: 0; }\n.fam-root .fam-champ__nom { margin: 0; font-size: var(--fam-taille-petite); color: var(--fam-texte-doux); }\n.fam-root .fam-champ__aide { font-size: var(--fam-taille-petite); color: var(--fam-texte-doux); }\n\n.fam-root button.fam-bouton {\n  justify-self: start;\n  width: auto;\n  cursor: pointer;\n  padding: .4em .9em;\n  border: var(--fam-trait) solid var(--fam-accent);\n  border-radius: var(--fam-arrondi);\n  background: var(--fam-accent);\n  color: var(--fam-accent-contraste);\n}\n.fam-root button.fam-bouton:disabled { opacity: .5; cursor: progress; }\n.fam-root button.fam-bouton--discret { background: transparent; color: var(--fam-accent); font-size: var(--fam-taille-petite); }\n\n.fam-root .fam-progression,\n.fam-root .fam-resume { margin: 0; }\n.fam-root .fam-progression { color: var(--fam-texte-doux); font-size: var(--fam-taille-petite); }\n.fam-root .fam-alerte {\n  margin: 0;\n  padding: .4em .7em;\n  border-left: 3px solid var(--fam-accent);\n  font-size: var(--fam-taille-petite);\n}\n\n.fam-root .fam-resultats { display: grid; gap: var(--fam-espace); }\n.fam-root .fam-groupe { display: grid; gap: .4em; }\n.fam-root .fam-groupe__titre { margin: 0; padding: 0; border: 0; background: none; color: inherit; font-size: 1em; font-weight: 700; }\n.fam-root details.fam-groupe > summary { cursor: pointer; display: list-item; }\n.fam-root .fam-liste { margin: 0; padding: 0; list-style: none; display: grid; gap: .25em; }\n.fam-root .fam-ligne { display: flex; flex-wrap: wrap; gap: 0 .6em; align-items: baseline; }\n.fam-root .fam-detail,\n.fam-root .fam-vide { margin: 0; color: var(--fam-texte-doux); font-size: var(--fam-taille-petite); }\n.fam-root .fam-outils { display: flex; flex-wrap: wrap; gap: .5em; }\n\n.fam-root .fam-case { display: inline-flex; align-items: center; gap: .45em; cursor: pointer; }\n.fam-root .fam-case input { flex: none; width: auto; accent-color: var(--fam-accent); }\n\n.fam-root .fam-exclusions__groupes {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(10em, 1fr));\n  gap: .3em .8em;\n  max-height: 10em;\n  overflow: auto;\n}\n.fam-root .fam-exclusions__ajout { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .5em; align-items: center; }\n.fam-root .fam-exclusions__pseudos { display: flex; flex-wrap: wrap; gap: .4em; }\n.fam-root .fam-exclusions__pseudos:empty { display: none; }\n.fam-root .fam-etiquette {\n  display: inline-flex;\n  align-items: center;\n  gap: .2em;\n  padding: .15em .25em .15em .6em;\n  border: var(--fam-trait) solid var(--fam-accent);\n  border-radius: var(--fam-arrondi);\n  font-size: var(--fam-taille-petite);\n  line-height: 1.3;\n}\n.fam-root button.fam-etiquette__retirer {\n  width: auto;\n  padding: 0 .3em;\n  border: 0;\n  border-radius: 0;\n  background: none;\n  color: inherit;\n  cursor: pointer;\n  font-size: 1.1em;\n  line-height: 1;\n}\n.fam-root button.fam-etiquette__retirer:hover { color: var(--fam-accent); }\n";
  document.head.appendChild(s);
})();

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
