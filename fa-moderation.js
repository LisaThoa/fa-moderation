/*!
 * fa-moderation — outils de modération pour Forumactif.
 * Configuration : config.js. Styles : config.css. Documentation : README.md.
 * Licence MIT.
 */

(function (window, document) {
  'use strict';

  var VERSION = '0.3.0';
  var MON_URL = (document.currentScript && document.currentScript.src) || '';

  var DEFAUTS = {
    emplacement: { cible: '#fa-moderation', position: 'fin' },
    staff: true,
    style: true,
    simultanes: 2,
    pause: 150,
    balisage: {
      message: '.post',
      auteur: '.postprofile a[href^="/u"], .postprofile-name a, .postauthor a, .name a',
      nomAuteur: '.postprofile-name, .postprofile .name, .postauthor, .name',
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
    if (typeof periode === 'number') d.setDate(d.getDate() - periode);
    else d.setDate(1);
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
      }).then(function (html) { return new DOMParser().parseFromString(html, 'text/html'); });
    };
  }

  function estInterdit(doc) {
    return !!doc.querySelector('input[type="password"]');
  }

  function decalages(doc, motif) {
    var vus = {};
    [].forEach.call(doc.querySelectorAll('a[href]'), function (a) {
      var m = (a.getAttribute('href') || '').match(motif);
      if (m) vus[+m[1]] = a.getAttribute('href');
    });
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

      var type = texteDe(ligne.querySelector(b.typeSujet));
      var statut = (ligne.querySelector('[title]') || {}).title || '';
      var epingle = /annonce|post-it|épinglé/i.test(type + ' ' + statut);

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

  function lireMessages(doc, cfg) {
    var b = cfg.balisage;
    return [].map.call(doc.querySelectorAll(b.message), function (post) {
      var lien = post.querySelector(b.auteur);
      return {
        id: idProfil(lien),
        nom: lien ? texteDe(lien) : texteDe(post.querySelector(b.nomAuteur)),
        date: dateFr(texteDe(post.querySelector(b.date))),
        ancre: (post.id || '').replace(/^p/, '')
      };
    }).filter(function (m) { return m.nom || m.id; });
  }

  function lireMembres(doc) {
    var membres = [];
    var zone = doc.querySelector('.memberlist, #memberlist, table.table1, table.forumline') || doc;
    [].forEach.call(zone.querySelectorAll('a[href^="/u"]'), function (a) {
      var m = (a.getAttribute('href') || '').match(/^\/u(\d+)$/);
      var nom = texteDe(a);
      if (!m || !nom) return;
      var ligne = a.closest('tr, li') || a.parentElement;
      var inscription = (texteDe(ligne).match(/\d{1,2}\/\d{1,2}\/\d{4}/) || [])[0];
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

  function membresDuForum(rc, charger) {
    var parId = function (m) { return m.id; };
    var liste = function (u) { return toutesLesPages(u, /[?&]start=(\d+)/, charger, lireMembres, parId); };
    var sources = rc.membres.groupes.length
      ? rc.membres.groupes.map(function (g) { return '/g' + g + '-'; })
      : ['/memberlist?mode=joined&order=ASC'];
    return Promise.all([
      Promise.all(sources.map(liste)),
      Promise.all(rc.exclure.groupes.map(function (g) { return liste('/g' + g + '-'); }))
    ]).then(function (r) {
      var horsJeu = {};
      r[1].forEach(function (l) { l.forEach(function (m) { horsJeu[m.id] = 1; }); });
      rc.exclure.membres.forEach(function (n) { horsJeu['nom:' + String(n).toLowerCase()] = 1; });
      var vus = {}, membres = [];
      r[0].forEach(function (l) {
        l.forEach(function (m) {
          if (vus[m.id] || horsJeu[m.id] || horsJeu['nom:' + m.nom.toLowerCase()]) return;
          vus[m.id] = 1;
          membres.push(m);
        });
      });
      return membres;
    });
  }

  function sujetsDuForum(f, cfg, charger) {
    return toutesLesPages(f.url, new RegExp('^/f' + f.id + 'p(\\d+)-'), charger,
      function (doc) { return lireSection(doc, cfg); }, function (s) { return s.id; });
  }

  function messagesDuSujet(t, depuis, cfg, charger) {
    var parAncre = function (m) { return m.ancre || m.nom + (m.date ? +m.date : ''); };
    return toutesLesPages(t.url, new RegExp('^/t' + t.id + 'p(\\d+)-'), charger,
      function (doc) { return lireMessages(doc, cfg); }, parAncre)
      .then(function (messages) {
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
    var activite = source.type === 'sujet'
      ? messagesDuSujet(source, depuis, cfg, charger).then(function (messages) {
          return { sujets: [{ id: String(source.id), url: source.url, titre: 'sujet ' + source.id }], contributions: messages.map(function (m) {
            return { membre: m, lien: source.url + (m.ancre ? '#' + m.ancre : ''), date: m.date, valide: true };
          }) };
        })
      : sujetsDuForum(source, cfg, charger).then(function (sujets) {
          return { sujets: sujets, contributions: sujets.filter(function (s) { return !s.epingle; }).map(function (s) {
            return { membre: s.auteur, lien: s.url, titre: s.titre, reponses: s.reponses, date: s.date, valide: s.reponses == null || s.reponses >= rc.reponses };
          }) };
        });

    return Promise.all([membresDuForum(rc, charger), activite, absents(options.absences, depuis, cfg, charger)]).then(function (r) {
      var membres = r[0], act = r[1], excuses = r[2];
      var parMembre = {};
      act.contributions.forEach(function (c) {
        var k = cleDe(c.membre);
        (parMembre[k] || (parMembre[k] = [])).push(c);
      });

      var bilan = { danger: [], insuffisants: [], absents: [], nouveaux: [], ajour: [], sujets: act.sujets, membres: membres.length };
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
      ['danger', 'insuffisants', 'absents', 'nouveaux', 'ajour'].forEach(function (k) { bilan[k].sort(parNom); });
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
    var aDeplacer = sujets.filter(function (s) { return !s.epingle; }).length;
    bloc.appendChild(el('h4', 'fam-groupe__titre', 'Archivage (' + aDeplacer + ' sujet' + (aDeplacer > 1 ? 's' : '') + ')'));
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
      c.checked = !s.epingle;
      c.value = s.id;
      cases.push(c);
      lab.appendChild(c);
      var a = el('a', null, s.titre);
      a.href = s.url;
      lab.appendChild(a);
      if (s.epingle) lab.appendChild(el('span', 'fam-detail', 'annonce ou post-it'));
      li.appendChild(lab);
      ul.appendChild(li);
    });
    bloc.appendChild(ul);

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
      ecrireReglages({ activites: activites.value.trim(), archive: archive.value.trim(), absences: absences.value.trim(), nouveaux: nouveaux.value.trim() });
      var depuis = date.value ? new Date(date.value + 'T00:00:00') : debutPeriode(rc.periode);
      var options = { absences: sourcesAbsences, nouveaux: limiteNouveaux(nouveaux.value.trim(), depuis) };
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
    _interne: { dateFr: dateFr, cible: cible, lireSection: lireSection, lireMessages: lireMessages, lireMembres: lireMembres, preparer: preparer }
  };

  if (config && !config.manuel) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(config); });
    else init(config);
  }
})(window, document);
