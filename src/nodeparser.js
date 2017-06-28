var log = require('./log');
var punycode = require('punycode');
var NodeContainer = require('./nodecontainer');
var TextContainer = require('./textcontainer');
var PseudoElementContainer = require('./pseudoelementcontainer');
var FontMetrics = require('./fontmetrics');
var Color = require('./color');
var StackingContext = require('./stackingcontext');
var utils = require('./utils');
var ListStyleTypeFormatter = require('liststyletype-formatter');

var bind = utils.bind;
var getBounds = utils.getBounds;
var parseBackgrounds = utils.parseBackgrounds;
var offsetBounds = utils.offsetBounds;
var getMatchingRules = utils.getMatchingRules;

function NodeParser(element, renderer, support, imageLoader, options) {
    log("Starting NodeParser");
    this.renderer = renderer;
    this.options = options;
    this.range = null;
    this.support = support;
    this.renderQueue = [];
    this.stack = new StackingContext(true, 1, element.ownerDocument, null);
    var parent = new NodeContainer(element, null);
    if (options.background) {
        renderer.rectangle(0, 0, renderer.width, renderer.height, new Color(options.background));
    }
    if (element === element.ownerDocument.documentElement) {
        // http://www.w3.org/TR/css3-background/#special-backgrounds
        var canvasBackground = new NodeContainer(parent.color('backgroundColor').isTransparent() ? element.ownerDocument.body : element.ownerDocument.documentElement, null);
        renderer.rectangle(0, 0, renderer.width, renderer.height, canvasBackground.color('backgroundColor'));
    }
    parent.visibile = parent.isElementVisible();
    this.createPseudoHideStyles(element.ownerDocument);
    this.disableAnimations(element.ownerDocument);

    this.counters = {};
    this.quoteDepth = 0;
    this.resolvePseudoContent(element);

    // MCH -->
    var width = window.innerWidth || document.documentElement.clientWidth;
    var height = window.innerHeight || document.documentElement.clientHeight;

    var allNodes = [parent].concat(this.getChildren(parent));
    allNodes.forEach(function(container) {
        // test for visibility in viewport
        var isVisible = container.isElementVisible();
        if (isVisible && options.type === 'view') {
            var rect = container.node.getBoundingClientRect && container.node.getBoundingClientRect();
            if (rect) {
                isVisible = rect.left <= width && rect.right >= 0 && rect.top <= height && rect.bottom >= 0;
            }

            // make sure all the parent nodes are also visible
            if (isVisible) {
                var parent = container.parent;
                while (parent && !parent.visible) {
                    parent.visible = true;
                    parent = parent.parent;
                }
            }
        }
        container.visible = isVisible;
    });

    this.nodes = flatten(allNodes
        .filter(function(container) { return container.visible; })
        .map(this.getPseudoElements, this)
        .map(this.applyInlineStylesToSvg, this)
    );

    // <--

    /*
    this.nodes = flatten([parent].concat(this.getChildren(parent)).filter(function(container) {
        return container.visible = container.isElementVisible();
    }).map(this.getPseudoElements, this));
    */

    this.fontMetrics = new FontMetrics();
    log("Fetched nodes, total:", this.nodes.length);
    log("Calculate overflow clips");
    this.calculateOverflowClips();
    log("Start fetching images");
    this.images = imageLoader.fetch(this.nodes.filter(isElement));
    this.ready = this.images.ready.then(bind(function() {
        log("Images loaded, starting parsing");
        log("Creating stacking contexts");
        this.createStackingContexts();
        log("Sorting stacking contexts");
        this.sortStackingContexts(this.stack);
        this.parse(this.stack);
        log("Render queue created with " + this.renderQueue.length + " items");
        return new Promise(bind(function(resolve) {
            if (!options.async) {
                this.renderQueue.forEach(this.paint, this);
                resolve();
            } else if (typeof(options.async) === "function") {
                options.async.call(this, this.renderQueue, resolve);
            } else if (this.renderQueue.length > 0){
                this.renderIndex = 0;
                this.asyncRenderer(this.renderQueue, resolve);
            } else {
                resolve();
            }
        }, this));
    }, this));
}

NodeParser.prototype.calculateOverflowClips = function() {
    this.nodes.forEach(function(container) {
        if (isElement(container)) {
            if (isPseudoElement(container)) {
                container.appendToDOM();
            }
            container.borders = this.parseBorders(container);
            var clip = (container.css('overflow') === "hidden" ||
                        container.css('overflow') === "scroll") ? [container.borders.clip] : [];
            var cssClip = container.parseClip();
            if (cssClip && ["absolute", "fixed"].indexOf(container.css('position')) !== -1) {
                clip.push([["rect",
                        container.bounds.left + cssClip.left,
                        container.bounds.top + cssClip.top,
                        cssClip.right - cssClip.left,
                        cssClip.bottom - cssClip.top
                ]]);
            }

            // MCH -->
            // if the container has a transform, calculate the pre-image of the top left and bottom right
            // corners of the canvas and apply the inverse transform to the clips of the parent containers
            var hasTransform = container.hasTransform();
            var a11, a12, a13, a21, a22, a23, ox, oy;
            if (hasTransform) {
                var invTransform = container.inverseTransform();
                var m = invTransform.matrix;
                a11 = m[0];
                a12 = m[2];
                a13 = m[4];
                a21 = m[1];
                a22 = m[3];
                a23 = m[5];
                ox = invTransform.origin[0];
                oy = invTransform.origin[1];

                var b = (container && container.parent && container.parent.canvasBorder) || [0, 0, this.renderer.width, this.renderer.height];
                container.canvasBorder = [
                    a11 * (b[0] + ox) + a12 * (b[1] + oy) + a13 - ox,
                    a21 * (b[0] + ox) + a22 * (b[1] + oy) + a23 - oy,
                    a11 * (b[2] + ox) + a12 * (b[3] + oy) + a13 - ox,
                    a21 * (b[2] + ox) + a22 * (b[3] + oy) + a23 - oy
                ];
            } else {
                container.canvasBorder = [0, 0, this.renderer.width, this.renderer.height];
            }

            var parentClip = getParentClip(container);
            if (parentClip) {
                if (hasTransform) {
                    var len = parentClip.length;
                    container.clip = [];

                    for (var i = 0; i < len; i++) {
                        var c = parentClip[i];
                        var lenClip = c.length;
                        var transformedClip = [];

                        for (var j = 0; j < lenClip; j++) {
                            var shape = c[j];

                            //                    [ a11 a12 | a13 ]   [ x + ox ]    [ ox ]
                            // v' = A*(v+o) - o = [ a21 a22 | a23 ] * [ y + oy ] -  [ oy ]
                            //                    [   0   0 |   1 ]   [   1    ]    [  0 ]
                            // x' = a11*(x+ox) + a12*(y+oy) + a13 - ox
                            // y' = a21*(x+ox) + a22*(y+oy) + a23 - oy

                            var transformedShape = [shape[0]];
                            var lenShape = shape.length;
                            for (var k = 1; k < lenShape; k += 2) {
                                transformedShape.push(
                                    a11 * (shape[k] + ox) + a12 * (shape[k + 1] + oy) + a13 - ox,
                                    a21 * (shape[k] + ox) + a22 * (shape[k + 1] + oy) + a23 - oy
                                );
                            }
                            transformedClip.push(transformedShape);
                        }
                        container.clip.push(transformedClip);
                    }
                    Array.prototype.push.apply(container.clip, clip);
                } else {
                    container.clip = parentClip.concat(clip);
                }
            } else {
                container.clip = clip;
            }

            // original code:
            // container.clip = hasParentClip(container) ? container.parent.clip.concat(clip) : clip;
            // <--

            container.backgroundClip = (container.css('overflow') !== "hidden") ? container.clip.concat([container.borders.clip]) : container.clip;
            if (isPseudoElement(container)) {
                container.cleanDOM();
            }
        } else if (isTextNode(container)) {
            container.clip = hasParentClip(container) ? container.parent.clip : [];
        }
        if (!isPseudoElement(container)) {
            container.bounds = null;
        }
    }, this);
};

