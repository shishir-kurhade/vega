var load = require('datalib/src/import/load'),
    util = require('datalib/src/util'),
    config = require('../util/config'),
    log = require('../util/log'),
    C = require('../util/constants');

function parseInteractors(model, spec, defFactory) {
  var count = 0,
      sg = {}, pd = {}, mk = {},
      signals = [], predicates = [];

  function loaded(i) {
    return function(error, data) {
      if (error) {
        log.error("LOADING FAILED: " + i.url);
      } else {
        var def = util.isObject(data) && !util.isBuffer(data) ?
          data : JSON.parse(data);
        interactor(i.name, def);
      }
      if (--count === 0) inject();
    };
  }

  function interactor(name, def) {
    sg = {};
    pd = {};
    if (def.signals) {
      signals.push.apply(signals, nsSignals(name, def.signals));
    }
    if (def.predicates) {
      predicates.push.apply(predicates, nsPredicates(name, def.predicates));
    }
    nsMarks(name, def.marks);
  }

  function inject() {
    if (util.keys(mk).length > 0) injectMarks(spec.marks);
    spec.signals = util.array(spec.signals);
    spec.predicates = util.array(spec.predicates);
    spec.signals.unshift.apply(spec.signals, signals);
    spec.predicates.unshift.apply(spec.predicates, predicates);
    defFactory();
  }

  function injectMarks(marks) {
    var m, r, i, len;
    marks = util.array(marks);

    function extend(p) {
      marks[i].properties[p] = util.extend(r.properties[p], m.properties[p]);
    }

    for (i=0, len=marks.length; i < len; ++i) {
      m = marks[i];
      if ((r = mk[m.name])) {
        marks[i] = util.duplicate(r);
        if (m.from) marks[i].from = m.from;
        if (m.properties) [C.ENTER, C.UPDATE, C.EXIT].forEach(extend);
      } else if (m.marks) {  // TODO how to override properties of nested marks?
        injectMarks(m.marks);
      }
    }    
  }

  function ns(n, s) { 
    if (util.isString(s)) {
      return s + "_" + n;
    } else {
      util.keys(s).forEach(function(x) { 
        var regex = new RegExp('\\b'+x+'\\b', "g");
        n = n.replace(regex, s[x]);
      });
      return n;
    }
  }

  function nsSignals(name, signals) {
    signals = util.array(signals);
    // Two passes to ns all signals, and then overwrite their definitions
    // in case signal order is important.
    signals.forEach(function(s) { s.name = sg[s.name] = ns(s.name, name); });
    signals.forEach(function(s) {
      (s.streams || []).forEach(function(t) {
        t.type = ns(t.type, sg);
        t.expr = ns(t.expr, sg);
      });
    });
    return signals;
  }

  function nsPredicates(name, predicates) {
    predicates = util.array(predicates);
    predicates.forEach(function(p) {
      p.name = pd[p.name] = ns(p.name, name);

      [p.operands, p.range].forEach(function(x) {
        (x || []).forEach(function(o) {
          if (o.signal) o.signal = ns(o.signal, sg);
          else if (o.predicate) nsOperand(o);
        });
      });

    });  
    return predicates; 
  }

  function nsOperand(o) {
    o.predicate = pd[o.predicate];
    util.keys(o.input).forEach(function(k) {
      var i = o.input[k];
      if (i.signal) i.signal = ns(i.signal, sg);
    });
  }

  function nsMarks(name, marks) {
    (marks || []).forEach(function(m) { 
      nsProperties(m.properties.enter);
      nsProperties(m.properties.update);
      nsProperties(m.properties.exit);
      mk[ns(m.name, name)] = m; 
    });
  }

  function nsProperties(propset) {
    util.keys(propset).forEach(function(k) {
      var p = propset[k];
      if (p.signal) p.signal = ns(p.signal, sg);
      else if (p.rule) {
        p.rule.forEach(function(r) { 
          if (r.signal) r.signal = ns(r.signal, sg);
          if (r.predicate) nsOperand(r); 
        });
      }
    });
  }

  (spec.interactors || []).forEach(function(i) {
    if (i.url) {
      count += 1;
      load(util.extend({url: i.url}, config.load), loaded(i));
    }
  });

  if (count === 0) setTimeout(inject, 1);
  return spec;
}

module.exports = parseInteractors;
parseInteractors.schema = {
  "refs": {
    "interactors": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "url": {"type": "string"}
        },
        "required": ["name", "url"]
      }
    }
  }
};