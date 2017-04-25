/* global SPECIFICITY: true */

exports.smallImage = function smallImage() {
    return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
};

exports.bind = function(callback, context) {
    return function() {
        return callback.apply(context, arguments);
    };
};

/*
 * base64-arraybuffer
 * https://github.com/niklasvh/base64-arraybuffer
 *
 * Copyright (c) 2012 Niklas von Hertzen
 * Licensed under the MIT license.
 */

exports.decode64 = function(base64) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var len = base64.length, i, encoded1, encoded2, encoded3, encoded4, byte1, byte2, byte3;

    var output = "";

    for (i = 0; i < len; i+=4) {
        encoded1 = chars.indexOf(base64[i]);
        encoded2 = chars.indexOf(base64[i+1]);
        encoded3 = chars.indexOf(base64[i+2]);
        encoded4 = chars.indexOf(base64[i+3]);

        byte1 = (encoded1 << 2) | (encoded2 >> 4);
        byte2 = ((encoded2 & 15) << 4) | (encoded3 >> 2);
        byte3 = ((encoded3 & 3) << 6) | encoded4;
        if (encoded3 === 64) {
            output += String.fromCharCode(byte1);
        } else if (encoded4 === 64 || encoded4 === -1) {
            output += String.fromCharCode(byte1, byte2);
        } else{
            output += String.fromCharCode(byte1, byte2, byte3);
        }
    }

    return output;
};

exports.getBounds = function(node) {
    if (node.getBoundingClientRect) {
        var clientRect = node.getBoundingClientRect();
        var width = node.offsetWidth == null ? clientRect.width : node.offsetWidth;
        return {
            top: clientRect.top,
            bottom: clientRect.bottom || (clientRect.top + clientRect.height),
            right: clientRect.left + width,
            left: clientRect.left,
            width:  width,
            height: node.offsetHeight == null ? clientRect.height : node.offsetHeight
        };
    }
    return {};
};

exports.offsetBounds = function(node) {
    var parent = node.offsetParent ? exports.offsetBounds(node.offsetParent) : {top: 0, left: 0};

    return {
        top: node.offsetTop + parent.top,
        bottom: node.offsetTop + node.offsetHeight + parent.top,
        right: node.offsetLeft + parent.left + node.offsetWidth,
        left: node.offsetLeft + parent.left,
        width: node.offsetWidth,
        height: node.offsetHeight
    };
};

exports.parseBackgrounds = function(backgroundImage) {
    var whitespace = ' \r\n\t',
        method, definition, prefix, prefix_i, block, results = [],
        mode = 0, numParen = 0, quote, args;
    var appendResult = function() {
        if(method) {
            if (definition.substr(0, 1) === '"') {
                definition = definition.substr(1, definition.length - 2);
            }
            if (definition) {
                args.push(definition);
            }
            if (method.substr(0, 1) === '-' && (prefix_i = method.indexOf('-', 1 ) + 1) > 0) {
                prefix = method.substr(0, prefix_i);
                method = method.substr(prefix_i);
            }
            results.push({
                prefix: prefix,
                method: method.toLowerCase(),
                value: block,
                args: args,
                image: null
            });
        }
        args = [];
        method = prefix = definition = block = '';
    };
    args = [];
    method = prefix = definition = block = '';
    backgroundImage.split("").forEach(function(c) {
        if (mode === 0 && whitespace.indexOf(c) > -1) {
            return;
        }
        switch(c) {
        case '"':
            if(!quote) {
                quote = c;
            } else if(quote === c) {
                quote = null;
            }
            break;
        case '(':
            if(quote) {
                break;
            } else if(mode === 0) {
                mode = 1;
                block += c;
                return;
            } else {
                numParen++;
            }
            break;
        case ')':
            if (quote) {
                break;
            } else if(mode === 1) {
                if(numParen === 0) {
                    mode = 0;
                    block += c;
                    appendResult();
                    return;
                } else {
                    numParen--;
                }
            }
            break;

        case ',':
            if (quote) {
                break;
            } else if(mode === 0) {
                appendResult();
                return;
            } else if (mode === 1) {
                if (numParen === 0 && !method.match(/^url$/i)) {
                    args.push(definition);
                    definition = '';
                    block += c;
                    return;
                }
            }
            break;
        }

        block += c;
        if (mode === 0) {
            method += c;
        } else {
            definition += c;
        }
    });

    appendResult();
    return results;
};