function hasParentClip(container) {
    return container.parent && container.parent.clip.length;
}

function getParentClip(container) {
    var pos = container.css('position');

    if (pos === 'fixed') {
        return null;
    }
    if (pos !== 'absolute') {
        return container.parent && container.parent.clip;
    }

    for (var parent = container.parent; parent; parent = parent.parent) {
        if (parent.css('position') !== 'static') {
            return parent.clip;
        }
    }
    return null;
}

NodeParser.prototype.asyncRenderer = function(queue, resolve, asyncTimer) {
    asyncTimer = asyncTimer || Date.now();
    this.paint(queue[this.renderIndex++]);
    if (queue.length === this.renderIndex) {
        resolve();
    } else if (asyncTimer + 20 > Date.now()) {
        this.asyncRenderer(queue, resolve, asyncTimer);
    } else {
        setTimeout(bind(function() {
            this.asyncRenderer(queue, resolve);
        }, this), 0);
    }
};

NodeParser.prototype.createPseudoHideStyles = function(document) {
    this.createStyles(document, '.' + PseudoElementContainer.prototype.PSEUDO_HIDE_ELEMENT_CLASS_BEFORE + ':before { content: "" !important; display: none !important; }' +
        '.' + PseudoElementContainer.prototype.PSEUDO_HIDE_ELEMENT_CLASS_AFTER + ':after { content: "" !important; display: none !important; }');
};

NodeParser.prototype.disableAnimations = function(document) {
    this.createStyles(document, '* { -webkit-animation: none !important; -moz-animation: none !important; -o-animation: none !important; animation: none !important; ' +
        '-webkit-transition: none !important; -moz-transition: none !important; -o-transition: none !important; transition: none !important;}');
};

NodeParser.prototype.createStyles = function(document, styles) {
    var hidePseudoElements = document.createElement('style');
    hidePseudoElements.innerHTML = styles;
    document.body.appendChild(hidePseudoElements);
};

NodeParser.prototype.getPseudoElements = function(container) {
    var nodes = [[container]];
    if (container.node.nodeType === Node.ELEMENT_NODE) {
        var before = this.getPseudoElement(container, ":before");
        var after = this.getPseudoElement(container, ":after");

        if (before) {
            nodes.push(before);
        }

        if (after) {
            nodes.push(after);
        }
    }
    return flatten(nodes);
};

/* applyInlineStylesToSvgs' workhorse */
function applyInlineStylesRecursive(node) {
    var cStyle = getComputedStyle(node);

    for (var j = cStyle.length-1; j >= 0; j--) {
        var property = toCamelCase(cStyle.item(j));
        node.style[property] = cStyle[property];
    }

    var childNodes = node.childNodes, len = childNodes.length;
    for (var i = 0; i < len; i++) {
        var childNode = childNodes[i];
        if (childNode.nodeType === 1) {
            applyInlineStylesRecursive(childNode);
        }
    }
}

/* Make sure we apply all styles as inline styles of svg and any contained elements so that fabric renders the properly */
NodeParser.prototype.applyInlineStylesToSvg = function(container) {
    var n = container[0].node;
    if (n.nodeType === 1 && n.tagName === "svg") {
        applyInlineStylesRecursive(n);
    }
    return container;
};


function toCamelCase(str) {
    return str.replace(/(\-[a-z])/g, function(match){
        return match.toUpperCase().replace('-','');
    });
}

NodeParser.prototype.resolvePseudoContent = function(element) {
    var style = getComputedStyle(element);
    var counterReset = style.counterReset;
    var counters = [];
    var i;

    if (counterReset && counterReset !== "none") {
        var counterResets = counterReset.split(/\s*,\s*/);
        var lenCounterResets = counterResets.length;

        for (i = 0; i < lenCounterResets; i++) {
            var parts = counterResets[i].split(/\s+/);
            counters.push(parts[0]);
            var counter = this.counters[parts[0]];
            if (!counter) {
                counter = this.counters[parts[0]] = [];
            }
            counter.push(parseInt(parts[1] || 0, 10));
        }
    }

    // handle the ::before pseudo element
    element._contentBefore = this.resolvePseudoContentInternal(element, getComputedStyle(element, ":before"));

    // handle children
    var children = element.childNodes;
    var len = children.length;
    for (i = 0; i < len; i++) {
        var child = children[i];
        if (child.nodeType === 1) {
            this.resolvePseudoContent(children[i]);
        }
    }

    // handle the ::after pseudo element
    element._contentAfter = this.resolvePseudoContentInternal(element, getComputedStyle(element, ":after"));

    var lenCounters = counters.length;
    for (i = 0; i < lenCounters; i++) {
        this.counters[counters[i]].pop();
    }
};

