(function () {
  "use strict";

  var morphology = null;
  var renderVersions = new WeakMap();
  var morphologyReady = import("./study-ordering-v64/word-surface-morphology.mjs")
    .then(function (module) {
      morphology = module;
      return module;
    })
    .catch(function () { return null; });

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function relationWord(value) {
    return text(typeof value === "string" ? value : value && (value.word || value.text || value.form));
  }

  function expandAlternatives(value) {
    var target = text(value);
    if (!target) return [];
    var alternatives = target.split(/\s+\/\s+/).map(function (part) { return part.trim(); }).filter(Boolean);
    return alternatives.length > 1 ? [target].concat(alternatives) : [target];
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function targetPattern(value) {
    return text(value).split(/\s+/).map(function (part) {
      return escapeRegExp(part).replace(/['’]/g, "['’]");
    }).join("\\s+");
  }

  function targetsForItem(item, forms) {
    var sourceForms = Array.isArray(forms) ? forms : Array.isArray(item && item.forms) ? item.forms : [];
    var values = [item && item.word].concat(sourceForms.map(relationWord));
    var seen = {};
    var targets = [];

    values.reduce(function (all, value) { return all.concat(expandAlternatives(value)); }, []).forEach(function (target) {
      var key = target.toLowerCase().replace(/’/g, "'");
      if (!key || seen[key]) return;
      seen[key] = true;
      targets.push(target);
    });

    return targets.sort(function (left, right) { return right.length - left.length; });
  }

  function inferSentenceForms(sentence, targets) {
    if (!morphology || typeof morphology.isDirectSurfaceInflection !== "function") return [];
    var candidates = String(sentence == null ? "" : sentence).match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) || [];
    var singleWordTargets = targets.filter(function (target) { return !/\s/.test(target); });
    var seen = {};
    return candidates.filter(function (candidate) {
      var key = candidate.toLowerCase().replace(/’/g, "'");
      if (seen[key]) return false;
      var isForm = singleWordTargets.some(function (target) {
        return morphology.isDirectSurfaceInflection(target, candidate);
      });
      if (isForm) seen[key] = true;
      return isForm;
    });
  }

  function segments(sentence, targets) {
    var value = String(sentence == null ? "" : sentence);
    var exactTargets = Array.isArray(targets) ? targets : [];
    var patterns = exactTargets.concat(inferSentenceForms(value, exactTargets)).map(targetPattern).filter(Boolean);
    if (!value || !patterns.length) return [{ text: value, highlighted: false }];

    var matcher = new RegExp("(^|[^A-Za-z0-9])(" + patterns.join("|") + ")(?=$|[^A-Za-z0-9])", "gi");
    var output = [];
    var cursor = 0;
    var match;
    while ((match = matcher.exec(value)) !== null) {
      var start = match.index + match[1].length;
      var highlightedText = match[2];
      if (start > cursor) output.push({ text: value.slice(cursor, start), highlighted: false });
      output.push({ text: highlightedText, highlighted: true });
      cursor = start + highlightedText.length;
    }
    if (cursor < value.length) output.push({ text: value.slice(cursor), highlighted: false });
    return output.length ? output : [{ text: value, highlighted: false }];
  }

  function renderNow(element, sentence, item, forms) {
    var parts = segments(sentence, targetsForItem(item, forms));
    element.replaceChildren();
    parts.forEach(function (part) {
      if (!part.highlighted) {
        element.appendChild(document.createTextNode(part.text));
        return;
      }
      var strong = document.createElement("strong");
      strong.className = "example-target";
      strong.textContent = part.text;
      element.appendChild(strong);
    });
  }

  function render(element, sentence, item, forms) {
    if (!element) return;
    var version = (renderVersions.get(element) || 0) + 1;
    renderVersions.set(element, version);
    renderNow(element, sentence, item, forms);
    if (morphology) return;
    morphologyReady.then(function (module) {
      if (!module || !element.isConnected || renderVersions.get(element) !== version) return;
      renderNow(element, sentence, item, forms);
    });
  }

  window.IeltsExampleHighlight = {
    render: render,
    segments: segments,
    targetsForItem: targetsForItem,
    setMorphology: function (module) { morphology = module; }
  };
})();