exports.parseShadow = function(str) {
    var propertyFilters = { color: /^(#|rgb|hsl|(?!(inset|initial|inherit))[^\d\-\.]+)/i, inset: /^inset/i, px: /px$/i };
    var pxPropertyNames = [ 'x', 'y', 'blur', 'spread' ];
    var properties = str.split(/ (?![^(]*\))/);
    var info = {};
    for (var key in propertyFilters) {
        info[key] = properties.filter(propertyFilters[key].test.bind(propertyFilters[key]));
        info[key] = info[key].length === 0 ? null : info[key].length === 1 ? info[key][0] : info[key];
    }
    for (var i=0; i<info.px.length; i++) {
        info[pxPropertyNames[i]] = parseInt(info.px[i]);
    }
    return info;
};

exports.matrixInverse = function(m) {
    // This is programmed specifically for transform matrices, which have a fixed structure.
    // [ a b | c ]   [ a0 a2 | a4 ]
    // [ d e | f ] = [ a1 a3 | a5 ]
    var a = m[0], b = m[2], c = m[4], d = m[1], e = m[3], f = m[5];
    var detInv = 1 / (a*e - b*d);
    return [e*detInv, -d*detInv, -b*detInv, a*detInv, (b*f-c*e)*detInv, (c*d-a*f)*detInv];
};

function getShapeBounds(shape) {
    var len = shape.length;
    if (len === 1 && shape[0][0] === 'rect') {
        return {
            left: shape[0][1],
            top: shape[0][2],
            right: shape[0][1] + shape[0][3],
            bottom: shape[0][2] + shape[0][4],
            width: shape[0][3],
            height: shape[0][4]
        };
    }

    var xmin = Infinity;
    var ymin = Infinity;
    var xmax = -Infinity;
    var ymax = -Infinity;

    for (var i = 0; i < len; i++) {
        var s = shape[i];
        var x = s[s.length - 2];
        var y = s[s.length - 1];

        if (typeof x === 'number') {
            xmin = Math.min(xmin, x);
            ymin = Math.min(ymin, y);
            xmax = Math.max(xmax, x);
            ymax = Math.max(ymax, y);
        } else {
            var bounds = getShapeBounds(s);
            xmin = Math.min(xmin, bounds.left);
            ymin = Math.min(ymin, bounds.top);
            xmax = Math.max(xmax, bounds.right);
            ymax = Math.max(ymax, bounds.bottom);
        }
    }

    return {
        left: xmin,
        top: ymin,
        right: xmax,
        bottom: ymax,
        width: xmax - xmin,
        height: ymax - ymin
    };
}

exports.getShapeBounds = getShapeBounds;


var REGEX_PSEUDO_ELEMENTS = /::?(?:after|before|first-line|first-letter)/;

exports.getMatchingRules = function(element, selectorRegex) {
    var matchingRules = [];

    var getMatchingRulesRecursive = function(rules) {
        if (!rules) {
            return;
        }

        var len = rules.length;
        for (var i = 0; i < len; i++) {
            var rule = rules[i];
            switch (rule.type) {
            case 1: // CSSRule.STYLE_RULE
                try {
                    if (element.matches(rule.selectorText.replace(/::?[a-zA-Z\-]+/g, '')) && (!selectorRegex || selectorRegex.test(rule.selectorText))) {
                        matchingRules.push(rule);
                    }
                } catch (e) {
                    // ignore
                }
                break;

            case 3:  // CSSRule.IMPORT_RULE
                getMatchingRulesRecursive(rule.styleSheet.cssRules);
                break;

            case 4:  // CSSRule.MEDIA_RULE
            case 12: // CSSRule.SUPPORTS_RULE
            case 13: // CSSRule.DOCUMENT_RULE
                getMatchingRulesRecursive(rule.cssRules);
                break;            
            }
        }
    };

    var lenStyleSheets = element.ownerDocument.styleSheets.length;
    for (var i = 0; i < lenStyleSheets; i++) {
        try {
            var styleSheet = element.ownerDocument.styleSheets[i];
            if (styleSheet && styleSheet.cssRules) {
                getMatchingRulesRecursive(styleSheet.cssRules);
            }
        } catch (e) {
            // ignore
        }
    }

    var calculateSpecificity = function(rule) {
        var s = SPECIFICITY.calculate(rule.selectorText);
        var len = s.length;

        if (len === 1) {
            return s[0].specificityArray;
        }

        var arr = [];
        for (var i = 0; i < len; i++) {
            if (element.matches(s[i].selector.replace(REGEX_PSEUDO_ELEMENTS, ''))) {
                arr.push(s[i].specificityArray);
            }
        }

        arr.sort(SPECIFICITY.compare);
        return arr[arr.length - 1];
    };

    matchingRules.sort(function(a, b) {
        if (a.specificity === undefined) {
            a.specificity = calculateSpecificity(a);
        }
        if (b.specificity === undefined) {
            b.specificity = calculateSpecificity(b);
        }

        return SPECIFICITY.compare(a.specificity, b.specificity);
    });

    return matchingRules;
};