NodeParser.prototype.getQuote = function(style, isOpening) {
    var quotes = style.quotes ? style.quotes.split(/\s+/) : [ "'\"'", "'\"'" ];
    var idx = this.quoteDepth * 2;
    if (idx >= quotes.length) {
        idx = quotes.length - 2;
    }
    if (!isOpening) {
        ++idx;
    }
    return quotes[idx].replace(/^["']|["']$/g, "");
};

NodeParser.prototype.resolvePseudoContentInternal = function(element, style) {
    if (!style || !style.content || style.content === "none" || style.content === "-moz-alt-content" || style.display === "none") {
        return null;
    }

    var tokens = NodeParser.parsePseudoContent(style.content);
    var len = tokens.length;
    var ret = [];
    var s = "";

    // increment the counter (if there is a "counter-increment" declaration)
    var counterIncrement = style.counterIncrement;
    if (counterIncrement && counterIncrement !== "none") {
        var parts = counterIncrement.split(/\s+/);
        var ctr = this.counters[parts[0]];
        if (ctr) {
            ctr[ctr.length - 1] += parts[1] === undefined ? 1 : parseInt(parts[1], 10);
        }
    }

    // build the content string
    for (var i = 0; i < len; i++) {
        var token = tokens[i];
        switch (token.type) {
        case "string":
            s += token.value;
            break;

        case "attr":
            break;

        case "counter":
            var counter = this.counters[token.name];
            if (counter) {
                s += this.formatCounterValue([counter[counter.length - 1]], '', token.format);
            }
            break;

        case "counters":
            var counters = this.counters[token.name];
            if (counters) {
                s += this.formatCounterValue(counters, token.glue, token.format);
            }
            break;

        case "open-quote":
            s += this.getQuote(style, true);
            ++this.quoteDepth;
            break;

        case "close-quote":
            --this.quoteDepth;
            s += this.getQuote(style, false);
            break;

        case "url":
            if (s) {
                ret.push({ type: "string", value: s });
                s = "";
            }
            ret.push({ type: "image", url: token.href });
            break;
        }
    }

    if (s) {
        ret.push({ type: "string", value: s });
    }

    return ret;
};

NodeParser.prototype.formatCounterValue = function(counter, glue, format) {
    var ret = '';
    var len = counter.length;

    for (var i = 0; i < len; i++) {
        if (i > 0) {
            ret += glue;
        }
        ret += ListStyleTypeFormatter.format(counter[i], format, false);
    }

    return ret;
};

var _parsedContent = {};

NodeParser.parsePseudoContent = function(content) {
    if (_parsedContent[content]) {
        return _parsedContent[content];
    }

    var tokens = [];
    var len = content.length;
    var isString = false;
    var isEscaped = false;
    var isFunction = false;
    var str = "";
    var functionName = "";
    var args = [];

    for (var i = 0; i < len; i++) {
        var c = content.charAt(i);

        switch (c) {
        case "'":
        case "\"":
            if (isEscaped) {
                str += c;
            } else {
                isString = !isString;
                if (!isFunction && !isString) {
                    tokens.push({ type: "string", value: str });
                    str = "";
                }
            }
            break;

        case "\\":
            if (isEscaped) {
                str += c;
                isEscaped = false;
            } else {
                isEscaped = true;
            }
            break;

        case "(":
            if (isString) {
                str += c;
            } else {
                isFunction = true;
                functionName = str;
                str = "";
                args = [];
            }
            break;

        case ")":
            if (isString) {
                str += c;
            } else if (isFunction) {
                if (str) {
                    args.push(str);
                }

                switch (functionName) {
                case "attr":
                    if (args.length > 0) {
                        tokens.push({ type: "attr", attr: args[0] });
                    }
                    break;

                case "counter":
                    if (args.length > 0) {
                        var counter = {
                            type: "counter",
                            name: args[0]
                        };
                        if (args.length > 1) {
                            counter.format = args[1];
                        }
                        tokens.push(counter);
                    }
                    break;

                case "counters":
                    if (args.length > 0) {
                        var counters = {
                            type: "counters",
                            name: args[0]
                        };
                        if (args.length > 1) {
                            counters.glue = args[1];
                        }
                        if (args.length > 2) {
                            counters.format = args[2];
                        }
                        tokens.push(counters);
                    }
                    break;

                case "url":
                    if (args.length > 0) {
                        tokens.push({ type: "url", href: args[0] });
                    }
                    break;
                }

                isFunction = false;
                str = "";
            }
            break;

        case ",":
            if (isString) {
                str += c;
            } else if (isFunction) {
                args.push(str);
                str = "";
            }
            break;

        case " ":
        case "\t":
            if (isString) {
                str += c;
            } else if (str) {
                tokens.push({ type: str });
                str = "";
            }
            break;

        default:
            str += c;
        }

        if (c !== "\\") {
            isEscaped = false;
        }
    }

    if (str) {
        tokens.push({ type: str });
    }

    _parsedContent[content] = tokens;
    return tokens;
};

NodeParser.prototype.getPseudoElement = function(container, type) {
    var style = container.computedStyle(type);
    if(!style || !style.content || style.content === "none" || style.content === "-moz-alt-content" || style.display === "none" || style.visibility === "hidden") {
        return null;
    }

    var content = type === ":before" ? container.node._contentBefore : container.node._contentAfter;
    var len = content.length;

    var pseudoNode = document.createElement("html2canvaspseudoelement");
    var pseudoContainer = new PseudoElementContainer(pseudoNode, container, type);

    for (var j = style.length - 1; j >= 0; j--) {
        var property = toCamelCase(style.item(j));
        if (property !== "content") {
            pseudoNode.style[property] = style[property];
        }
    }

    pseudoNode.className = PseudoElementContainer.prototype.PSEUDO_HIDE_ELEMENT_CLASS_BEFORE + " " + PseudoElementContainer.prototype.PSEUDO_HIDE_ELEMENT_CLASS_AFTER;

    var ret = [pseudoContainer];

    for (var i = 0; i < len; i++) {
        var item = content[i];

        if (item.type === "image") {
            var img = document.createElement("img");
            img.src = parseBackgrounds("url(" + item.url + ")")[0].args[0];
            img.style.opacity = "1";
            pseudoNode.appendChild(img);
            ret.push(new NodeContainer(img, pseudoContainer));
        } else {
            var text = document.createTextNode(item.value);
            pseudoNode.appendChild(text);
            ret.push(new TextContainer(text, pseudoContainer));
        }
    }

    return ret;
};


NodeParser.prototype.getChildren = function(parentContainer) {
    return flatten([].filter.call(parentContainer.node.childNodes, renderableNode).map(function(node) {
        var container = [node.nodeType === Node.TEXT_NODE ? new TextContainer(node, parentContainer) : new NodeContainer(node, parentContainer)].filter(nonIgnoredElement);
        return node.nodeType === Node.ELEMENT_NODE && container.length && node.tagName !== "TEXTAREA" ? (container[0].isElementVisible() ? container.concat(this.getChildren(container[0])) : []) : container;
    }, this));
};

NodeParser.prototype.newStackingContext = function(container, hasOwnStacking) {
    var stack = new StackingContext(hasOwnStacking, container.getOpacity(), container.node, container.parent);
    var opacity = stack.opacity;
    container.cloneTo(stack);

    // MCH -->
    // "cloneTo" overwrites the opacity
    stack.opacity = opacity;
    // <--

    var parentStack = hasOwnStacking ? stack.getParentStack(this) : stack.parent.stack;
    parentStack.contexts.push(stack);
    container.stack = stack;
};

NodeParser.prototype.createStackingContexts = function() {
    this.nodes.forEach(function(container) {
        if (isElement(container) && (this.isRootElement(container) || hasOpacity(container) || isPositionedForStacking(container, container.parent && container.parent.hasChildWithOwnStacking) || this.isBodyWithTransparentRoot(container) || container.hasTransform())) {
            this.newStackingContext(container, true);

            // MCH -->
            if (container.parent) {
                // set a flag on the parent that one of its children has its own stacking context
                // we use this so that an absolutely (or relatively) positioned node without z-index
                // following one with a stacking context (e.g., due to a transform on the node)
                // is positioned correctly (above the previous sibling)
                container.parent.hasChildWithOwnStacking = true;
            }
            // <--
        } else if (isElement(container) && ((isPositioned(container) && zIndex0(container)) || isInlineBlock(container) || isFloating(container))) {
            this.newStackingContext(container, false);
        } else {
            container.assignStack(container.parent.stack);
        }
    }, this);
};

NodeParser.prototype.isBodyWithTransparentRoot = function(container) {
    return container.node.nodeName === "BODY" && container.parent.color('backgroundColor').isTransparent();
};

NodeParser.prototype.isRootElement = function(container) {
    return container.parent === null;
};

NodeParser.prototype.sortStackingContexts = function(stack) {
    stack.contexts.sort(zIndexSort(stack.contexts.slice(0)));
    stack.contexts.forEach(this.sortStackingContexts, this);
};

NodeParser.prototype.parseTextBounds = function(container) {
    return function(text, index, textList) {
        if (container.parent.css("textDecoration").substr(0, 4) !== "none" || text.trim().length !== 0) {
            if (this.support.rangeBounds && !container.parent.hasTransform()) {
                var offset = textList.slice(0, index).join("").length;
                return this.getRangeBounds(container.node, offset, text.length);
            } else if (container.node && typeof(container.node.data) === "string") {
                var replacementNode = container.node.splitText(text.length);
                var bounds = this.getWrapperBounds(container.node, container.parent.hasTransform());
                container.node = replacementNode;
                return bounds;
            }
        } else if(!this.support.rangeBounds || container.parent.hasTransform()){
            container.node = container.node.splitText(text.length);
        }
        return {};
    };
};

NodeParser.prototype.getWrapperBounds = function(node, transform) {
    var wrapper = node.ownerDocument.createElement('html2canvaswrapper');
    var parent = node.parentNode,
        backupText = node.cloneNode(true);

    wrapper.appendChild(node.cloneNode(true));
    parent.replaceChild(wrapper, node);
    var bounds = transform ? offsetBounds(wrapper) : getBounds(wrapper);
    parent.replaceChild(backupText, wrapper);
    return bounds;
};

NodeParser.prototype.getRangeBounds = function(node, offset, length) {
    var range = this.range || (this.range = node.ownerDocument.createRange());
    range.setStart(node, offset);
    range.setEnd(node, offset + length);
    return range.getBoundingClientRect();
};

function ClearTransform() {}

NodeParser.prototype.parse = function(stack) {
    // http://www.w3.org/TR/CSS21/visuren.html#z-index
    var negativeZindex = stack.contexts.filter(negativeZIndex); // 2. the child stacking contexts with negative stack levels (most negative first).
    var descendantElements = stack.children.filter(isElement);
    var descendantNonFloats = descendantElements.filter(not(isFloating));
    var nonInlineNonPositionedDescendants = descendantNonFloats.filter(not(isPositioned)).filter(not(inlineLevel)); // 3 the in-flow, non-inline-level, non-positioned descendants.
    var nonPositionedFloats = descendantElements.filter(not(isPositioned)).filter(isFloating); // 4. the non-positioned floats.
    var inFlow = descendantNonFloats.filter(not(isPositioned)).filter(inlineLevel); // 5. the in-flow, inline-level, non-positioned descendants, including inline tables and inline blocks.
    var stackLevel0 = stack.contexts.concat(descendantNonFloats.filter(isPositioned)).filter(zIndex0); // 6. the child stacking contexts with stack level 0 and the positioned descendants with stack level 0.
    var text = stack.children.filter(isTextNode).filter(hasText);
    var positiveZindex = stack.contexts.filter(positiveZIndex); // 7. the child stacking contexts with positive stack levels (least positive first).
    negativeZindex.concat(nonInlineNonPositionedDescendants).concat(nonPositionedFloats)
        .concat(inFlow).concat(stackLevel0).concat(text).concat(positiveZindex).forEach(function(container) {
//console.log(container.node);
            this.renderQueue.push(container);
            if (isStackingContext(container)) {
                this.parse(container);
                this.renderQueue.push(new ClearTransform());
            }
        }, this);
};

NodeParser.prototype.paint = function(container) {
    if (this.options.canceled) {
        return;
    }

    try {
        var isParentPseudoElement = container.parent && isPseudoElement(container.parent);
        if (isParentPseudoElement) {
            container.parent.appendToDOM();
        }

        if (container instanceof ClearTransform) {
            this.renderer.ctx.restore();
        } else if (isTextNode(container)) {
            this.paintText(container);
        } else {
            this.paintNode(container);
        }

        if (isParentPseudoElement) {
            container.parent.cleanDOM();
        }
    } catch(e) {
        log(e);
        if (this.options.strict) {
            throw e;
        }
    }
};

NodeParser.prototype.paintNode = function(container) {
    if (isStackingContext(container)) {
        this.renderer.setOpacity(container.opacity);
        this.renderer.ctx.save();

        if (container.hasTransform()) {
            this.renderer.setTransform(container.parseTransform());
        }

        var mixBlendMode = container.css("mixBlendMode");
        if (mixBlendMode) {
            this.renderer.setMixBlendMode(mixBlendMode);
        }
    }

    if (container.node.nodeName === "INPUT" && container.node.type === "checkbox") {
        this.paintCheckbox(container);
    } else if (container.node.nodeName === "INPUT" && container.node.type === "radio") {
        this.paintRadio(container);
    } else {
        this.paintElement(container);
    }
};

NodeParser.prototype.paintElement = function(container) {
//console.log(container.node);
    var bounds = container.parseBounds();

    this.renderer.clip(container.backgroundClip, function() {
        this.renderer.renderBackground(container, bounds, container.borders.borders.map(getWidth));
    }, this, container);

    this.renderer.mask(container.backgroundClip, function() {
        this.renderer.renderShadows(container, container.borders.clip, null, false);
    }, this, container);

    var clip = container.backgroundClip;
    if (container.node.nodeName === "LI") {
        var parent = this.getParentOfType(container, ["OL", "UL"]);
        clip = parent.css("overflow") !== "visible" ? parent.backgroundClip : null;
    } else if (container.node.nodeName === "IMG" && isPseudoElement(container.parent)) {
        clip = null;
    }

    this.renderer.clip(clip, function() {
        switch (container.node.nodeName) {
        case "svg":
        case "IFRAME":
            var imgContainer = this.images.get(container.node);
            if (imgContainer) {
                this.renderer.renderImage(container, bounds, container.borders, imgContainer);
            } else {
                log("Error loading <" + container.node.nodeName + ">", container.node);
            }
            break;
        case "IMG":
            var imageContainer = this.images.get(container.node.currentSrc || container.node.src);
            if (imageContainer) {
                this.renderer.renderImage(container, bounds, container.borders, imageContainer);
            } else {
                log("Error loading <img>", container.node.currentSrc || container.node.src);
            }
            break;
        case "VIDEO":
            var videoContainer = this.images.getVideo(container.node.videoIndex);
            if (videoContainer) {
                this.renderer.renderImage(container, bounds, container.borders, videoContainer);
            } else {
                log("Error loading <video>", container.node.src);
            }
            break;
        case "CANVAS":
            this.renderer.renderImage(container, bounds, container.borders, {image: container.node});
            break;
        case "LI":
            this.paintListItem(container);
            break;
        case "SELECT":
        case "INPUT":
        case "TEXTAREA":
            this.paintFormValue(container);
            break;
        }

        this.renderer.renderShadows(container, container.backgroundClip, container.borders, true);
    }, this, container);

    this.renderer.clip(container.clip, function() {
        this.renderer.renderBorders(container.borders.borders);
    }, this, container);
};

NodeParser.prototype.paintCheckbox = function(container) {
    var b = container.parseBounds();

    var size = Math.min(b.width, b.height);
    var bounds = {width: size - 1, height: size - 1, top: b.top, left: b.left};
    var r = [3, 3];
    var radius = [r, r, r, r];
    var borders = [1,1,1,1].map(function(w) {
        return {color: new Color('#A5A5A5'), width: w};
    });

    var borderPoints = calculateCurvePoints(bounds, radius, borders);

    this.renderer.clip(container.backgroundClip, function() {
        this.renderer.rectangle(bounds.left + 1, bounds.top + 1, bounds.width - 2, bounds.height - 2, new Color("#DEDEDE"));
        this.renderer.renderBorders(calculateBorders(borders, bounds, borderPoints, radius));
        if (container.node.checked) {
            this.renderer.font(new Color('#424242'), 'normal', 'normal', 'bold', (size - 3) + "px", 'arial');
            this.renderer.text("\u2714", bounds.left + size / 6, bounds.top + size - 1);
        }
    }, this, container);
};

NodeParser.prototype.paintRadio = function(container) {
    var bounds = container.parseBounds();

    var size = Math.min(bounds.width, bounds.height) - 2;

    this.renderer.clip(container.backgroundClip, function() {
        this.renderer.circleStroke(bounds.left + 1, bounds.top + 1, size, new Color('#DEDEDE'), 1, new Color('#A5A5A5'));
        if (container.node.checked) {
            this.renderer.circle(Math.ceil(bounds.left + size / 4) + 1, Math.ceil(bounds.top + size / 4) + 1, Math.floor(size / 2), new Color('#424242'));
        }
    }, this, container);
};

var getPropertyValue = function(container, propertyName, placeholderRules) {
    if (!placeholderRules) {
        return container.css(propertyName);
    }

    for (var i = placeholderRules.length - 1; i >= 0; i--) {
        var value = placeholderRules[i].style[propertyName];
        if (value) {
            return value;
        }
    }

    return container.css(propertyName);
};

NodeParser.prototype.paintIntrinsicTextNode = function(container, value, canHavePlaceholder, isOutside) {
    var isPlaceholder = canHavePlaceholder ? container.isPlaceholderShown() : false;
    if (value.length > 0) {
        var document = container.node.ownerDocument;
        var wrapper = document.createElement('html2canvaswrapper');
        var properties = [
            'lineHeight', 'textAlign', 'fontFamily', 'fontWeight', 'fontSize', 'color',
            'paddingLeft', 'paddingTop', 'paddingRight', 'paddingBottom',
            'width', 'height', 'borderLeftStyle', 'borderTopStyle', 'borderLeftWidth', 'borderTopWidth',
            'boxSizing', 'whiteSpace', 'wordWrap'
        ];
        var lenProperties = properties.length;
        var placeholderRules = isPlaceholder ? getMatchingRules(container.node, /::placeholder|::-webkit-input-placeholder|::?-moz-placeholder|:-ms-input-placeholder/) : null;

        for (var i = 0; i < lenProperties; i++) {
            var property = properties[i];
            try {
                wrapper.style[property] = getPropertyValue(container, property, placeholderRules);
            } catch(e) {
                // Older IE has issues with "border"
                log("html2canvas: Parse: Exception caught in renderFormValue: " + e.message);
            }
        }

        var bounds = container.parseBounds();

        wrapper.style.position = "fixed";
        wrapper.style.top = bounds.top + "px";

        if (isOutside) {
            // paint the text outside the box, i.e., right-aligned to the left of the box
            wrapper.style.left = 'auto';
            var windowWidth = window.innerWidth || document.documentElement.clientWidth;
            wrapper.style.right = (windowWidth - bounds.left + 4) + "px";
            wrapper.style.textAlign = 'right';
        } else {
            wrapper.style.left = bounds.left + "px";
        }

        wrapper.textContent = value;

        if (wrapper.style.lineHeight === 'normal') {
            wrapper.style.lineHeight = container.computedStyles.height;
        }

        document.body.appendChild(wrapper);
        this.paintText(new TextContainer(wrapper.firstChild, new NodeContainer(wrapper, container)));
        document.body.removeChild(wrapper);
    }
};

NodeParser.prototype.paintFormValue = function(container) {
    var value = container.getValue();
    this.paintIntrinsicTextNode(container, container.getValue(), true, false);
};

NodeParser.prototype.getParentOfType = function(container, parentTypes) {
    var parent = container.parent;

    while (parentTypes.indexOf(parent.node.tagName) < 0) {
        parent = parent.parent;
        if (!parent) {
            return null;
        }
    }

    return parent;
};

NodeParser.prototype.getParentNodeOfType = function(node, parentTypes) {
    var parent = node.parentNode;

    while (parentTypes.indexOf(parent.tagName) < 0) {
        parent = parent.parentNode;
        if (!parent) {
            return null;
        }
    }

    return parent;
};

NodeParser.prototype.paintListItem = function(container) {
    var isOutside = container.css("listStylePosition") === "outside";
    if (container.listStyleImage && container.listStyleImage.method !== "none") {
        // image enumeration symbol
        this.renderer.renderListStyleImage(container, container.parseBounds(), isOutside);
    } else {
        // textual enumeration symbol/number

        // find the parent OL/UL
        var listTypes = ["OL", "UL"];
        var listContainer = this.getParentOfType(container, listTypes);

        if (listContainer) {
            // compute the enumeration number
            var value = 1;
            var start = listContainer && listContainer.node.getAttribute("start");
            if (start !== null) {
                value = parseInt(start, 10);
            }
            
            var listItems = listContainer.node.querySelectorAll("li");
            var lenListItems = listItems.length;
            for (var i = 0; i < lenListItems; i++) {
                var li = listItems[i];
                if (container.node === li) {
                    break;
                }
                if (this.getParentNodeOfType(li, listTypes) === listContainer.node) {
                    ++value;
                }
            }

            // paint the text
            this.paintIntrinsicTextNode(container, ListStyleTypeFormatter.format(value, container.css("listStyleType")), false, isOutside);
        }
    }
};

NodeParser.prototype.paintText = function(container) {
    container.applyTextTransform();
    var characters = punycode.ucs2.decode(container.node.data);
    var wordRendering = (!this.options.letterRendering || noLetterSpacing(container)) && !hasUnicode(container.node.data);
    var textList = wordRendering ? getWords(characters) : characters.map(function(character) {
        return punycode.ucs2.encode([character]);
    });
    if (!wordRendering) {
        container.parent.node.style.fontVariantLigatures = 'none';
    }

    var weight = container.parent.fontWeight();
    var size = container.parent.css('fontSize');
    var family = container.parent.css('fontFamily');
    var shadows = container.parent.parseTextShadows();

    this.renderer.font(container.parent.color('color'), container.parent.css('fontStyle'), container.parent.css('fontVariant'), weight, size, family);
    if (shadows.length) {
        // TODO: support multiple text shadows
        // TODO: comment this out once "renderTextShadow" works correctly
        this.renderer.fontShadow(shadows[0].color, shadows[0].offsetX, shadows[0].offsetY, shadows[0].blur);
    } else {
        this.renderer.clearShadow();
    }

    this.renderer.clip(container.parent.clip, function() {
        textList.map(this.parseTextBounds(container), this).forEach(function(bounds, index) {
            if (bounds) {
                // https://github.com/niklasvh/html2canvas/pull/908/commits/8a05595ecd2b437694fd54005639f397fb8bafc1
                // MCH: TODO: renderTextShadow doesn't work with letter-spacing
                //if (shadows.length) {
                //    this.renderer.renderTextShadow(textList[index], bounds, shadows);
                //} else {
                this.renderer.text(textList[index], bounds.left, bounds.bottom);
                //}
                this.renderTextDecoration(container.parent, bounds, this.fontMetrics.getMetrics(family, size));
            }
        }, this);
    }, this, container.parent);
};

NodeParser.prototype.renderTextDecoration = function(container, bounds, metrics) {
    switch(container.css("textDecoration").split(" ")[0]) {
    case "underline":
        // Draws a line at the baseline of the font
        // TODO As some browsers display the line as more than 1px if the font-size is big, need to take that into account both in position and size
        this.renderer.rectangle(bounds.left, Math.round(bounds.top + metrics.baseline + metrics.lineWidth), bounds.width, 1, container.color("color"));
        break;
    case "overline":
        this.renderer.rectangle(bounds.left, Math.round(bounds.top), bounds.width, 1, container.color("color"));
        break;
    case "line-through":
        // TODO try and find exact position for line-through
        this.renderer.rectangle(bounds.left, Math.ceil(bounds.top + metrics.middle + metrics.lineWidth), bounds.width, 1, container.color("color"));
        break;
    }
};

var borderColorTransforms = {
    inset: [
        ["darken", 0.60],
        ["darken", 0.10],
        ["darken", 0.10],
        ["darken", 0.60]
    ]
};

NodeParser.prototype.parseBorders = function(container) {
    var nodeBounds = container.parseBounds();
    var radius = getBorderRadiusData(container);
    var borders = ["Top", "Right", "Bottom", "Left"].map(function(side, index) {
        var style = container.css('border' + side + 'Style');
        var color = container.color('border' + side + 'Color');
        if (style === "inset" && color.isBlack()) {
            color = new Color([255, 255, 255, color.a]); // this is wrong, but
        }
        var colorTransform = borderColorTransforms[style] ? borderColorTransforms[style][index] : null;
        return {
            width: container.cssInt('border' + side + 'Width'),
            color: colorTransform ? color[colorTransform[0]](colorTransform[1]) : color,
            style: style,
            pathArgs: null,
            args: null
        };
    });
    var borderPoints = calculateCurvePoints(nodeBounds, radius, borders);

    return {
        clip: this.parseBackgroundClip(container, borderPoints, borders, radius, nodeBounds),
        borders: calculateBorders(borders, nodeBounds, borderPoints, radius)
    };
};

function calculateBorders(borders, nodeBounds, borderPoints, radius) {
    var pathBounds = {
        top: nodeBounds.top + borders[0].width/2,
        right: nodeBounds.right - borders[1].width/2,
        bottom: nodeBounds.bottom - borders[2].width/2,
        left: nodeBounds.left + borders[3].width/2
    };
    return borders.map(function(border, borderSide) {
        if (border.width > 0) {
            var bx = nodeBounds.left;
            var by = nodeBounds.top;
            var bw = nodeBounds.width;
            var bh = nodeBounds.height - (borders[2].width);

            switch(borderSide) {
            case 0:
                // top border
                bh = borders[0].width;
                border.args = drawSide({
                        c1: [bx, by],
                        c2: [bx + bw, by],
                        c3: [bx + bw - borders[1].width, by + bh],
                        c4: [bx + borders[3].width, by + bh]
                    }, radius[0], radius[1],
                    borderPoints.topLeftOuter, borderPoints.topLeftInner, borderPoints.topRightOuter, borderPoints.topRightInner);
                border.pathArgs = drawSidePath({
                        c1: [pathBounds.left, pathBounds.top],
                        c2: [pathBounds.right, pathBounds.top]
                    }, radius[0], radius[1],
                    borderPoints.topLeft, borderPoints.topRight);
                break;
            case 1:
                // right border
                bx = nodeBounds.left + nodeBounds.width - (borders[1].width);
                bw = borders[1].width;

                border.args = drawSide({
                        c1: [bx + bw, by],
                        c2: [bx + bw, by + bh + borders[2].width],
                        c3: [bx, by + bh],
                        c4: [bx, by + borders[0].width]
                    }, radius[1], radius[2],
                    borderPoints.topRightOuter, borderPoints.topRightInner, borderPoints.bottomRightOuter, borderPoints.bottomRightInner);
                border.pathArgs = drawSidePath({
                        c1: [pathBounds.right, pathBounds.top],
                        c2: [pathBounds.right, pathBounds.bottom]
                    }, radius[1], radius[2],
                    borderPoints.topRight, borderPoints.bottomRight);
                break;
            case 2:
                // bottom border
                by = (by + nodeBounds.height) - (borders[2].width);
                bh = borders[2].width;
                border.args = drawSide({
                        c1: [bx + bw, by + bh],
                        c2: [bx, by + bh],
                        c3: [bx + borders[3].width, by],
                        c4: [bx + bw - borders[3].width, by]
                    }, radius[2], radius[3],
                    borderPoints.bottomRightOuter, borderPoints.bottomRightInner, borderPoints.bottomLeftOuter, borderPoints.bottomLeftInner);
                border.pathArgs = drawSidePath({
                        c1: [pathBounds.right, pathBounds.bottom],
                        c2: [pathBounds.left, pathBounds.bottom]
                    }, radius[2], radius[3],
                    borderPoints.bottomRight, borderPoints.bottomLeft);
                break;
            case 3:
                // left border
                bw = borders[3].width;
                border.args = drawSide({
                        c1: [bx, by + bh + borders[2].width],
                        c2: [bx, by],
                        c3: [bx + bw, by + borders[0].width],
                        c4: [bx + bw, by + bh]
                    }, radius[3], radius[0],
                    borderPoints.bottomLeftOuter, borderPoints.bottomLeftInner, borderPoints.topLeftOuter, borderPoints.topLeftInner);
                border.pathArgs = drawSidePath({
                        c1: [pathBounds.left, pathBounds.bottom],
                        c2: [pathBounds.left, pathBounds.top]
                    }, radius[3], radius[0],
                    borderPoints.bottomLeft, borderPoints.topLeft);
                break;
            }
        }
        return border;
    });
}

NodeParser.prototype.parseBackgroundClip = function(container, borderPoints, borders, radius, bounds) {
    var backgroundClip = container.css('backgroundClip'),
        borderArgs = [];

    switch(backgroundClip) {
    case "content-box":
    case "padding-box":
        parseCorner(borderArgs, radius[0], radius[1], borderPoints.topLeftInner, borderPoints.topRightInner, bounds.left + borders[3].width, bounds.top + borders[0].width);
        parseCorner(borderArgs, radius[1], radius[2], borderPoints.topRightInner, borderPoints.bottomRightInner, bounds.left + bounds.width - borders[1].width, bounds.top + borders[0].width);
        parseCorner(borderArgs, radius[2], radius[3], borderPoints.bottomRightInner, borderPoints.bottomLeftInner, bounds.left + bounds.width - borders[1].width, bounds.top + bounds.height - borders[2].width);
        parseCorner(borderArgs, radius[3], radius[0], borderPoints.bottomLeftInner, borderPoints.topLeftInner, bounds.left + borders[3].width, bounds.top + bounds.height - borders[2].width);
        break;

    default:
        parseCorner(borderArgs, radius[0], radius[1], borderPoints.topLeftOuter, borderPoints.topRightOuter, bounds.left, bounds.top);
        parseCorner(borderArgs, radius[1], radius[2], borderPoints.topRightOuter, borderPoints.bottomRightOuter, bounds.left + bounds.width, bounds.top);
        parseCorner(borderArgs, radius[2], radius[3], borderPoints.bottomRightOuter, borderPoints.bottomLeftOuter, bounds.left + bounds.width, bounds.top + bounds.height);
        parseCorner(borderArgs, radius[3], radius[0], borderPoints.bottomLeftOuter, borderPoints.topLeftOuter, bounds.left, bounds.top + bounds.height);
        break;
    }

    return borderArgs;
};

function getCurvePoints(x, y, r1, r2) {
    var kappa = 4 * ((Math.sqrt(2) - 1) / 3);
    var ox = (r1) * kappa, // control point offset horizontal
        oy = (r2) * kappa, // control point offset vertical
        xm = x + r1, // x-middle
        ym = y + r2; // y-middle
    return {
        topLeft: bezierCurve({x: x, y: ym}, {x: x, y: ym - oy}, {x: xm - ox, y: y}, {x: xm, y: y}),
        topRight: bezierCurve({x: x, y: y}, {x: x + ox,y: y}, {x: xm, y: ym - oy}, {x: xm, y: ym}),
        bottomRight: bezierCurve({x: xm, y: y}, {x: xm, y: y + oy}, {x: x + ox, y: ym}, {x: x, y: ym}),
        bottomLeft: bezierCurve({x: xm, y: ym}, {x: xm - ox, y: ym}, {x: x, y: y + oy}, {x: x, y:y})
    };
}

function calculateCurvePoints(bounds, borderRadius, borders) {
    var x = bounds.left,
        y = bounds.top,
        width = bounds.width,
        height = bounds.height;

    // https://www.w3.org/TR/css3-background/#corner-overlap:
    // Corner curves must not overlap: When the sum of any two adjacent border radii exceeds
    // the size of the border box, UAs must proportionally reduce the used values of all border
    // radii until none of them overlap. The algorithm for reducing radii is as follows:
    // Let f = min(L_i/S_i), where i ∈ {top, right, bottom, left}, S_i is the sum of the two
    // corresponding radii of the corners on side i, and L_top = L_bottom = the width of the box,
    // and L_left = L_right = the height of the box.
    // If f < 1, then all corner radii are reduced by multiplying them by f.

    var f = Math.min(
        1,
        width / (borderRadius[0][0] + borderRadius[1][0]),
        height / (borderRadius[1][borderRadius[1][1] === undefined ? 0 : 1] + borderRadius[2][borderRadius[2][1] === undefined ? 0 : 1]),
        width / (borderRadius[2][0] + borderRadius[3][0]),
        height / (borderRadius[3][borderRadius[3][1] === undefined ? 0 : 1] + borderRadius[0][borderRadius[0][1] === undefined ? 0 : 1]));

    var h = [],
        v = [];

    for (var i = 0; i < 4; i++) {
        if (borderRadius[0][1] === undefined) {
            var a = f * borderRadius[i][0];
            h.push(a);
            v.push(a);
        } else {
            h.push(f * borderRadius[i][0]);
            v.push(f * borderRadius[i][1]);
        }
    }

    var topWidth = width - h[1],
        rightHeight = height - v[2],
        bottomWidth = width - h[2],
        leftHeight = height - v[3];

    return {
        topLeft: getCurvePoints(x + borders[3].width/2, y + borders[0].width/2, Math.max(0, h[0] - borders[3].width/2), Math.max(0, v[0] - borders[0].width/2)).topLeft.subdivide(0.5),
        topRight: getCurvePoints(x + Math.min(topWidth, width + borders[3].width/2), y + borders[0].width/2, (topWidth > width + borders[3].width/2) ? 0 : h[1] - borders[3].width/2, v[1] - borders[0].width/2).topRight.subdivide(0.5),
        bottomRight: getCurvePoints(x + Math.min(bottomWidth, width - borders[3].width/2), y + Math.min(rightHeight, height + borders[0].width/2), Math.max(0, h[2] - borders[1].width/2),  v[2] - borders[2].width/2).bottomRight.subdivide(0.5),
        bottomLeft: getCurvePoints(x + borders[3].width/2, y + leftHeight, Math.max(0, h[3] - borders[3].width/2), v[3] - borders[2].width/2).bottomLeft.subdivide(0.5),

        topLeftOuter: getCurvePoints(x, y, h[0], v[0]).topLeft.subdivide(0.5),
        topLeftInner: getCurvePoints(x + borders[3].width, y + borders[0].width, Math.max(0, h[0] - borders[3].width), Math.max(0, v[0] - borders[0].width)).topLeft.subdivide(0.5),
        topRightOuter: getCurvePoints(x + topWidth, y, h[1], v[1]).topRight.subdivide(0.5),
        topRightInner: getCurvePoints(x + Math.min(topWidth, width + borders[3].width), y + borders[0].width, (topWidth > width + borders[3].width) ? 0 :h[1] - borders[3].width, v[1] - borders[0].width).topRight.subdivide(0.5),
        bottomRightOuter: getCurvePoints(x + bottomWidth, y + rightHeight, h[2], v[2]).bottomRight.subdivide(0.5),
        bottomRightInner: getCurvePoints(x + Math.min(bottomWidth, width - borders[3].width), y + Math.min(rightHeight, height + borders[0].width), Math.max(0, h[2] - borders[1].width),  v[2] - borders[2].width).bottomRight.subdivide(0.5),
        bottomLeftOuter: getCurvePoints(x, y + leftHeight, h[3], v[3]).bottomLeft.subdivide(0.5),
        bottomLeftInner: getCurvePoints(x + borders[3].width, y + leftHeight, Math.max(0, h[3] - borders[3].width), v[3] - borders[2].width).bottomLeft.subdivide(0.5)
    };
}

function bezierCurve(start, startControl, endControl, end) {
    var lerp = function (a, b, t) {
        return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t
        };
    };

    return {
        start: start,
        startControl: startControl,
        endControl: endControl,
        end: end,
        subdivide: function(t) {
            var ab = lerp(start, startControl, t),
                bc = lerp(startControl, endControl, t),
                cd = lerp(endControl, end, t),
                abbc = lerp(ab, bc, t),
                bccd = lerp(bc, cd, t),
                dest = lerp(abbc, bccd, t);
            return [bezierCurve(start, ab, abbc, dest), bezierCurve(dest, bccd, cd, end)];
        },
        curveTo: function(borderArgs) {
            borderArgs.push(["bezierCurve", startControl.x, startControl.y, endControl.x, endControl.y, end.x, end.y]);
        },
        curveToReversed: function(borderArgs) {
            borderArgs.push(["bezierCurve", endControl.x, endControl.y, startControl.x, startControl.y, start.x, start.y]);
        }
    };
}

function drawSide(borderData, radius1, radius2, outer1, inner1, outer2, inner2) {
    var borderArgs = [];

    if (radius1[0] > 0 || radius1[1] > 0) {
        borderArgs.push(["line", outer1[1].start.x, outer1[1].start.y]);
        outer1[1].curveTo(borderArgs);
    } else {
        borderArgs.push([ "line", borderData.c1[0], borderData.c1[1]]);
    }

    if (radius2[0] > 0 || radius2[1] > 0) {
        borderArgs.push(["line", outer2[0].start.x, outer2[0].start.y]);
        outer2[0].curveTo(borderArgs);
        borderArgs.push(["line", inner2[0].end.x, inner2[0].end.y]);
        inner2[0].curveToReversed(borderArgs);
    } else {
        borderArgs.push(["line", borderData.c2[0], borderData.c2[1]]);
        borderArgs.push(["line", borderData.c3[0], borderData.c3[1]]);
    }

    if (radius1[0] > 0 || radius1[1] > 0) {
        borderArgs.push(["line", inner1[1].end.x, inner1[1].end.y]);
        inner1[1].curveToReversed(borderArgs);
    } else {
        borderArgs.push(["line", borderData.c4[0], borderData.c4[1]]);
    }

    return borderArgs;
}

function drawSidePath(borderData, radius1, radius2, curve1, curve2) {
    var borderArgs = [];
    if (radius1[0] > 0 || radius1[1] > 0) {
        borderArgs.push(["line", curve1[1].start.x, curve1[1].start.y]);
        curve1[1].curveTo(borderArgs);
    } else {
        borderArgs.push([ "line", borderData.c1[0], borderData.c1[1]]);
    }
    if (radius2[0] > 0 || radius2[1] > 0) {
        borderArgs.push(["line", curve2[0].start.x, curve2[0].start.y]);
        curve2[0].curveTo(borderArgs);
    } else {
        borderArgs.push([ "line", borderData.c2[0], borderData.c2[1]]);
    }

    return borderArgs;
}

function parseCorner(borderArgs, radius1, radius2, corner1, corner2, x, y) {
    if (radius1[0] > 0 || radius1[1] > 0) {
        borderArgs.push(["line", corner1[0].start.x, corner1[0].start.y]);
        corner1[0].curveTo(borderArgs);
        corner1[1].curveTo(borderArgs);
    } else {
        borderArgs.push(["line", x, y]);
    }

    if (radius2[0] > 0 || radius2[1] > 0) {
        borderArgs.push(["line", corner2[0].start.x, corner2[0].start.y]);
    }
}

function negativeZIndex(container) {
    return container.cssInt("zIndex") < 0;
}

function positiveZIndex(container) {
    return container.cssInt("zIndex") > 0;
}

function zIndex0(container) {
    return container.cssInt("zIndex") === 0;
}

function inlineLevel(container) {
    return ["inline", "inline-block", "inline-table"].indexOf(container.css("display")) !== -1;
}

function isStackingContext(container) {
    return (container instanceof StackingContext);
}

function hasText(container) {
    return container.node.data.trim().length > 0;
}

function noLetterSpacing(container) {
    return (/^(normal|none|0px)$/.test(container.parent.css("letterSpacing")));
}

function getBorderRadiusData(container) {
    return ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map(function(side) {
        var value = container.css('border' + side + 'Radius');
        var arr = value.split(" ");

        switch (arr.length) {
        case 0:
            return [0];
        case 1:
            var v = parseFloat(arr[0]);
            if (typeof arr[0] === 'string' && arr[0].charAt(arr[0].length - 1) === '%') {
                return [v / 100 * container.bounds.width, v / 100 * container.bounds.height];
            }
            return [v];
        default:
            return [
                typeof arr[0] === 'string' && arr[0].charAt(arr[0].length - 1) === '%' ? parseFloat(arr[0]) / 100 * container.bounds.width : parseFloat(arr[0]),
                typeof arr[1] === 'string' && arr[1].charAt(arr[1].length - 1) === '%' ? parseFloat(arr[1]) / 100 * container.bounds.height : parseFloat(arr[1])
            ];
        }
    });
}

function renderableNode(node) {
    return (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE);
}

function isPositionedForStacking(container, hasSiblingWithOwnStacking) {
    var position = container.css("position");
    var isNonStaticPosition = ["absolute", "relative", "fixed"].indexOf(position) !== -1;

    // MCH -->
    if (hasSiblingWithOwnStacking) {
        // if container has a sibling with its own stacking, always create an own
        // stacking context for this container if the node is positioned non-statically
        return isNonStaticPosition;
    }
    // <--

    var zIndex = isNonStaticPosition ? container.css("zIndex") : "auto";
    return zIndex !== "auto";
}

function isPositioned(container) {
    return container.css("position") !== "static";
}

function isFloating(container) {
    return container.css("float") !== "none";
}

function isInlineBlock(container) {
    return ["inline-block", "inline-table"].indexOf(container.css("display")) !== -1;
}

function not(callback) {
    var context = this;
    return function() {
        return !callback.apply(context, arguments);
    };
}

function isElement(container) {
    return container.node.nodeType === Node.ELEMENT_NODE;
}

function isPseudoElement(container) {
    return container.isPseudoElement === true;
}

function isTextNode(container) {
    return container.node.nodeType === Node.TEXT_NODE;
}

function zIndexSort(contexts) {
    return function(a, b) {
        return (a.cssInt("zIndex") + (contexts.indexOf(a) / contexts.length)) - (b.cssInt("zIndex") + (contexts.indexOf(b) / contexts.length));
    };
}

function hasOpacity(container) {
    return container.getOpacity() < 1;
}

function getWidth(border) {
    return border.width;
}

function nonIgnoredElement(nodeContainer) {
    return (nodeContainer.node.nodeType !== Node.ELEMENT_NODE || ["SCRIPT", "HEAD", "TITLE", "OBJECT", "BR", "OPTION"].indexOf(nodeContainer.node.nodeName) === -1);
}

function flatten(arrays) {
    return [].concat.apply([], arrays);
}

/*
function stripQuotes(content) {
    var first = content.substr(0, 1);
    return (first === content.substr(content.length - 1) && first.match(/'|"/)) ? content.substr(1, content.length - 2) : content;
}*/

function getWords(characters) {
    var words = [], i = 0, onWordBoundary = false, word;
    while(characters.length) {
        if (isWordBoundary(characters[i]) === onWordBoundary) {
            word = characters.splice(0, i);
            if (word.length) {
                words.push(punycode.ucs2.encode(word));
            }
            onWordBoundary =! onWordBoundary;
            i = 0;
        } else {
            i++;
        }

        if (i >= characters.length) {
            word = characters.splice(0, i);
            if (word.length) {
                words.push(punycode.ucs2.encode(word));
            }
        }
    }
    return words;
}

function isWordBoundary(characterCode) {
    return [
        32, // <space>
        13, // \r
        10, // \n
        9, // \t
        45 // -
    ].indexOf(characterCode) !== -1;
}

function hasUnicode(string) {
    return (/[^\u0000-\u00ff]/).test(string);
}

module.exports = NodeParser;
